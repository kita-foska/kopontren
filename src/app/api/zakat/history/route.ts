import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { isoToWib, wibToday } from '@/lib/zakat-period';

type ZakatHistoryRow = {
  id: number;
  total_assets: number;
  nishab: number;
  status: string;
  zakat_amount: number;
  paid_at: string;
  note: string;
  created_at: string;
};

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Riwayat zakat: JSON default; ?csv=1 mengunduh file CSV
 * (dipakai tombol "Export CSV" di /admin/zakat). Kolom paid_at pada
 * CSV diformat WIB (UTC+7) agar konsisten dgn tampilan UI; JSON
 * tetap mentah (UI memformat sendiri).
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'zakat'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });

  const d = await db();
  const rows = (
    await d
      .prepare(
        `SELECT id, total_assets, nishab, status, zakat_amount, paid_at, note, created_at
         FROM zakat_history ORDER BY paid_at DESC, id DESC`
      )
      .all()
  ) as unknown as ZakatHistoryRow[];

  const csv = new URL(req.url).searchParams.get('csv') === '1';
  if (csv) {
    const lines = [
      'id,paid_at (WIB),status,total_assets,nishab,zakat_amount,note',
      ...rows.map((r) =>
        [r.id, isoToWib(r.paid_at), r.status, r.total_assets, r.nishab, r.zakat_amount, r.note]
          .map(csvEscape)
          .join(',')
      ),
    ];
    const filename = `zakat-history-${wibToday()}.csv`;
    return new Response('\uFEFF' + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({
    rows,
    count: rows.length,
    sum_zakat: rows.reduce((a, r) => a + Number(r.zakat_amount || 0), 0),
  });
}
