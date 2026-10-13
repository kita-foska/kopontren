/**
 * COUNTER (POST-W5, 2026-10-13): modul pure utk low-stock counter
 * (badge header + API /api/low-stock-count). Hermetis: TIDAK ada
 * dependensi server (@/db, next/headers), saged diimpor route API
 * (via '@/lib/low-stock') dan diuji Node type-stripping langsung
 * (scripts/test-low-stock-count.ts, pola test-roles.ts).
 *
 * Definisi "stok menipis" identik widget dashboard
 * (admin/dashboard/page.tsx + admin/low-stock-client.tsx, OQ-22):
 * produk active = 1 dengan stock < 10. TIDAK memakai alert_threshold
 * per-Produk (batas notifikasi, bukan batas low-stock).
 */
import { canAccess } from './features.ts';
import type { AppUser } from './auth.ts';

/** Batas low-stock (D1): stock < 10. 10 sendiri = TIDAK menipis. */
export const LOW_STOCK_THRESHOLD = 10;

/**
 * Query hitung jumlah (bukan payload katalog -- header harus ringan).
 * Alias `n` agar baris hasil { n } mudah dinormalisasi lowStockCount().
 */
export const LOW_STOCK_COUNT_SQL =
  'SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock < ' + LOW_STOCK_THRESHOLD;

/** Hasil cek gerbang tier utk role user. */
export type LowStockGate = 'anon' | 'denied' | 'ok';

/** Status HTTP per hasil gerbang (D4: tier 'stock' = admin/manajer/gudang). */
export const LOW_STOCK_STATUS: Readonly<Record<LowStockGate, number>> = {
  anon: 401, // belum login
  denied: 403, // login, tapi role tanpa akses tier stock
  ok: 200,
};

/** Header cache utk respons counter: badge harus selalu segara. */
export const LOW_STOCK_CACHE_CONTROL = 'no-store';

/** Cek gerbang tier (D4): 401 anon / 403 role tak berwenang / 200. */
export function lowStockGate(user: AppUser | null | undefined): LowStockGate {
  if (!user) return 'anon';
  return canAccess(user, 'stock') ? 'ok' : 'denied';
}

/**
 * Normalisasi nilai DB ke jumlah valid utk counter: angka bulat >= 0,
 * selain itu null (badge render apa pun -- gagal query = badge
 * tidak muncul, bukan angka bohong).
 */
export function lowStockCount(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Label counter (D5): lebar = "N produk stok menipis" (md+);
 * sempit = "N" (mobile). ASCII saja (tanpa emoji/unicode).
 */
export function lowStockLabel(count: number, wide: boolean): string {
  return wide ? count + ' produk stok menipis' : String(count);
}
