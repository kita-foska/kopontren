/**
 * V2 multi-satuan fraksional -- helper presisi stok (P-V2-MULTISATUAN.md,
 * aturan R1-R7). Modul PURE & deterministik (tanpa runtime import):
 * aman utk client (POS/admin) maupun Node (test type-stripping); pola
 * sama dgn neraca.ts / zakat-valuation.ts.
 *
 * Tashih (V2, 1 baris): kenaikan presisi stok 3 desimal TIDAK mengubah
 * mekanisme penghitungan zakat/neraca -- penaksiran tetap jumlah
 * (stok x harga) dibulatkan ke rupiah utuh.
 */

/** R2: epsilon utk perbandingan kecukupan stok (kolom stock REAL). */
export const STOCK_EPS = 1e-6;

/**
 * R1: pembulatan stok ke 3 desimal (D3) -- SATU pintu utk SETIAP
 * mutasi stok (sale decrement, return restock, purchases restock,
 * opname bulk/import). Non-finite -> 0. Hasil selalu kelipatan 0.001.
 */
export function r3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

/**
 * R6 (D5): validasi qty_per_base fraksional -- angka finite,
 * 0.01 <= qpb <= 10000; disimpan r3(qpb). Tak valid -> throw
 * (ganti V1 Math.max(1, Math.floor)).
 */
export function validateQpb(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n))
    throw new Error('qty_per_base tidak valid: harus angka finite');
  const q = r3(n);
  if (q < 0.01 || q > 10000)
    throw new Error('qty_per_base di luar rentang valid (0.01 - 10000)');
  return q;
}

/** R1: kebutuhan stok dasar utk qty terjual dgn konversi pack: r3(qty*qpb). */
export function stockNeeded(qty: number, qpb: number): number {
  return r3(qty * qpb);
}

/**
 * R3 (D4): HPP per unit terjual = Math.max(0, Math.round(cost * qpb))
 * -- snapshot rupiah utuh (Math.round, ganti Math.floor V1).
 */
export function hppPerUnit(cost: number, qpb: number): number {
  return Math.max(0, Math.round(cost * qpb));
}

/**
 * R7 (D2): input stok CSV/Excel -- HANYA titik desimal (3.5 sah;
 * koma "3,5" tetap OOS, ditolak toNum di import); hasil r3().
 * Excel format kolom number (3.5 JS-number) -> Number(v) lalu r3.
 * Kosong/non-angka -> 0.
 */
export function parseStockInput(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return r3(n);
}

