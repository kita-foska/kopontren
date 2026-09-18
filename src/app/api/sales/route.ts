import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { startOfDayJakarta } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';

type SaleRow = {
  id: number;
  kasir_id: number | null;
  customer: string;
  pay_method: string;
  status: string;
  total: number;
  member_id: number | null;
  amount_paid: number;
  change: number;
  discount: number;
  member_points: number;
  created_at: string;
};

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') || '0');
  const status = url.searchParams.get('status') || 'all';
  // Pagination: default & maksimal 50 (target Turso Rows Read < 3.000),
  // klien boleh paging dengan ?offset=.
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const d = await db();
  let from: string | null = null;
  if (days > 0) from = startOfDayJakarta(1 - days);
  const where = [from !== null ? 'created_at >= ?' : '1=1'];
  const args: (string | number)[] = from ? [from] : [];
  if (status !== 'all') {
    where.push('status = ?');
    args.push(status);
  }
  args.push(limit, offset);
  const rows = (
    (await d
      .prepare(
        `SELECT * FROM sales WHERE ${where.join(
          ' AND '
        )} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...args)) as SaleRow[]
  );
  // Batch N+1: dulu 3 query per baris (kasir, member, items) = 3×N round-trip.
  // Sekarang 3 query total dengan IN (...) terlepas dari jumlah baris.
  const ph = (n: number) => Array(n).fill('?').join(', ');
  const kasirIds = [...new Set(rows.map((r) => r.kasir_id).filter((v): v is number => !!v))];
  const memberIds = [...new Set(rows.map((r) => r.member_id).filter((v): v is number => !!v))];
  const saleIds = rows.map((r) => r.id);
  const [kasirRows, memberRows, itemRows] = await Promise.all([
    kasirIds.length
      ? d.prepare(`SELECT id, username, display_name FROM users WHERE id IN (${ph(kasirIds.length)})`).all(
          ...kasirIds
        )
      : Promise.resolve([]),
    memberIds.length
      ? d
          .prepare(`SELECT id, name, phone, points FROM members WHERE id IN (${ph(memberIds.length)})`)
          .all(...memberIds)
      : Promise.resolve([]),
    saleIds.length
      ? d
          .prepare(
            `SELECT sale_id, product_name, qty, unit, unit_price, subtotal, discount
             FROM sale_items WHERE sale_id IN (${ph(saleIds.length)}) ORDER BY sale_id, id`
          )
          .all(...saleIds)
      : Promise.resolve([]),
  ]);
  const kasirMap = new Map<number, { username: string; display_name: string }>();
  for (const u of kasirRows as { id: number; username: string; display_name: string }[])
    kasirMap.set(u.id, u);
  const memberMap = new Map<number, { name: string; phone: string; points: number }>();
  for (const m of memberRows as { id: number; name: string; phone: string; points: number }[])
    memberMap.set(m.id, m);
  type SaleItem = {
    product_name: string;
    qty: number;
    unit: string;
    unit_price: number;
    subtotal: number;
    discount: number;
  };
  const itemsMap = new Map<number, SaleItem[]>();
  for (const it of itemRows as (SaleItem & { sale_id: number })[]) {
    const arr = itemsMap.get(it.sale_id) || [];
    arr.push(it);
    itemsMap.set(it.sale_id, arr);
  }
  const sales = rows.map((r) => {
    const kasir = r.kasir_id ? kasirMap.get(r.kasir_id) : undefined;
    const member = r.member_id ? memberMap.get(r.member_id) : undefined;
    return {
      ...r,
      kasir_name: kasir ? kasir.display_name || kasir.username : '',
      member_name: member?.name || '',
      member_phone: member?.phone || '',
      items: itemsMap.get(r.id) || [],
    };
  });
  return NextResponse.json({ sales, limit, offset });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    customer?: string;
    pay_method?: string;
    note?: string;
    member_id?: number;
    amount_paid?: number;
    change?: number;
    discount?: number;
    items?: { product_id: number; qty: number; unit_price?: number; discount?: number }[];
  };
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length === 0)
    return NextResponse.json({ error: 'Keranjang kosong' }, { status: 400 });
  const method = ['cash', 'tf', 'wa'].includes(String(b.pay_method)) ? String(b.pay_method) : 'cash';
  const manager = isManager(user);

  const d = await db();
  try {
    const out = await tx(d, async () => {
      let subtotal = 0;
      let lineDiscSum = 0;
      const prodStmt = d.prepare('SELECT * FROM products WHERE id = ?');
      const decStmt = d.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      // [qty, name, pid, unit, price, sub, lineDisc, cost]
      const insertItems: [number, string, number, string, number, number, number, number][] = [];
      for (const it of items) {
        const qty = Math.max(1, Math.floor(Number(it.qty) || 0));
        const prod = (await prodStmt.get(Number(it.product_id))) as
          | {
              id: number;
              name: string;
              unit: string;
              base_price: number;
              cost_price: number;
              stock: number;
              active: number;
            }
          | undefined;
        if (!prod || prod.active !== 1)
          throw new Error('Produk tidak tersedia: ' + (prod?.name || it.product_id));
        if (prod.stock < qty)
          throw new Error('Stok ' + prod.name + ' tidak cukup (sisa ' + prod.stock + ')');
        // Manager may override the price per line; only accept a finite
        // positive value, anything else falls back to the catalog price
        // (kasir: always base price). Prevents negative/NaN manipulation.
        const override = Number(it.unit_price);
        const price =
          manager && Number.isFinite(override) && override > 0
            ? Math.floor(override)
            : prod.base_price;
        const sub = price * qty;
        subtotal += sub;
        // Per-line discount: manager only, capped at the line total.
        let lineDisc = 0;
        if (manager) {
          const dv = Number(it.discount);
          if (Number.isFinite(dv) && dv > 0) lineDisc = Math.min(Math.floor(dv), sub);
        }
        lineDiscSum += lineDisc;
        await decStmt.run(qty, prod.id);
        const insertItemsRow: [number, string, number, string, number, number, number, number] = [
          qty,
          prod.name,
          prod.id,
          prod.unit,
          price,
          sub,
          lineDisc,
          prod.cost_price || 0,
        ];
        insertItems.push(insertItemsRow);
      }
      if (subtotal <= 0) throw new Error('Total transaksi tidak valid');
      // Transaction-level discount: manager only, capped at the subtotal.
      let txDisc = 0;
      if (manager) {
        const tv = Number(b.discount);
        if (Number.isFinite(tv) && tv > 0) txDisc = Math.min(Math.floor(tv), subtotal);
      }
      const total = subtotal - lineDiscSum - txDisc;
      if (total <= 0)
        throw new Error('Total setelah diskon tidak valid (diskon melebihi total)');

      // Member link + loyalty points (1 poin per Rp 10.000 dibelanjakan).
      let memberId: number | null = null;
      let points = 0;
      let memberName = '';
      if (b.member_id && Number(b.member_id) > 0) {
        const mrow = (await d
          .prepare('SELECT id, name FROM members WHERE id = ?')
          .get(Number(b.member_id))) as { id: number; name: string } | undefined;
        if (!mrow) throw new Error('Member tidak ditemukan');
        memberId = mrow.id;
        memberName = mrow.name;
        points = Math.floor(total / 10000);
      }
      const customer = String(b.customer || '').trim() || memberName;
      const amount_paid = Math.max(0, Math.floor(Number(b.amount_paid) || 0));
      const change = Math.max(0, Math.floor(Number(b.change) || 0));

      const created_at = new Date().toISOString();
      const sale = await d
        .prepare(
          `INSERT INTO sales (kasir_id, customer, pay_method, status, note, total,
                              member_id, amount_paid, change, discount, member_points, created_at)
           VALUES (?, ?, ?, 'unreported', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          user.id,
          customer,
          method,
          String(b.note || '').trim(),
          total,
          memberId,
          amount_paid,
          change,
          lineDiscSum + txDisc,
          points,
          created_at
        );
      const sid = Number(sale.lastInsertRowid);
      const insItem = d.prepare(
        `INSERT INTO sale_items (sale_id, product_id, product_name, qty, unit, unit_price, subtotal, discount, cost_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const [qty, name, pid, unit, price, sub, lineDisc, cost] of insertItems) {
        await insItem.run(sid, pid, name, qty, unit, price, sub, lineDisc, cost);
      }
      if (memberId) {
        await d
          .prepare(
            `UPDATE members SET points = points + ?, total_spent = total_spent + ? WHERE id = ?`
          )
          .run(points, total, memberId);
      }
      return {
        id: sid,
        total,
        status: 'unreported',
        created_at,
        points,
        member_name: memberName,
      };
    });
    await logAudit(user, 'sales:create', 'sales', Number(out.id), undefined, {
      total: out.total,
      member_name: out.member_name || undefined,
      points: out.points,
    });
    // Transaksi mengubah stok, poin member, saldo kas & agregat laporan
    // -> buang cache agar pembacaan berikutnya segar.
    invalidate('members:');
    invalidate('products:');
    invalidate('kas:');
    invalidate('reports:');
    return NextResponse.json({ ok: true, sale: out });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gagal menyimpan transaksi' },
      { status: 400 }
    );
  }
}
