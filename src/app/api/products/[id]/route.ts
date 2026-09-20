import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';
import { notifyStockChange } from '@/lib/notify';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Opname/quick stock adjust = tier 'stock' (boleh gudang); ubah data produk
  // atau toggle aktif = tier 'products' (admin, manajer).
  const stockAdjust = b.stock !== undefined && b.name === undefined;
  if (!canAccess(user, stockAdjust ? 'stock' : 'products'))
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
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
        unit: string;
        category: string;
      }
    | undefined;
  if (!prod) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });

  // quick stock adjust: { stock: n }
  if (b.stock !== undefined && b.name === undefined) {
    const v = Number(b.stock);
    if (Number.isNaN(v) || v < 0)
      return NextResponse.json({ error: 'Stok tidak valid' }, { status: 400 });
    await d.prepare('UPDATE products SET stock = ? WHERE id = ?').run(v, prod.id);
    invalidate('products:');
    await logAudit({
      userId: user.id,
      userName: user.display_name,
      userRole: user.role,
      action: 'product:stock',
      entity: 'products',
      entityId: prod.id,
      fieldChanges: { stock: { before: prod.stock, after: v } },
      req,
    });
    // Notifikasi stok menipis/habis (best-effort, HANYA admin).
    try {
      await notifyStockChange(prod.id, v, prod.name, prod.unit);
    } catch (e) {
      console.warn('[notify] pemicu stok gagal:', e);
    }
    return NextResponse.json({ ok: true, stock: v });
  }
  // toggle active: { active: 0|1 }
  if (b.active !== undefined && b.name === undefined) {
    const active = b.active ? 1 : 0;
    await d.prepare('UPDATE products SET active = ? WHERE id = ?').run(active, prod.id);
    invalidate('products:');
    await logAudit({
      userId: user.id,
      userName: user.display_name,
      userRole: user.role,
      action: 'product:toggle',
      entity: 'products',
      entityId: prod.id,
      fieldChanges: { active: { before: prod.active, after: active } },
      req,
    });
    return NextResponse.json({ ok: true });
  }
  // full form update
  const newName = String(b.name || '').trim() || prod.name;
  const newBarcode =
    b.barcode !== undefined ? String(b.barcode || '').trim() : prod.barcode;
  const newCategory = String(b.category || '').trim();
  const newUnit = String(b.unit || 'pcs').trim() || 'pcs';
  // Clamp ≥0: harga/HPP negatif akan merusak laba, COGS & kalkulasi zakat.
  const newBasePrice = Math.max(0, Math.floor(Number(b.base_price) || 0));
  const newCostPrice = Math.max(0, Math.floor(Number(b.cost_price) || 0));
  await d
    .prepare(
      `UPDATE products SET name = ?, category = ?, unit = ?, base_price = ?, cost_price = ?, barcode = ? WHERE id = ?`
    )
    .run(newName, newCategory, newUnit, newBasePrice, newCostPrice, newBarcode, prod.id);
  invalidate('products:');
  // Audit trail diff per-field: hanya field yang benar-benar berubah
  // yang tercatat (mis. "harga 10000 -> 12000").
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  if (newName !== prod.name) changes.name = { before: prod.name, after: newName };
  if (newCategory !== prod.category)
    changes.category = { before: prod.category, after: newCategory };
  if (newUnit !== prod.unit) changes.unit = { before: prod.unit, after: newUnit };
  if (newBasePrice !== prod.base_price)
    changes.base_price = { before: prod.base_price, after: newBasePrice };
  if (newCostPrice !== prod.cost_price)
    changes.cost_price = { before: prod.cost_price, after: newCostPrice };
  if (newBarcode !== prod.barcode)
    changes.barcode = { before: prod.barcode, after: newBarcode };
  await logAudit({
    userId: user.id,
    userName: user.display_name,
    userRole: user.role,
    action: 'product:update',
    entity: 'products',
    entityId: prod.id,
    fieldChanges: changes,
    req,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
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
    invalidate('products:');
    await logAudit({
      userId: user.id,
      userName: user.display_name,
      userRole: user.role,
      action: 'product:archive',
      entity: 'products',
      entityId: prod.id,
      fieldChanges: { active: { before: 1, after: 0 } },
      req: _req,
    });
    return NextResponse.json({
      ok: true,
      message: 'Produk memiliki riwayat penjualan, status diubah menjadi Nonaktif',
      archived: true,
    });
  }

  await d.prepare('DELETE FROM products WHERE id = ?').run(prod.id);
  invalidate('products:');
  await logAudit({
    userId: user.id,
    userName: user.display_name,
    userRole: user.role,
    action: 'product:delete',
    entity: 'products',
    entityId: prod.id,
    fieldChanges: { name: { before: prod.name, after: null } },
    req: _req,
  });
  return NextResponse.json({ ok: true, message: 'Produk berhasil dihapus' });
}
