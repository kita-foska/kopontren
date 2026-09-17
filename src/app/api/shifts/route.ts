import { NextResponse } from 'next/server';
import { db, type Db } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

type ShiftRow = {
  id: number;
  kasir_id: number;
  label: string;
  status: string;
  start_time: string;
  end_time: string | null;
  sales_count: number;
  sales_total: number;
  cash_total: number;
  by_method: string;
};

function enrich(r: ShiftRow, kasir_name?: string) {
  let byMethod: Record<string, number> = {};
  try {
    byMethod = JSON.parse(r.by_method || '{}');
  } catch {
    /* keep empty */
  }
  return { ...r, kasir_name: kasir_name ?? '', by_method: byMethod };
}

/** Stats for a time window [from, to) for a specific cashier: count, total, cash total & per-method. */
async function windowStats(d: Db, kasirId: number, from: string, to?: string) {
  const where = to
    ? 'kasir_id = ? AND created_at >= ? AND created_at < ?'
    : 'kasir_id = ? AND created_at >= ?';
  const args: (string | number)[] = to ? [kasirId, from, to] : [kasirId, from];
  const cnt = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(total),0) t,
              COALESCE(SUM(CASE WHEN pay_method = 'cash' THEN total ELSE 0 END),0) cash
       FROM sales WHERE ${where}`
      )
      .get(...args)) as { c: number; t: number; cash: number }
  );
  const methods = (
    (await d
      .prepare(
        `SELECT pay_method m, COALESCE(SUM(total),0) t FROM sales WHERE ${where} GROUP BY pay_method`
      )
      .all(...args)) as { m: string; t: number }[]
  );
  return {
    sales_count: cnt.c,
    sales_total: cnt.t,
    cash_total: cnt.cash,
    by_method: Object.fromEntries(methods.map((x) => [x.m, x.t])),
  };
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const url = new URL(req.url);
  const d = await db();
  const kasirStmt = d.prepare('SELECT username, display_name FROM users WHERE id = ?');

  if (url.searchParams.get('current') === '1') {
    const open = (await d
      .prepare(`SELECT * FROM shifts WHERE kasir_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`)
      .get(user.id)) as ShiftRow | undefined;
    if (open) {
      const stats = await windowStats(d, open.kasir_id, open.start_time);
      return NextResponse.json({ open: { ...enrich(open), ...stats } });
    }
    return NextResponse.json({ open: null });
  }

  const where = isManager(user) ? `1=1` : `s.kasir_id = ?`;
  const args: unknown[] = isManager(user) ? [] : [user.id];
  const rows = (
    (await d
      .prepare(
        `SELECT s.* FROM shifts s WHERE ${where} AND s.status = 'closed' ORDER BY s.end_time DESC LIMIT 200`
      )
      .all(...args)) as ShiftRow[]
  );
  const shifts = await Promise.all(
    rows.map(async (r) => {
      const kasir = r.kasir_id
        ? ((await kasirStmt.get(r.kasir_id)) as { username: string; display_name: string })
        : null;
      return enrich(r, kasir ? kasir.display_name || kasir.username : '');
    })
  );
  const openMine = (await d
    .prepare(`SELECT * FROM shifts WHERE kasir_id = ? AND status = 'open'`)
    .all(user.id)) as ShiftRow[];
  return NextResponse.json({ shifts, open: openMine.length ? openMine[0] : null });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { label?: string };
  const d = await db();
  const open = (await d
    .prepare(`SELECT * FROM shifts WHERE kasir_id = ? AND status = 'open'`)
    .get(user.id)) as ShiftRow | undefined;
  if (open)
    return NextResponse.json(
      { error: 'Anda masih punya shift terbuka #' + open.id + ' - tutup dulu di menu Shift' },
      { status: 409 }
    );
  const now = new Date().toISOString();
  const info = await d
    .prepare(`INSERT INTO shifts (kasir_id, label, status, start_time) VALUES (?, ?, 'open', ?)`)
    .run(user.id, String(b.label || '').trim(), now);
  await logAudit(user, 'shift:open', 'shifts', Number(info.lastInsertRowid), undefined, {
    start_time: now,
  });
  return NextResponse.json({ ok: true, id: Number(info.lastInsertRowid), start_time: now });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: number };
  const id = Number(b.id || 0);
  if (!id) return NextResponse.json({ error: 'id shift tidak valid' }, { status: 400 });
  const d = await db();
  const shift = (await d.prepare('SELECT * FROM shifts WHERE id = ?').get(id)) as
    | ShiftRow
    | undefined;
  if (!shift) return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  if (shift.status !== 'open')
    return NextResponse.json({ error: 'Shift sudah ditutup' }, { status: 400 });
  // Only the cashier themselves or a manager may close.
  if (shift.kasir_id !== user.id && !isManager(user))
    return NextResponse.json(
      { error: 'Hanya kasir yang bersangkutan atau pengurus' },
      { status: 403 }
    );

  const end = new Date().toISOString();
  const stats = await windowStats(d, shift.kasir_id, shift.start_time, end);
  await d
    .prepare(
      `UPDATE shifts SET status = 'closed', end_time = ?, sales_count = ?, sales_total = ?, cash_total = ?, by_method = ? WHERE id = ?`
    )
    .run(
      end,
      stats.sales_count,
      stats.sales_total,
      stats.cash_total,
      JSON.stringify(stats.by_method),
      id
    );
  const kasir = (await d
    .prepare('SELECT username, display_name FROM users WHERE id = ?')
    .get(shift.kasir_id)) as { username: string; display_name: string } | undefined;
  await logAudit(user, 'shift:close', 'shifts', id, shift, { ...stats, end_time: end });
  return NextResponse.json({
    ok: true,
    summary: enrich(
      {
        ...shift,
        status: 'closed',
        end_time: end,
        ...stats,
        by_method: JSON.stringify(stats.by_method),
      },
      kasir ? kasir.display_name || kasir.username : ''
    ),
  });
}