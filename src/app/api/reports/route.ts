import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { startOfDayJakarta } from '@/lib/format';
import { ttlGet, ttlSet } from '@/lib/ttl-cache';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') || '30');
  const from = days > 0 ? startOfDayJakarta(1 - days) : '1970-01-01 00:00:00';
  const d = await db();

  // These are heavy full-range aggregates (sales + sale_items + purchases +
  // expenses + cash_entries + debts + returns). The body is user-independent
  // (plain shop numbers), so cache it per range: 60 s in this instance + a
  // short browser cache. Re-checks within that window cost zero Turso rows.
  const cacheKey = `reports:${from}`;
  const hit = ttlGet(cacheKey);
  if (hit !== null)
    return NextResponse.json(JSON.parse(hit), {
      headers: { 'Cache-Control': 'public, max-age=60', 'X-Cache': 'HIT' },
    });

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

  const debtsOpen = (
    (await d
      .prepare(`SELECT COUNT(*) c, COALESCE(SUM(remaining),0) v FROM debts WHERE status = 'open'`)
      .get()) as { c: number; v: number }
  );
  const debtsNew = (
    (await d
      .prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) v FROM debts WHERE created_at >= ?`)
      .get(from)) as { c: number; v: number }
  );
  const debtsPaid = (
    (await d
      .prepare(`SELECT COALESCE(SUM(amount),0) v FROM debts WHERE status = 'settled' AND created_at >= ?`)
      .get(from)) as { v: number }
  );
  // debts.paid di-update in-place (tidak ada tabel pembayaran), jadi
  // "diterima" = total kolom `paid` utk piutang yang tercatat pd periode.
  const debtsPaidAll = (
    (await d
      .prepare(
        `SELECT COALESCE(SUM(paid),0) v FROM debts WHERE created_at >= ?`
      )
      .get(from)) as { v: number }
  );
  const ret = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(amount),0) v FROM returns WHERE created_at >= ?`
      )
      .get(from)) as { c: number; v: number }
  );
  const retRefund = (
    (await d
      .prepare(
        `SELECT COALESCE(SUM(ce.amount),0) v
         FROM cash_entries ce
         WHERE ce.type = 'expense' AND ce.label LIKE 'Retur #%' AND ce.created_at >= ?`
      )
      .get(from)) as { v: number }
  );

  const byMethod = Object.fromEntries(
    (
      (
        await d
          .prepare(
            `SELECT pay_method m, COALESCE(SUM(total),0) t FROM sales WHERE created_at >= ? GROUP BY pay_method`
          )
          .all(from)
      ) as { m: string; t: number }[]
    ).map((r) => [r.m, r.t])
  );

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

  const body = {
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
    debts: {
      open_total: debtsOpen.v,
      open_count: debtsOpen.c,
      new_count: debtsNew.c,
      new_total: debtsNew.v,
      settled_total: debtsPaid.v,
      paid_total: debtsPaidAll.v,
    },
    returns: {
      count: ret.c,
      total: ret.v,
      refund_total: retRefund.v,
    },
  };
  ttlSet(cacheKey, JSON.stringify(body), 60_000);
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
