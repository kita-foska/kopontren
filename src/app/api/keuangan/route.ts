/**
 * FASE A1 — Laba-Rugi Operasional V1: GET /api/keuangan?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Endpoint BARU (keputusan A1): /api/reports sengaja TIDAK disentuh —
 * payload & cache-nya dipakai fitur existing (kartu KPI, modul zakat,
 * dashboard). Periode = hari kalender WIB (konvensi sama dgn
 * /api/reports/csv): from/tengah-malam → to/akhir-hari WIB.
 *
 * Rumus & catatan V1 (retur, COGS, cashback, zakat, konsinyasi,
 * piutang/payable) → src/lib/keuangan.ts (queryKeuangan +
 * KEUANGAN_NOTES; wajib terbaca sebelum mengubah angka).
 *
 * Cache: 'keuangan:<from>:<to>' 60 dtk (ref-cache). Route WRITE tidak
 * memanggil invalidate('keuangan:') — TTL 60 dtk jadi backstop: P&L
 * paling lama basi ~60 dtk pasca-mutasi (pola sama dgn 'reports:').
 * Bila nanti agregat ini dipakai realtime, baris invalidate cukup
 * ditambah di route tulis (belajar pola 'kas:').
 */
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { startOfDayJakarta } from '@/lib/format';
import { cached } from '@/lib/ref-cache';
import { queryKeuangan, KEUANGAN_NOTES } from '@/lib/keuangan';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });

  const url = new URL(req.url);
  const rawFrom = url.searchParams.get('from')?.trim() ?? '';
  const rawTo = url.searchParams.get('to')?.trim() ?? '';
  // Default = 30 hari (selaras /api/reports).
  const from = DAY_RE.test(rawFrom) ? rawFrom : startOfDayJakarta(-29).slice(0, 10);
  const to = DAY_RE.test(rawTo) ? rawTo : startOfDayJakarta(0).slice(0, 10);
  // Guard rentang (rasio sama dgn clamp 'days' /api/reports): >3650 hari
  // = pemicu full-scan Rows Read; tanggal tidak valid (mis. 2026-02-31)
  // → Date.parse NaN → 400.
  const spanDays = Math.round(
    (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000
  );
  if (Number.isNaN(spanDays) || spanDays < 0)
    return NextResponse.json({ error: 'Rentang tanggal tidak valid' }, { status: 400 });
  if (spanDays > 3650)
    return NextResponse.json({ error: 'Maksimal 3650 hari per laporan' }, { status: 400 });

  // 'YYYY-MM-DD' (hari kalender WIB) → batas ISO tengah-malam / akhir-hari
  // WIB (bukan UTC — UTC midnight = 07:00 WIB, meleset ±7 jam).
  const fromIso = new Date(from + 'T00:00:00+07:00').toISOString();
  const toIso = new Date(to + 'T23:59:59.999+07:00').toISOString();

  const payload = await cached('keuangan:' + from + ':' + to, async () => {
    const d = await db();
    const p = await queryKeuangan(d, fromIso, toIso);
    return { ok: true, from, to, ...p, notes: KEUANGAN_NOTES };
  });
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
