import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { cached } from '@/lib/ref-cache';

/**
 * Cache in-memory (60 dtk, ref-cache) daftar produk aktif utk dropdown form
 * stok masuk. Kunci 'products:active' ikut terinvalidasi oleh
 * invalidate('products:') dari route write (products, migrate, restore) —
 * produk baru muncul di dropdown tanpa menunggu TTL. Instance Vercel warm:
 * request beruntun tidak menembus Turso; TTL 60 dtk jadi backstop utk
 * staleness lintas-instance.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const d = await db();
  // 50 transaksi terbaru sudah cukup (UI menampilkan scroll + tidak perlu riwayat panjang).
  // Turun dari 200: payload JSON & DOM lebih kecil → respons & render lebih cepat.
  const purchases = await d
    .prepare('SELECT * FROM purchases ORDER BY created_at DESC LIMIT 50')
    .all();
  const expenses = await d
    .prepare('SELECT * FROM expenses ORDER BY created_at DESC LIMIT 50')
    .all();
  const products = await cached('products:active', async () => {
    const dd = await db();
    return dd
      .prepare('SELECT id, name FROM products WHERE active = 1 ORDER BY name')
      .all();
  });
  // Total global (semua data, bukan hanya 50 terbaru) — tanpa cache, tiap
  // GET membaca SEMUA baris purchases & expenses (pemicu utama Rows Read).
  // Cache 60 dtk + invalidasi('belanja:') di POST /api/expenses &
  // POST /api/purchases; backup/restore memaksa segalanya segar.
  const totals = await cached('belanja:totals', async () => {
    const dd = await db();
    const inAgg = await dd.prepare('SELECT COALESCE(SUM(qty * unit_cost), 0) AS total FROM purchases').get();
    const outAgg = await dd.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses').get();
    return {
      in: Number((inAgg as { total?: number } | undefined)?.total ?? 0),
      out: Number((outAgg as { total?: number } | undefined)?.total ?? 0),
    };
  });
  // no-store: data bisnis harus selalu segar setelah pencatatan (POST) & tidak
  // boleh di-cache CDN lintas-user. (Data statis produk sudah punya cache 60s
  // di /api/products terpisah.)
  return NextResponse.json(
    {
      purchases,
      expenses,
      products,
      totals,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
