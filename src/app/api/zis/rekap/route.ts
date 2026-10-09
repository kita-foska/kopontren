/**
 * P3b -- ZIS Rekap (baca-only): GET /api/zis/rekap.
 * Agregasi by_kind + per-bulan + saldo COA 2090 (lib/zis-rekap.ts;
 * diuji scripts/test-zis.ts Z8). Tier zis (D2: admin + manajer),
 * sama dgn /api/zis. `?from`/`?to` = ISO-WIB atau 'YYYY-MM-DD'
 * (dinormalisasi tengah-malam WIB); from inklusif, to eksklusif;
 * default = seluruh periode. c2090 selalu all-time (invariant OQ-1).
 */
import { NextResponse } from 'next/server';
import { db, getSettings } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { buildZisRekap } from '@/lib/zis-rekap';

export const dynamic = 'force-dynamic';

/** ISO-WIB (subset format zis.occurred_at / entry_date GL). */
const ISO_WIB = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?(\+07:00)?)?$/;

/** 'YYYY-MM-DD' -> tengah-malam WIB; ISO-WIB lolos apa adanya;
 * null/'' -> null (periode kosong); format lain -> 'invalid' (400). */
function normalizeBoundary(raw: string | null): string | null | 'invalid' {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + 'T00:00:00.000+07:00';
  if (ISO_WIB.test(raw)) return raw;
  return 'invalid';
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // D2: tier zis = admin + manajer (FEATURE_MATRIX zis) -- sama /api/zis.
  if (!canAccess(user, 'zis')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const fromN = normalizeBoundary(params.get('from'));
  const toN = normalizeBoundary(params.get('to'));
  if (fromN === 'invalid') {
    return NextResponse.json(
      { error: "from harus ISO-WIB (mis. 2026-10-01T00:00:00.000+07:00) atau YYYY-MM-DD" },
      { status: 400 }
    );
  }
  if (toN === 'invalid') {
    return NextResponse.json({ error: "to harus ISO-WIB atau YYYY-MM-DD" }, { status: 400 });
  }
  if (fromN && toN && fromN >= toN) {
    return NextResponse.json({ error: "from harus < to" }, { status: 400 });
  }

  const d = await db();
  const payload = await buildZisRekap(d, fromN, toN);
  const settings = await getSettings();
  return NextResponse.json({ ...payload, gl_enabled: settings.gl_enabled === '1' });
}
