/**
 * KOPONTREN — harga grosir (wholesale), modul MURNI (tanpa DB/IO/Next).
 *
 * Satu-satunya sumber rumus harga grosir. Dipakai bersama oleh:
 *  - POS client (components/pos-client.tsx) — auto-pricing keranjang,
 *  - UI admin produk (components/admin/produk-client.tsx) — preview harga
 *    efektif saat menyusun tier,
 *  - scripts/test-wholesale.ts (unit test, dijalankan langsung `node`).
 *
 * ── ATURAN (disetujui user 2026-09-25) ────────────────────────────────────
 *  1. Sumber diskon grosir dua: TIER PER PRODUK (tabel product_prices:
 *     beli ≥ min_qty → discount_percent) dan SETTING GLOBAL
 *     (member_settings: wholesale_min + wholesale_discount).
 *     Yang dipakai = MAKS(%) antar keduanya — paling menguntungkan pembeli,
 *     tidak boleh ada tier lebih murah dari global.
 *  2. Dasar hitung SELALU base_price produk (deterministik, tidak
 *     terkompound dengan harga manual kasir).
 *  3. Harga kasir manual (input "Ubah harga" di POS) MENANG — tidak
 *     di-restore otomatis oleh perubahan qty. Baris yang dihapus lalu
 *     ditambah lagi kembali memakai harga otomatis.
 *  4. Struk WA & server /api/sales memakai unit_price yang dikirim POS
 *     (sudah termasuk harga grosir) — jadi struk & HPP otomatis benar.
 *
 * 100% deterministik & tanpa dependensi proyek, sehingga bisa dieksekusi
 * langsung oleh Node (type-stripping). JANGAN tambahkan import proyek.
 */

/** Tier grosir per produk: beli ≥ min_qty → diskon discount_percent%. */
export interface WholesaleTier {
  min_qty: number;
  discount_percent: number;
}

/**
 * Parse kolom `wholesale` dari /api/products (JSON string hasil
 * json_group_array; '[]' bila tak ada tier) jadi array tier valid.
 * Aman utk semua bentuk: string valid, string kosong/null, undefined
 * (klien/cache lama), atau JSON rusak -> []. Urutan: min_qty ASC.
 */
export function parseWholesaleJson(raw: unknown): WholesaleTier[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (t): t is Record<string, unknown> =>
          !!t && typeof t === 'object' && Number.isFinite(Number(t.min_qty))
      )
      .map((t) => ({
        min_qty: Number(t.min_qty),
        discount_percent: Number(t.discount_percent) || 0,
      }))
      .sort((a, b) => a.min_qty - b.min_qty);
  } catch {
    return [];
  }
}

/** Diskon global dari member_settings (wholesale_min=0 berarti nonaktif). */
export interface GlobalWholesale {
  min: number;
  discount: number;
}

/**
 * Percent diskon tier terbaik untuk suatu qty: MAKS discount_percent antar
 * tier yang min_qty-nya sudah terpenuhi (qty ≥ min_qty). Qty naik = tier
 * teraman yang berlaku (bukan tier pertama yang cocok). 0 bila tidak ada
 * tier yang cocok.
 */
export function bestTierPct(tiers: readonly WholesaleTier[] | null | undefined, qty: number): number {
  if (!tiers || tiers.length === 0 || qty <= 0) return 0;
  let best = 0;
  for (const t of tiers) {
    const m = Math.floor(Number(t?.min_qty));
    const p = Math.min(100, Math.max(0, Math.floor(Number(t?.discount_percent))));
    if (Number.isFinite(m) && m >= 1 && qty >= m && p > best) best = p;
  }
  return best;
}

/**
 * Percent diskon global untuk qty: berlaku bila min > 0 dan qty ≥ min.
 * Nilai selalu di-normalisasi (floor, clamp 0..100, non-finit → 0).
 */
export function globalWholesalePct(g: GlobalWholesale | null | undefined, qty: number): number {
  if (!g || qty <= 0) return 0;
  const min = Math.floor(Number(g.min));
  const p = Math.min(100, Math.max(0, Math.floor(Number(g.discount))));
  if (!Number.isFinite(min) || min <= 0) return 0;
  return qty >= min ? p : 0;
}

export interface WholesaleQuote {
  /** Harga satuan efektif (rupiah, dibulatkan). */
  price: number;
  /** Percent diskon efektif (0..100). */
  pct: number;
  /** Sumber persen: 'tier' = tier produk, 'global' = setting global,
 *   'both' = keduanya sama besar, null = tidak ada diskon grosir. */
  source: 'tier' | 'global' | 'both' | null;
}

/**
 * Hitung harga satuan efektif utk (produk, qty).
 * pct = MAKS(tier terbaik, global) — lalu round(base_price × (100−pct)/100).
 */
export function effectiveWholesalePrice(
  basePrice: number,
  qty: number,
  tiers: readonly WholesaleTier[] | null | undefined,
  global: GlobalWholesale | null | undefined
): WholesaleQuote {
  const base = Math.max(0, Math.floor(Number(basePrice) || 0));
  const tp = bestTierPct(tiers, qty);
  const gp = globalWholesalePct(global, qty);
  const pct = Math.max(tp, gp);
  if (pct <= 0) return { price: base, pct: 0, source: null };
  const price = Math.max(0, Math.round((base * (100 - pct)) / 100));
  const source = tp === gp ? 'both' : tp > gp ? 'tier' : 'global';
  return { price, pct, source };
}
