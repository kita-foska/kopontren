import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isManager } from '@/lib/auth';

/**
 * Cache in-memory (60 dtk) daftar produk aktif utk dropdown form stok masuk.
 * Tanpa cache, setiap GET /api/belanja membaca seluruh tabel products di
 * Turso (rows read). Daftar referensi yang jarang berubah — keterlambatan
 * 60 dtk diizinkan (halaman admin lengkap memakai /api/products?live=1
 * untuk data real-time).
 */
let productsCache: { t: number; rows: unknown[] } | null = null;
const PRODUCTS_TTL_MS = 60_000;

async function activeProducts(): Promise<unknown[]> {
  if (productsCache && Date.now() - productsCache.t < PRODUCTS_TTL_MS) return productsCache.rows;
  const d = await db();
  const rows = await d
    .prepare('SELECT id, name FROM products WHERE active = 1 ORDER BY name')
    .all();
  productsCache = { t: Date.now(), rows };
  return rows;
}

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
  const products = await activeProducts();
  // Total global (semua data, bukan hanya 50 terbaru) — murah (1 baris per query),
  // sehingga kartu ringkasan tetap akurat meski daftar dibatasi LIMIT 50.
  const inAgg = await d.prepare('SELECT COALESCE(SUM(qty * unit_cost), 0) AS total FROM purchases').get();
  const outAgg = await d.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses').get();
  // no-store: data bisnis harus selalu segar setelah pencatatan (POST) & tidak
  // boleh di-cache CDN lintas-user. (Data statis produk sudah punya cache 30s
  // di /api/products terpisah.)
  return NextResponse.json(
    {
      purchases,
      expenses,
      products,
      totals: {
        in: Number((inAgg as { total?: number } | undefined)?.total ?? 0),
        out: Number((outAgg as { total?: number } | undefined)?.total ?? 0),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
