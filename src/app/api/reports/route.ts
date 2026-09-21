import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { startOfDayJakarta } from '@/lib/format';
import { cached } from '@/lib/ref-cache';
import { salesByMethod } from '@/lib/pay-methods';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });
  const url = new URL(req.url);
  // Clamp 1–3650 hari: `days` ≤0 / NaN dulu memicu agregat sejak 1970
  // (full-scan semua tabel — pemicu Rows Read Turso).
  const daysRaw = Number(url.searchParams.get('days') || '30');
  const days = Number.isFinite(daysRaw) ? Math.min(3650, Math.max(1, Math.floor(daysRaw))) : 30;
  const from = startOfDayJakarta(1 - days);

  // Agregat per-periode (SUM/COUNT atas rentang waktu) dulu berjalan tiap
  // request -> pemicu Rows Read. Cache 60 dtk per periode (key: from);
  // dibuang oleh route write yang memanggil invalidate('reports:').
  const payload = await cached('reports:' + from, async () => {
    const d = await db();

    const sales = (
      (await d
        .prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales WHERE created_at >= ?`)
        .get(from)) as { c: number; t: number }
    );
    const cogs = (
      (await d
        .prepare(
          `SELECT COALESCE(SUM(si.qty * COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0)), 0) v
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE s.created_at >= ?`
        )
        .get(from)) as { v: number }
    ).v;
    const purchases = (
      (await d
        .prepare(`SELECT COALESCE(SUM(qty * unit_cost),0) v FROM purchases WHERE created_at >= ?`)
        .get(from)) as { v: number }
    ).v;
    const expenses = (
      (await d
        .prepare(`SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE created_at >= ?`)
        .get(from)) as { v: number }
    ).v;
    const cashIn = (
      (await d
        .prepare(
          `SELECT COALESCE(SUM(amount),0) v FROM cash_entries WHERE type='income' AND created_at >= ?`
        )
        .get(from)) as { v: number }
    ).v;
    const cashOut = (
      (await d
        .prepare(
          `SELECT COALESCE(SUM(amount),0) v FROM cash_entries WHERE type='expense' AND created_at >= ?`
        )
        .get(from)) as { v: number }
    ).v;

    // Per metode pembayaran: baris mixed (sales.pay_split, fitur 3)
    // diperluas per bagian — lihat src/lib/pay-methods.ts.
    const byMethod = await salesByMethod(d, 'created_at >= ?', [from]);

    const top = (
      (await d
        .prepare(
          `SELECT si.product_name name, SUM(si.qty) qty, SUM(si.subtotal) revenue
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= ?
         GROUP BY si.product_name
         ORDER BY revenue DESC
         LIMIT 10`
        )
        .all(from)) as { name: string; qty: number; revenue: number }[]
    );

    const cash_net = sales.t + cashIn - purchases - expenses - cashOut;

    // Series penjualan per-hari (bucket hari WIB via shift '+7 hours') untuk
    // chart dashboard pengurus: deteksi anomali + export 7/30/365 hari.
    // Maks. ~366 baris utk 1 tahun; termasuk cache 60 dtk di atas.
    const daily = (
      (await d
        .prepare(
          `SELECT strftime('%Y-%m-%d', created_at, '+7 hours') day,
                  COUNT(*) c, COALESCE(SUM(total),0) t
           FROM sales
           WHERE created_at >= ?
           GROUP BY day
           ORDER BY day`
        )
        .all(from)) as { day: string; c: number; t: number }[]
    );

    // Daftar cabang (multi-cabang): sales belum menyimpan store_id, jadi
    // data penjualan tetap global; stores hanya utk info & perencanaan.
    const stores = (
      (await d
        .prepare(`SELECT id, name, address FROM stores ORDER BY name`)
        .all()) as { id: number; name: string; address: string }[]
    );

    return {
      from,
      days,
      sales_count: sales.c,
      sales_total: sales.t,
      cogs,
      profit: sales.t - cogs,
      purchases_total: purchases,
      expenses_total: expenses,
      cash_in: cashIn,
      cash_out: cashOut,
      cash_net,
      by_method: byMethod,
      top,
      daily,
      stores,
    };
  });
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
