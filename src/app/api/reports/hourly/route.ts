import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { startOfDayJakarta } from '@/lib/format';
import { cached } from '@/lib/ref-cache';

/**
 * GET /api/reports/hourly?days=N — "Jam Sibuk": agregasi penjualan per jam
 * WIB (created_at UTC + 7 j) selama N hari ke belakang; 24 bucket jam.
 * Clamp 1–365 (default 30). Read-only, tier guard 'laporan' (sama dengan
 * /api/reports). Cache 60 dtk key 'reports:hourly:<from>' — ikut dibuang
 * oleh route tulis yang memanggil invalidate('reports:').
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });
  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get('days') || '30');
  const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(1, Math.floor(daysRaw))) : 30;
  const from = startOfDayJakarta(1 - days);

  const payload = await cached('reports:hourly:' + from, async () => {
    const d = await db();
    const rows = (
      await d
        .prepare(
          `SELECT CAST(strftime('%H', created_at, '+7 hours') AS INTEGER) h,
                  COUNT(*) c,
                  COALESCE(SUM(total), 0) t
           FROM sales
           WHERE created_at >= ?
           GROUP BY h`
        )
        .all(from)
    ) as { h: number; c: number; t: number }[];
    const hours = Array.from({ length: 24 }, (_, i) => ({ h: i, c: 0, t: 0 }));
    for (const r of rows) {
      if (Number.isInteger(r.h) && r.h >= 0 && r.h < 24) {
        hours[r.h] = { h: r.h, c: r.c, t: r.t };
      }
    }
    return { days, from, hours };
  });

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
