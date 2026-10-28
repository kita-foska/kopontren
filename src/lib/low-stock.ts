/**
 * COUNTER (POST-W5, 2026-10-13) + W18-B (2026-10-28): modul pure utk
 * low-stock counter (badge header + API /api/low-stock-count) + ambang
 * "stok minimum" per produk. Hermetis: TIDAK ada dependensi server
 * (@/db, next/headers), saged diimpor route API (via '@/lib/low-stock')
 * dan diuji Node type-stripping langsung (scripts/test-low-stock-count.ts).
 *
 * Definisi "stok menipis" (W18-B): produk active = 1 dengan
 * stock < COALESCE(NULLIF(min_stock,0), 10) --
 * ambang per-PRODUK (kolom min_stock, W18-B) nglampahaken menawi
 * min_stock > 0; menawi 0 (default), ambang global 10 tetep.
 * Backward-compat: produk lama min_stock=0 -> perilaku sama persis
 * dengan sebelum W18-B.
 *
 * Single source of truth SQL: LOW_STOCK_WHERE diginaken counter,
 * dashboard admin (list + forecast), lan dashboard pengurus --
 * saged hipun definisi sadosika.
 */
import { canAccess } from './features.ts';
import type { AppUser } from './auth.ts';

/** Ambang global low-stock (D1): stock < 10 (dipungap menawi min_stock = 0). */
export const LOW_STOCK_THRESHOLD = 10;

/**
 * Fragmen WHERE bersama (W18-B, single source of truth):
 * "menipis" = active SAGES stock ing ngandhap ambang efektif
 * (min_stock per produk, utawi global 10 menawi boten dipun setel).
 */
export const LOW_STOCK_WHERE =
  'active = 1 AND stock < COALESCE(NULLIF(min_stock,0), ' + LOW_STOCK_THRESHOLD + ')';

/**
 * Query hitung jumlah (bukan payload katalog -- header harus ringan).
 * Alias `n` agar baris hasil { n } mudah dinormalisasi lowStockCount().
 */
export const LOW_STOCK_COUNT_SQL = 'SELECT COUNT(*) AS n FROM products WHERE ' + LOW_STOCK_WHERE;

/**
 * W18-B: ambang efektif utk 1 produk (pure, testable): min_stock > 0
 * ngginakaken nilai tsb (dibulakkekan ing pangisor); sanstunipun
 * ambang global 10. Minus/NaN/null -> ambang global.
 */
export function effectiveMinStock(minStock?: number | null): number {
  const m = Math.floor(Number(minStock) || 0);
  return m > 0 ? m : LOW_STOCK_THRESHOLD;
}

/** W18-B: stok produk saged menipis? (dibandingakaken ambang efektif). */
export function isLowStock(stock: unknown, minStock?: number | null): boolean {
  return Number(stock) < effectiveMinStock(minStock);
}

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
