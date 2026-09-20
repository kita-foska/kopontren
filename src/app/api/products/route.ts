import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { cached, invalidate } from '@/lib/ref-cache';

/**
 * Cache in-memory (60 dtk, ref-cache) utk data statis produk + kategori.
 * Instance Vercel warm: request beruntun tidak menembus Turso.
 * `?fresh=1` memaksa bypass (dipakai halaman admin setelah mengubah data);
 * route WRITE (products POST/PUT/DELETE, sales, retur, migrate) juga
 * memanggil invalidate('products:') — TTL 60 dtk jadi backstop.
 */
async function getProductsCache(live: boolean): Promise<{ products: unknown[]; categories: string[] }> {
  const key = live ? 'products:live' : 'products:all';
  return cached<{ products: unknown[]; categories: string[] }>(key, async () => {
    const d = await db();
    const products: unknown[] = live
      ? await d.prepare('SELECT * FROM products WHERE active = 1 ORDER BY category, name').all()
      : await d.prepare('SELECT * FROM products ORDER BY category, name').all();
    const categories: string[] = (
      (await d
        .prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != '' ORDER BY category")
        .all()) as { category: string }[]
    ).map((r) => r.category);
    return { products, categories };
  });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const url = new URL(req.url);
  const live = url.searchParams.get('live') === '1';
  const fresh = url.searchParams.get('fresh') === '1';
  let data: { products: unknown[]; categories: string[] };
  if (fresh) {
    // Bypass: buang entri cache lalu ambil segar dari DB.
    invalidate(live ? 'products:live' : 'products:all');
    data = await getProductsCache(live);
  } else {
    data = await getProductsCache(live);
  }
  // Pagination opsional (default: seluruh daftar, karena POS/catalog butuh
  // katalog lengkap). ?limit=&offset= membatasi halaman yang dikirim;
  // cap 50 baris/halaman (target Turso Rows Read) — klien memakai paging.
  const limit = url.searchParams.get('limit')
    ? Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50))
    : null;
  const offset = url.searchParams.get('offset') ? Math.max(0, Number(url.searchParams.get('offset')) || 0) : 0;
  const products =
    limit !== null ? data.products.slice(offset, offset + limit) : data.products;
  // Cache 60 detik di browser/CDN untuk data referensi; data bisnis
  // (sales, members, kas, shift) sengaja TIDAK di-cache — mutasi harus
  // selalu terbaca segar.
  // Catatan: payload TIDAK memuat user.role — response ini di-cache browser
  // 60 detik (header di bawah), dan di perangkat POS berbagi, hasil cache
  // satu user bisa dibaca user lain. Role client diambil dari halaman,
  // bukan dari endpoint ini.
  return NextResponse.json(
    { products, categories: data.categories, limit, offset },
    { headers: { 'Cache-Control': 'public, max-age=60' } }
  );
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'products'))
    return NextResponse.json({ error: 'Hanya admin/manajer' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Nama produk wajib' }, { status: 400 });
  const d = await db();
  const barcode = String(b.barcode || '').trim();
  const info = await d
    .prepare(
      `INSERT INTO products (name, category, unit, base_price, cost_price, stock, active, barcode)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      name,
      String(b.category || '').trim(),
      String(b.unit || 'pcs').trim() || 'pcs',
      Number(b.base_price) || 0,
      Number(b.cost_price) || 0,
      Number(b.stock) || 0,
      barcode
    );
  const id = Number(info.lastInsertRowid);
  await logAudit(user, 'product:create', 'products', id, undefined, {
    name,
    base_price: Number(b.base_price) || 0,
    stock: Number(b.stock) || 0,
    barcode: barcode || undefined,
  });
  invalidate('products:');
  return NextResponse.json({ ok: true, id });
}
