/**
 * FASE P4 — komisi konsinyasi utk akad ju'alah (keputusan pengurus
 * 2026-09-24). Default: komisi toko 20% dr harga jual, bagian pemilik
 * 80%. Referensi: Fatwa DSN-MUI No. 62/DSN-MUI/XII/2007 (ju'alah).
 *
 * Aturan syariah yang dijamin di sini:
 *  - Upah TIDAK dibayar di muka — komisi baru terhitung saat barang
 *    TERJUAL (qty_sold naik); belum terjual = komisi 0.
 *  - Barang yang dikembalikan (ora payu) TIDAK menghasilkan komisi.
 *  - Rate disnapshot per baris consignments saat barang dititipkan
 *    (kontrak disepakati saat titipan); setting global hanya utk
 *    titipan baru.
 *
 * Modul ini INTENSI BEBAS-IMPORT (hanya matematika) supaya bisa diuji
 * langsung Node (type-stripping) — pola test-margin.ts.
 */
export const DEFAULT_CONSIGN_COMMISSION = 20;

/** Normalisasi rate komisi dari setting (string bebas) ke integer 0..100. */
export function clampRate(v: unknown): number {
  if (v === null || v === undefined || v === '') return DEFAULT_CONSIGN_COMMISSION;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_CONSIGN_COMMISSION;
  return Math.min(100, Math.max(0, n));
}

/**
 * Bagi hasil per unit: komisi lantai (floor) supaya pemilik + komisi
 * SELALU = harga persis (tanpa pecahan rupiah). owner = bagian pemilik
 * (100-rate)%, commission = komisi toko (rate)%.
 */
export function splitConsignment(price: number, rate: number): { owner: number; commission: number } {
  const p = Math.floor(Number(price) || 0);
  const r = clampRate(rate);
  const commission = Math.floor((p * r) / 100);
  return { owner: p - commission, commission };
}
