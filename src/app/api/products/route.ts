import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { ttlGet, ttlSet, ttlDel } from '@/lib/ttl-cache';

const PRODUCTS_CACHE_KEY = 'products:all';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const url = new URL(req.url);
  const live = url.searchParams.get('live') === '1';
  const d = await db();
  let products: unknown[];
  let categories: string[];
  if (!live) {
    // Admin list is low-churn: serve from this instance's 20 s cache when
    // warm (skips the full-table read). `role` is intentionally kept out of
    // the cached payload (it is per-user).
    const hit = ttlGet(PRODUCTS_CACHE_KEY);
    if (hit !== null) {
      const parsed = JSON.parse(hit) as { products: unknown[]; categories: string[] };
      return NextResponse.json({ products: parsed.products, categories: parsed.categories, role: user.role });
    }
  }
  products = live
    ? await d.prepare('SELECT * FROM products WHERE active = 1 ORDER BY category, name').all()
    : await d.prepare('SELECT * FROM products ORDER BY category, name').all();
  categories = (
    (await d
      .prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != '' ORDER BY category")
      .all()) as { category: string }[]
  ).map((r) => r.category);
  if (!live) ttlSet(PRODUCTS_CACHE_KEY, JSON.stringify({ products, categories }), 20_000);
  return NextResponse.json({ products, categories, role: user.role });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
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
  ttlDel(PRODUCTS_CACHE_KEY); // new product: drop cached admin list
  await logAudit(user, 'product:create', 'products', id, undefined, {
    name,
    base_price: Number(b.base_price) || 0,
    stock: Number(b.stock) || 0,
    barcode: barcode || undefined,
  });
  return NextResponse.json({ ok: true, id });
}
