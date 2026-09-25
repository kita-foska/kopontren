import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';

/**
 * Grosir v1 — tier harga grosir per produk (tabel `product_prices`).
 *
 * GET  /api/products/[id]/prices     — login apa pun: daftar tier urut
 *      min_qty ASC. POS & UI admin membaca dari sini (katalog /api/products
 *      sudah menyertakan kolom `wholesale`, endpoint ini utk mutasi form).
 *
 * POST /api/products/[id]/prices     — hanya admin/manajer. Body:
 *      { tiers: [{ min_qty: int ≥ 1, discount_percent: int 0..99 }] }
 *      SEMANTIK REPLACE: seluruh tier lama produk ini dihapus lalu baris
 *      baru dimasukkan dalam satu transaksi (tx()). Array kosong =
 *      hapus semua tier. Duplikat min_qty dinekan yang paling besar
 *      (diskon paling menguntungkan) sebelum ditulis.
 *
 * Audit: logAudit fieldChanges { tiers: {before, after} } (JSON string,
 * pola lama → baru). Cache produk di-invalidate supaya kolom `wholesale`
 * di /api/products segar (TTL ref-cache 60 dtk tetap backstop).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0)
    return NextResponse.json({ error: 'ID produk tidak valid' }, { status: 400 });
  const d = await db();
  const prod = (await d
    .prepare('SELECT id, name FROM products WHERE id = ?')
    .get(pid)) as { id: number; name: string } | undefined;
  if (!prod) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  const rows = (await d
    .prepare(
      'SELECT min_qty, discount_percent FROM product_prices WHERE product_id = ? ORDER BY min_qty'
    )
    .all(pid)) as { min_qty: number; discount_percent: number }[];
  return NextResponse.json({
    product_id: pid,
    name: prod.name,
    tiers: rows.map((r) => ({ min_qty: r.min_qty, discount_percent: r.discount_percent })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'products'))
    return NextResponse.json({ error: 'Hanya admin/manajer' }, { status: 403 });
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0)
    return NextResponse.json({ error: 'ID produk tidak valid' }, { status: 400 });
  const d = await db();
  const prod = await d.prepare('SELECT id, name FROM products WHERE id = ?').get(pid);
  if (!prod) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as { tiers?: unknown };
  const raw: unknown[] = Array.isArray(b.tiers) ? b.tiers : [];
  // Normalisasi + validasi: min_qty int ≥ 1; discount_percent int 0..99
  // (100% = gratis — dilarang, jual tetap harus ada nilai).
  const norm: { min_qty: number; discount_percent: number }[] = [];
  for (const t of raw) {
    const o = (t ?? {}) as Record<string, unknown>;
    const min_qty = Math.floor(Number(o.min_qty));
    const discount_percent = Math.floor(Number(o.discount_percent));
    if (!Number.isInteger(min_qty) || min_qty < 1 || min_qty > 100000) {
      return NextResponse.json(
        { error: 'Tier tidak valid: min_qty harus bilangan bulat ≥ 1 (maks 100000)' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(discount_percent) || discount_percent < 0 || discount_percent > 99) {
      return NextResponse.json(
        { error: 'Tier tidak valid: discount_percent harus 0–99' },
        { status: 400 }
      );
    }
    norm.push({ min_qty, discount_percent });
  }
  // Duplikat min_qty: pertahankan diskon terbesar (paling menguntungkan).
  const byMin = new Map<number, number>();
  for (const t of norm) byMin.set(t.min_qty, Math.max(byMin.get(t.min_qty) ?? 0, t.discount_percent));
  const tiers = [...byMin.entries()]
    .map(([min_qty, discount_percent]) => ({ min_qty, discount_percent }))
    .sort((a, b2) => a.min_qty - b2.min_qty);
  if (tiers.length > 20)
    return NextResponse.json({ error: 'Maksimal 20 tier per produk' }, { status: 400 });

  const before = (await d
    .prepare(
      'SELECT min_qty, discount_percent FROM product_prices WHERE product_id = ? ORDER BY min_qty'
    )
    .all(pid)) as { min_qty: number; discount_percent: number }[];

  // SEMANTIK REPLACE dalam SATU transaksi: hapus semua tier lama produk ini
  // lalu tulis baris baru. Turso: atomic batch (commit eksplisit); lokal:
  // sekuensial auto-commit. tx() menjamin tidak ada state setengah-setengah
  // (tier lama hilang, tier baru belum masuk) walau insert gagal.
  await tx(d, async () => {
    await d.prepare('DELETE FROM product_prices WHERE product_id = ?').run(pid);
    for (const t of tiers) {
      await d
        .prepare(
          'INSERT INTO product_prices (product_id, min_qty, discount_percent) VALUES (?, ?, ?)'
        )
        .run(pid, t.min_qty, t.discount_percent);
    }
  });

  await logAudit(
    user,
    'product:wholesale',
    'product_prices',
    pid,
    JSON.stringify(
      before.map((x) => ({ min_qty: x.min_qty, discount_percent: x.discount_percent }))
    ),
    JSON.stringify(tiers),
    req
  );
  invalidate('products:');
  return NextResponse.json({ ok: true, tiers });
}
