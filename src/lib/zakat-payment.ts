/**
 * Media pembayaran zakat (dicatat per baris zakat_history, skema v17).
 * Domain zakat TIDAK memakai kosakata pay_method POS (cash/tf/wa) —
 * channel zakat berbeda: tunai/transfer bank/QRIS/lainnya.
 * Modul murni (tanpa dependensi Next) -> dipakai route /api/zakat
 * (validasi body POST) & reusable utk UI/test.
 */
export const ZAKAT_PAYMENT_TYPES = ['cash', 'transfer', 'qris', 'other'] as const;
export type ZakatPaymentType = (typeof ZAKAT_PAYMENT_TYPES)[number];

/**
 * Validasi input payment_type dari body POST: trim + lowercase;
 * nilai tak dikenal / kosong -> 'cash' (konservatif, selaras dgn
 * backfill DB utk baris lama). Pola validasi sama dgn `note`.
 */
export function normalizePaymentType(v: unknown): ZakatPaymentType {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return (ZAKAT_PAYMENT_TYPES as readonly string[]).includes(s)
    ? (s as ZakatPaymentType)
    : 'cash';
}
