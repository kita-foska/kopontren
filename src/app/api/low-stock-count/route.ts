import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser } from '@/lib/auth';
import {
  LOW_STOCK_CACHE_CONTROL,
  LOW_STOCK_COUNT_SQL,
  LOW_STOCK_STATUS,
  lowStockCount,
  lowStockGate,
} from '@/lib/low-stock';

/**
 * COUNTER (POST-W5, 2026-10-13): hitung jumlah produk stok menipis
 * utk badge header (komponen low-stock-badge). READ-ONLY.
 *
 * Definisi (D1) identik widget dashboard: produk active = 1 dengan
 * stock < 10 (src/lib/low-stock.ts -- modul pure, diuji
 * scripts/test-low-stock-count.ts). Query COUNT(*) ringan: header
 * TIDAK memuat payload katalog /api/products.
 *
 * Gerbang tier (D4): 401 bila tak login; 403 bila role tanpa akses
 * tier 'stock' (admin/manajer/gudang -- kasir/pengurus/pembelian tak
 * dapat lihat, link badge tidak jadi "rantai patah").
 *
 * Respons: { count } bila sukses (count null bila query gagal --
 * badge render apa pun); header Cache-Control: no-store (bilangan
 * stok berubah cepat, cache browser = data basi).
 */
export async function GET() {
  const user = await currentUser();
  const gate = lowStockGate(user);
  if (gate !== 'ok') {
    const body: Record<string, string> = { error: 'login' };
    if (gate === 'denied') body.hint = 'stock';
    return NextResponse.json(body, {
      status: LOW_STOCK_STATUS[gate],
      headers: { 'Cache-Control': LOW_STOCK_CACHE_CONTROL },
    });
  }
  let count: number | null = null;
  try {
    const d = await db();
    const row = d.prepare(LOW_STOCK_COUNT_SQL).get() as { n?: number } | undefined;
    count = lowStockCount(row ? row.n : null);
  } catch {
    count = null; // gagal query: badge tidak muncul (bukan 5xx)
  }
  return NextResponse.json({ count }, { headers: { 'Cache-Control': LOW_STOCK_CACHE_CONTROL } });
}
