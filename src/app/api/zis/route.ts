/**
 * W2.7 (skema v22) -- API modul ZIS (Sek.8.2):
 * GET /api/zis   = riwayat + total per jenis + flag gl/coop (tier zis, D2).
 *                   `?csv=1` = unduh CSV riwayat (header + escaping kutip).
 * POST /api/zis  = catat in/out per jenis. D1: baris SELALU dicatat;
 *                   auto-jurnal OQ-1 hanya saat gl_enabled='1' (pola W2.1,
 *                   satu tx: zis + jurnal + posted_entry atomik).
 *                   Wakaf = tercatat tanpa jurnal (D3; mapping W3.5).
 * Anti-campur #16 terjaga di builder (lib/zis.ts): 1100 murni, tak campur
 * 1010/1020. D6: baris gl-off tidak di-backfill otomatis.
 */
import { NextResponse } from 'next/server';
import { db, getSettings, tx } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import {
  recordZisInTx,
  ZIS_KINDS,
  zisValidateAmount,
  type ZisDirection,
  type ZisKind,
} from '@/lib/zis';

export const dynamic = 'force-dynamic';

export type ZisRow = {
  id: string;
  kind: string;
  direction: string;
  amount: number;
  payer: string | null;
  occurred_at: string;
  posted_entry: string | null;
  created_by: string | null;
  created_at: string;
};

/** Escape sel CSV: kutip + gandakan kutip dalam (payer bebas teks). */
function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // D2: tier zis = admin + manajer (FEATURE_MATRIX zis).
  if (!canAccess(user, 'zis')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const d = await db();
  const params = new URL(req.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 100));

  // ?csv=1: unduhan teks (bukan JSON) -- pola /api/zakat/history?csv=1.
  if (params.get('csv') === '1') {
    const rows = (await d
      .prepare(
        'SELECT id, kind, direction, amount, payer, occurred_at, posted_entry, created_by, created_at ' +
          'FROM zis ORDER BY occurred_at DESC, created_at DESC LIMIT ?'
      )
      .all(limit)) as ZisRow[];
    const lines = [
      'id,occurred_at,kind,direction,amount,payer,posted_entry,created_by,created_at',
      ...rows.map((r) =>
        [r.id, r.occurred_at, r.kind, r.direction, r.amount, r.payer, r.posted_entry, r.created_by, r.created_at]
          .map(csvCell)
          .join(',')
      ),
    ];
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="zis-history.csv"',
      },
    });
  }

  const rows = (await d
    .prepare(
      'SELECT id, kind, direction, amount, payer, occurred_at, posted_entry, created_by, created_at ' +
        'FROM zis ORDER BY occurred_at DESC, created_at DESC LIMIT ?'
    )
    .all(limit)) as ZisRow[];
  const totals = (await d
    .prepare('SELECT kind, direction, COALESCE(SUM(amount), 0) s, COUNT(*) c FROM zis GROUP BY kind, direction')
    .all()) as { kind: string; direction: string; s: number; c: number }[];
  const settings = await getSettings();
  return NextResponse.json({
    rows,
    totals,
    gl_enabled: settings.gl_enabled === '1',
    coop: settings.coop_registered === '1',
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // D2: tulis operasional (sejajar kas): admin + manajer. Pengurus
  // membaca data ZIS via CALK item 7 (laporan), bukan modul ini.
  if (!canAccess(user, 'zis')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'json body rusak' }, { status: 400 });
  const kind = String(b.kind ?? '').trim() as ZisKind;
  const direction = String(b.direction ?? '').trim() as ZisDirection;
  if (!(ZIS_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'kind harus zakat/infak/sedekah/wakaf' }, { status: 400 });
  }
  if (direction !== 'in' && direction !== 'out') {
    return NextResponse.json({ error: 'direction harus in/out' }, { status: 400 });
  }
  let amount: number;
  try {
    amount = zisValidateAmount(b.amount);
  } catch {
    return NextResponse.json({ error: 'amount harus rupiah integer > 0' }, { status: 400 });
  }
  const payer = b.payer ? String(b.payer).slice(0, 120) : null;
  const occurredIn = b.occurred_at ? String(b.occurred_at) : undefined;
  // occurred_at = ISO WIB (rekon #17; entry_date GL diurutkan leksikografis).
  if (occurredIn && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(occurredIn)) {
    return NextResponse.json(
      { error: 'occurred_at harus ISO WIB (mis. 2026-10-02T15:30:00.000+07:00)' },
      { status: 400 }
    );
  }

  const d = await db();
  const settings = await getSettings();
  const glOn = settings.gl_enabled === '1';
  const id = crypto.randomUUID();
  try {
    const entryId = await tx(d, async () => {
      const r = await recordZisInTx(d, {
        id,
        kind,
        direction,
        amount,
        payer,
        occurred_at: occurredIn,
        created_by: String(user.id),
        gl_enabled: glOn,
      });
      // logAudit di-dalam tx: atomik dgn write ZIS (rollback = audit ikut
      // batal; commit = audit persist bersama).
      await logAudit(user, 'zis:record', 'zis', null, undefined, {
        zis_id: id,
        kind,
        direction,
        amount,
        gl_enabled: glOn,
        entry_id: r.entryId,
      });
      return r.entryId;
    });
    // D6: baris gl-off TIDAK di-backfill otomatis saat gl diaktifkan.
    return NextResponse.json({ ok: true, id, posted: entryId, gl_enabled: glOn });
  } catch (e) {
    return NextResponse.json(
      { error: 'gagal mencatat zis: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    );
  }
}