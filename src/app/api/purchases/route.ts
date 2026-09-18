import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    product_id?: number;
    qty?: number;
    unit_cost?: number;
    supplier?: string;
    note?: string;
  };
  const qty = Math.floor(Number(b.qty) || 0);
  if (!b.product_id || qty <= 0)
    return NextResponse.json({ error: 'Pilih produk & jumlah valid' }, { status: 400 });
  const d = await db();
  const prod = (await d.prepare('SELECT * FROM products WHERE id = ?').get(b.product_id)) as
    | { id: number; name: string }
    | undefined;
  if (!prod) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  const cost = Math.max(0, Number(b.unit_cost) || 0);
  const info = await tx(d, async () => {
    const ins = await d
      .prepare(
        'INSERT INTO purchases (product_id, product_name, qty, unit_cost, supplier, note) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        prod.id,
        prod.name,
        qty,
        cost,
        String(b.supplier || '').trim(),
        String(b.note || '').trim()
      );
    await d.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, prod.id);
    if (cost > 0)
      await d.prepare('UPDATE products SET cost_price = ? WHERE id = ?').run(cost, prod.id);
    return ins;
  });
  const stockRow = (await d.prepare('SELECT stock FROM products WHERE id = ?').get(prod.id)) as {
    stock: number;
  };
  await logAudit(user, 'purchase:create', 'purchases', Number(info.lastInsertRowid), undefined, {
    product: prod.name,
    qty,
    unit_cost: cost,
    supplier: String(b.supplier || '').trim() || undefined,
  });
  return NextResponse.json({ ok: true, stock: stockRow.stock });
}
