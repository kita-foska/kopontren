import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';
import { notifyStockChange } from '@/lib/notify';
import { r3, validateQpb } from '@/lib/multisatuan';

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
        is_consignment: number;
        image_url?: string;
        /** W18-B: ambang low-stock per produk (0 = ambang global). */
        min_stock?: number;
      }
    | undefined;
  if (!prod) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });

  // quick stock adjust: { stock: n }
  if (b.stock !== undefined && b.name === undefined) {
    // V2 (R1): opname fraksional 3 desimal (kolom stock REAL).
    const vn = Number(b.stock);
    if (Number.isNaN(vn))
      return NextResponse.json({ error: 'Stok tidak valid' }, { status: 400 });
    const v = r3(vn);
    // W5.2 NEG-1: opname negatif HANYA utk barang titipan (flag=1).
    // Gudang/produk biasa tetap floor 0 (JC-1).
    if (v < 0 && prod.is_consignment !== 1)
      return NextResponse.json(
        { error: 'Stok tidak valid (negatif hanya utk barang titipan)' },
        { status: 400 }
      );
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
    // W18-B: sertakan min_stock (0 = ambang global) utk hitung ambang.
    try {
      await notifyStockChange(prod.id, v, prod.name, prod.unit, prod.min_stock ?? 0);
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
  // W5.2 NEG-1: toggle "barang titipan": { is_consignment: 0|1 }
  if (b.is_consignment !== undefined && b.name === undefined) {
    const consignment = b.is_consignment ? 1 : 0;
    await d.prepare('UPDATE products SET is_consignment = ? WHERE id = ?').run(consignment, prod.id);
    invalidate('products:');
    await logAudit({
      userId: user.id,
      userName: user.display_name,
      userRole: user.role,
      action: 'product:consignment',
      entity: 'products',
      entityId: prod.id,
      fieldChanges: { is_consignment: { before: prod.is_consignment, after: consignment } },
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
  // W5.2 NEG-1: flag titipan ikut form update; bila klien lama tidak
  // mengirim field, nilai lama dipertahankan (tanpa clobber).
  const newConsignment = b.is_consignment !== undefined ? (b.is_consignment ? 1 : 0) : prod.is_consignment;
  const newImageUrl = b.image_url !== undefined ? String(b.image_url).trim().slice(0, 500) : (prod.image_url ?? '');
  // W18-B: min_stock (ambang low-stock per produk; 0 = ambang global).
  // undefined = pertahankan nilai lama (tanpa clobber utk klien lama).
  const newMinStock =
    b.min_stock !== undefined
      ? Math.max(0, Math.floor(Number(b.min_stock) || 0))
      : (prod.min_stock ?? 0);
  // v30 multi-satuan: pack_units update. Validasi: array [{unit, qty_per_base, price}].
  // V2 (R6): qty_per_base fraksional 0.01-10000 (3 desimal) via
  // validateQpb -- entri tak valid THROW -> 400; price rupiah bulat (R4).
  // undefined = pertahankan nilai lama (tanpa clobber utk klien lama).
  let newPackUnits: string;
  if (b.pack_units !== undefined) {
    let packUnits = '';
    if (Array.isArray(b.pack_units) && b.pack_units.length > 0) {
      let validated: { unit: string; qty_per_base: number; price: number }[] = [];
      try {
        validated = b.pack_units
          .filter((p): p is { unit: string; qty_per_base: number; price: number } =>
            typeof p === 'object' && p !== null &&
            typeof (p as Record<string, unknown>).unit === 'string'
          )
          .map((p) => ({
            unit: String(p.unit).trim().slice(0, 32),
            qty_per_base: validateQpb(p.qty_per_base),
            price: Math.max(0, Math.floor(Number(p.price) || 0)),
          }))
          .filter((p) => p.unit.length > 0);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Pack unit tidak valid' },
          { status: 400 }
        );
      }
      packUnits = validated.length > 0 ? JSON.stringify(validated) : '';
    }
    newPackUnits = packUnits;
  } else {
    newPackUnits = ((prod as Record<string, unknown>).pack_units as string) ?? '';
  }
  await d
    .prepare(
      `UPDATE products SET name = ?, category = ?, unit = ?, base_price = ?, cost_price = ?, barcode = ?, is_consignment = ?, image_url = ?, pack_units = ?, min_stock = ? WHERE id = ?`
    )
    .run(newName, newCategory, newUnit, newBasePrice, newCostPrice, newBarcode, newConsignment, newImageUrl, newPackUnits, newMinStock, prod.id);
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
  if (newConsignment !== prod.is_consignment)
    changes.is_consignment = { before: prod.is_consignment, after: newConsignment };
  if (newImageUrl !== (prod.image_url ?? ''))
    changes.image_url = { before: prod.image_url ?? '', after: newImageUrl };
  if (newPackUnits !== (((prod as Record<string, unknown>).pack_units as string) ?? ''))
    changes.pack_units = { before: (prod as Record<string, unknown>).pack_units ?? '', after: newPackUnits };
  // W18-B: audit min_stock (0 = ambang global, >0 = ambang per produk).
  if (newMinStock !== (prod.min_stock ?? 0))
    changes.min_stock = { before: prod.min_stock ?? 0, after: newMinStock };
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
  return NextResponse.json({ ok: true, message: 'Produk dihapus' });
}
