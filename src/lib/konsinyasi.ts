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

/**
 * FASE P4-B: komisi FLEKSIBEL — boleh beda per pemilik / per barang
 * (antardhin: disepakati saat titipan). Rate per-pemilik disimpan di
 * setting `konsinyasi_owner_rates` (JSON string {nama: rate}).
 * Parser toleran: JSON korup / bukan object → {} (fallback global).
 */
export function parseOwnerRates(v: unknown): Record<string, number> {
  if (typeof v !== 'string' || !v.trim()) return {};
  try {
    const o: unknown = JSON.parse(v);
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return {};
    const out: Record<string, number> = {};
    for (const [k, raw] of Object.entries(o)) {
      const name = String(k).trim();
      if (!name) continue;
      // skip null / string kosong: Number(null)=0 & Number('')=0 akan
      // mengira rate 0 diam-diam — nilai tak valid memang di-skip.
      if (raw === null || raw === undefined) continue;
      if (typeof raw === 'string' && raw.trim() === '') continue;
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n)) continue;
      out[name] = Math.min(100, Math.max(0, n));
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Resolve rate utk titipan BARU. Prioritas (antardhin — kesepakatan
 * saat input menang): (1) explicit = nilai yg disepakati di form,
 * (2) default pemilik (konsinyasi_owner_rates), (3) global
 * (konsinyasi_commission, default 20). Baris berjalan TIDAK pernah
 * kena — snapshot rate tetap (tanpa perubahan sepihak).
 */
export function resolveCommissionRate(
  explicit: number | null | undefined,
  ownerName: string,
  ownerRates: Record<string, number>,
  globalSetting: unknown
): { rate: number; source: 'explicit' | 'owner' | 'global' } {
  if (explicit !== null && explicit !== undefined && Number.isFinite(Number(explicit)))
    return { rate: clampRate(explicit), source: 'explicit' };
  const o = ownerRates[String(ownerName ?? '').trim()];
  if (o !== undefined) return { rate: o, source: 'owner' };
  return { rate: clampRate(globalSetting), source: 'global' };
}
