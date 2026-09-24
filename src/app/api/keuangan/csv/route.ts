/**
 * FASE A1 — Export CSV Laba-Rugi V1 (statement per periode, BUKAN detail
 * item penjualan — itu domain /api/reports/csv). Pola guard sama
 * (login + tier 'laporan' + clamp rentang).
 */
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { startOfDayJakarta } from '@/lib/format';
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
  const from = DAY_RE.test(rawFrom) ? rawFrom : startOfDayJakarta(-29).slice(0, 10);
  const to = DAY_RE.test(rawTo) ? rawTo : startOfDayJakarta(0).slice(0, 10);
  const spanDays = Math.round(
    (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000
  );
  if (Number.isNaN(spanDays) || spanDays < 0)
    return NextResponse.json({ error: 'Rentang tanggal tidak valid' }, { status: 400 });
  if (spanDays > 3650)
    return NextResponse.json({ error: 'Maksimal 3650 hari per laporan' }, { status: 400 });

  const fromIso = new Date(from + 'T00:00:00+07:00').toISOString();
  const toIso = new Date(to + 'T23:59:59.999+07:00').toISOString();

  const d = await db();
  const p = await queryKeuangan(d, fromIso, toIso);

  // 2 kolom: item, nilai (nilai = angka polos, siap spreadsheet).
  const lines: string[] = [
    'item,nilai',
    'Periode (WIB),' + from + ' s.d. ' + to,
    '',
    'PENDAPATAN,',
    'Penjualan Bruto,' + p.pendapatan.bruto,
    '  - Penjualan (neto),' + p.pendapatan.penjualan,
    '  - Diskon Manual,' + p.pendapatan.diskonManual,
    '  - Diskon Member,' + p.pendapatan.diskonMember,
    '  - Redeem Poin/Saldo,' + p.pendapatan.redeem,
    'Retur Penjualan Tercatat,-' + p.pendapatan.retur,
    'Pendapatan Bersih,' + p.pendapatan.bersih,
    '',
    'HPP (COGS),-' + p.hpp,
    'Laba Kotor,' + p.labaKotor,
    '',
    'BEBAN OPERASIONAL,',
    'Beban Operasional,-' + p.beban.total,
    'Total Beban,-' + p.beban.total,
    '',
    'LABA BERSIH,' + p.labaBersih,
    '',
    'MEMO (di luar laba bersih),',
    'Saldo Reward Diberikan,' + p.memo.cashback.total,
    'Zakat Tercatat,' + p.memo.zakat.total,
    'Settlement Konsinyasi,' + p.memo.konsinyasi.total,
    '',
    'CATATAN V1,',
    ...KEUANGAN_NOTES.map((n, i) => '"' + (i + 1) + '. ' + n.replace(/"/g, '""') + '"'),
  ];
  const csv = lines.join('\n');

  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '-');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        'attachment; filename="kopontren-laba-rugi-' + safe(from) + '-' + safe(to) + '.csv"',
    },
  });
}
