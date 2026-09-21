import { NextResponse } from 'next/server';
import { db, type Db } from '@/db';
import { canAccess, currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { notifyShiftClosed, notifyShiftOpened } from '@/lib/notify';
import { salesByMethod, salesCashPortion } from '@/lib/pay-methods';

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
      .prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales WHERE ${where}`)
      .get(...args)) as { c: number; t: number }
  );
  // Kas tunai & per-metode: baris mixed (sales.pay_split, fitur 3)
  // diperluas per bagian — kasir menyetor bagian tunainya, bukan total.
  const [cash_total, by_method] = await Promise.all([
    salesCashPortion(d, where, args),
    salesByMethod(d, where, args),
  ]);
  return {
    sales_count: cnt.c,
    sales_total: cnt.t,
    cash_total,
    by_method,
  };
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  // Tier 'shift' (admin, manajer, kasir). Non-manager hanya melihat shiftnya
  // sendiri (ditangani query di bawah).
  if (!canAccess(user, 'shift'))
    return NextResponse.json({ error: 'Hanya admin/manajer/kasir' }, { status: 403 });
  const url = new URL(req.url);

  if (url.searchParams.get('current') === '1') {
    const d = await db();
    const open = (await d
      .prepare(`SELECT * FROM shifts WHERE kasir_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`)
      .get(user.id)) as ShiftRow | undefined;
    if (open) {
      const stats = await windowStats(d, open.kasir_id, open.start_time);
      return NextResponse.json({ open: { ...enrich(open), ...stats } });
    }
    return NextResponse.json({ open: null });
  }

  const d = await db();
  const where = isManager(user) ? `1=1` : `s.kasir_id = ?`;
  const args: unknown[] = isManager(user) ? [] : [user.id];
  // Daftar shift tertutup: 50 per halaman + ?offset= (dulu 200 tanpa paging
  // = 200 baris per load; plus N+1 nama kasir -> see below).
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const rows = (
    (await d
      .prepare(
        `SELECT s.* FROM shifts s WHERE ${where} AND s.status = 'closed' ORDER BY s.end_time DESC LIMIT ? OFFSET ?`
      )
      .all(...args, limit, offset)) as ShiftRow[]
  );
  // Batch N+1: dulu 1 query users PER shift (hingga 200 round-trip Turso).
  // Sekarang 1 query IN (...) utk semua kasir_id unik pada halaman ini.
  const ph = (n: number) => Array(n).fill('?').join(', ');
  const kasirIds = [...new Set(rows.map((r) => r.kasir_id).filter((v): v is number => !!v))];
  const kasirRows = kasirIds.length
    ? ((await d
        .prepare(`SELECT id, username, display_name FROM users WHERE id IN (${ph(kasirIds.length)})`)
        .all(...kasirIds)) as { id: number; username: string; display_name: string }[])
    : [];
  const kasirMap = new Map<number, { username: string; display_name: string }>();
  for (const u of kasirRows) kasirMap.set(u.id, u);
  const shifts = rows.map((r) => {
    const k = r.kasir_id ? kasirMap.get(r.kasir_id) : undefined;
    return enrich(r, k ? k.display_name || k.username : '');
  });
  const openMine = (await d
    .prepare(`SELECT * FROM shifts WHERE kasir_id = ? AND status = 'open'`)
    .all(user.id)) as ShiftRow[];
  return NextResponse.json({ shifts, open: openMine.length ? openMine[0] : null, limit, offset });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'shift'))
    return NextResponse.json({ error: 'Hanya admin/manajer/kasir' }, { status: 403 });
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
  const label = String(b.label || '').trim();
  const info = await d
    .prepare(`INSERT INTO shifts (kasir_id, label, status, start_time) VALUES (?, ?, 'open', ?)`)
    .run(user.id, label, now);
  const newId = Number(info.lastInsertRowid);
  await logAudit(user, 'shift:open', 'shifts', newId, undefined, { start_time: now });
  try {
    await notifyShiftOpened(newId, label, user.display_name || user.username);
  } catch (e) {
    console.warn('[notify] pemicu shift open gagal:', e);
  }
  return NextResponse.json({ ok: true, id: newId, start_time: now });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'shift'))
    return NextResponse.json({ error: 'Hanya admin/manajer/kasir' }, { status: 403 });
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
  try {
    await notifyShiftClosed(
      id,
      kasir ? kasir.display_name || kasir.username : '',
      stats.sales_count,
      stats.sales_total
    );
  } catch (e) {
    console.warn('[notify] pemicu shift close gagal:', e);
  }
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