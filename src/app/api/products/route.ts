import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const url = new URL(req.url);
  const live = url.searchParams.get('live') === '1';
  const d = await db();
  const products: unknown[] = live
    ? await d.prepare('SELECT * FROM products WHERE active = 1 ORDER BY category, name').all()
    : await d.prepare('SELECT * FROM products ORDER BY category, name').all();
  const categories: string[] = (
    (await d
      .prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category != '' ORDER BY category")
      .all()) as { category: string }[]
  ).map((r) => r.category);
  return NextResponse.json({ products, categories, role: user.role });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
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
  return NextResponse.json({ ok: true, id });
}
