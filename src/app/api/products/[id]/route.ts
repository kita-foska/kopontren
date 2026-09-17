import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const d = await db();
  const prod = (await d.prepare('SELECT * FROM products WHERE id = ?').get(Number(id))) as
    | {
        id: number;
        name: string;
        stock: number;
        active: number;
        base_price: number;
        cost_price: number;
        barcode: string;
      }
    | undefined;
  if (!prod) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });

  // quick stock adjust: { stock: n }
  if (b.stock !== undefined && b.name === undefined) {
    const v = Number(b.stock);
    if (Number.isNaN(v) || v < 0)
      return NextResponse.json({ error: 'Stok tidak valid' }, { status: 400 });
    await d.prepare('UPDATE products SET stock = ? WHERE id = ?').run(v, prod.id);
    await logAudit(user, 'product:stock', 'products', prod.id, { stock: prod.stock }, {
      stock: v,
    });
    return NextResponse.json({ ok: true, stock: v });
  }
  // toggle active: { active: 0|1 }
  if (b.active !== undefined && b.name === undefined) {
    const active = b.active ? 1 : 0;
    await d.prepare('UPDATE products SET active = ? WHERE id = ?').run(active, prod.id);
    await logAudit(user, 'product:toggle', 'products', prod.id, { active: prod.active }, {
      active,
    });
    return NextResponse.json({ ok: true });
  }
  // full form update
  const newName = String(b.name || '').trim() || prod.name;
  const newBarcode =
    b.barcode !== undefined ? String(b.barcode || '').trim() : prod.barcode;
  await d
    .prepare(
      `UPDATE products SET name = ?, category = ?, unit = ?, base_price = ?, cost_price = ?, barcode = ? WHERE id = ?`
    )
    .run(
      newName,
      String(b.category || '').trim(),
      String(b.unit || 'pcs').trim() || 'pcs',
      Number(b.base_price) || 0,
      Number(b.cost_price) || 0,
      newBarcode,
      prod.id
    );
  await logAudit(user, 'product:update', 'products', prod.id, {
    name: prod.name,
    base_price: prod.base_price,
    cost_price: prod.cost_price,
    barcode: prod.barcode,
  }, {
    name: newName,
    base_price: Number(b.base_price) || 0,
    cost_price: Number(b.cost_price) || 0,
    barcode: newBarcode,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const { id } = await params;
  const d = await db();
  const prod = (await d.prepare('SELECT id, name FROM products WHERE id = ?').get(Number(id))) as
    | { id: number; name: string }
    | undefined;
  if (!prod) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });

  const sold = (
    (await d
      .prepare('SELECT COUNT(*) c FROM sale_items WHERE product_id = ?')
      .get(prod.id)) as { c: number }
  ).c;
  if (sold > 0) {
    await d.prepare('UPDATE products SET active = 0 WHERE id = ?').run(prod.id);
    await logAudit(user, 'product:archive', 'products', prod.id, { name: prod.name }, { active: 0 });
    return NextResponse.json({
      ok: true,
      message: 'Produk memiliki riwayat penjualan, status diubah menjadi Nonaktif',
      archived: true,
    });
  }

  await d.prepare('DELETE FROM products WHERE id = ?').run(prod.id);
  await logAudit(user, 'product:delete', 'products', prod.id, { name: prod.name }, undefined);
  return NextResponse.json({ ok: true, message: 'Produk berhasil dihapus' });
}
