/**
 * Barcode ID (WAVE 8 ITEM 2, 20 Okt 2026 -- ruling R1-R5 Gus Fi).
 * Helper murni (zero-import): format barcode internal produk.
 * R2: format `KP-{id:05d}` (contoh KP-00042), id = products.id.
 * Kolom tujuan: products.barcode (existing, additive, tanpa migrasi R5).
 * Deterministik + bebas non-ASCII -- dipakai route API + test hermetic.
 */

/** Prefix format Barcode ID (R2). */
export const KP_PREFIX = 'KP-';
/** Lebar minimal digit id setelah prefix (R2: 5 digit, pad kiri '0'). */
export const KP_MIN_DIGITS = 5;

/**
 * Generate Barcode ID utk sebuah produk (R2): `KP-{id:05d}`.
 * Deterministik: id yang sama selalu menghasilkan kode yang sama.
 * id <= 0 / non-finite menghasilkan '' (pemanggil wajib meng-guard).
 * Id >= 100000 tetap aman (kode 6+ digit, tanpa truncation).
 */
export function kpBarcode(productId: number): string {
  const id = Math.floor(Number(productId));
  if (!Number.isFinite(id) || id <= 0) return '';
  return KP_PREFIX + String(id).padStart(KP_MIN_DIGITS, '0');
}

/**
 * Uji formal (shape-only) nilai string sebagai Barcode ID:
 * `KP-` + 5-9 digit (id INTEGER hingga 999.999.999). Kolom barcode
 * boleh berisi kode manual lain (mis. TPI-01) -- ini TIDAK gagal
 * validasi di sini; cek bentrok dilakukan di route API (R4).
 */
export function isKpBarcode(value: string): boolean {
  return /^KP-\d{5,9}$/.test(value);
}
