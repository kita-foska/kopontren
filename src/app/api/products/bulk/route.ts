import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';

/**
 * Operasi massal produk (import/export & kelola massal untuk admin).
 * POST {
 *   action: 'stock' | 'category' | 'active' | 'delete',
 *   ids: number[],
 *   value?: string,   // utk category / active
 *   delta?: number,   // utk stock (stok += delta, floor 0)
 * }
 * Batas 500 id/request (cap Turso round-trip aman). Semua perubahan
 * direkap dalam 1 audit log (bukan per-baris) agar log audit tetap sehat.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    action?: string;
    ids?: number[];
    value?: string;
    delta?: number;
  };
  const ids = (Array.isArray(b.ids) ? b.ids : [])
    .map((x) => Math.floor(Number(x)))
    .filter((x) => Number.isFinite(x) && x > 0)
    .slice(0, 500);
  if (ids.length === 0)
    return NextResponse.json({ error: 'Pilih minimal 1 produk (ids)' }, { status: 400 });

  const action = String(b.action || '');
  if (!['stock', 'category', 'active', 'delete'].includes(action))
    return NextResponse.json({ error: 'Action tidak dikenal' }, { status: 400 });
  // Opname massal (stock) boleh tier 'stock' (admin, manajer, gudang);
  // aksi data produk (category/active/delete) = tier 'products' (admin, manajer).
  if (!canAccess(user, action === 'stock' ? 'stock' : 'products'))
    return NextResponse.json(
      {
        error:
          action === 'stock'
            ? 'Hanya admin/manajer/gudang yang boleh opname massal'
            : 'Hanya admin/manajer',
      },
      { status: 403 }
    );

  const d = await db();
  const inList = ids.map(() => '?').join(',');
  try {
    const out = await tx(d, async () => {
      let changed = 0;
      if (action === 'stock') {
        const delta = Math.trunc(Number(b.delta) || 0);
        if (delta === 0) return { changed: 0 };
        const res = await d
          .prepare(`UPDATE products SET stock = MAX(0, stock + ?) WHERE id IN (${inList})`)
          .run(delta, ...ids);
        changed = res.changes;
      } else if (action === 'category') {
        const value = String(b.value ?? '').trim();
        const res = await d
          .prepare(`UPDATE products SET category = ? WHERE id IN (${inList})`)
          .run(value, ...ids);
        changed = res.changes;
      } else if (action === 'active') {
        const value = String(b.value ?? '').trim() === '1' ? 1 : 0;
        const res = await d
          .prepare(`UPDATE products SET active = ? WHERE id IN (${inList})`)
          .run(value, ...ids);
        changed = res.changes;
      } else {
        // delete massal = nonaktifkan (data historis penjualan/konsinyasi
        // tetap aman; sama perilaku-nya dengan hapus produk bertransaksi).
        const res = await d
          .prepare(`UPDATE products SET active = 0 WHERE id IN (${inList})`)
          .run(...ids);
        changed = res.changes;
      }
      return { changed };
    });

    await logAudit(user, 'products:bulk-' + action, 'products', null, undefined, {
      count: ids.length,
      value: b.value !== undefined ? String(b.value) : undefined,
      delta: b.delta !== undefined ? Number(b.delta) : undefined,
      affected: out.changed,
    }, req);
    invalidate('products:');
    return NextResponse.json({ ok: true, affected: out.changed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gagal operasi massal' },
      { status: 400 }
    );
  }
}