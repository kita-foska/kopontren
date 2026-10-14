/**
 * P14 OFFLINE CONFIDENCE (2026-10-14): label status per modul + stempel
 * "Terakhir online" utk strip shell (informatif, bukan biner). Hermetis
 * & pure -- TIDAK ada dependensi server (@/db, next/); label DISUSUN dari
 * confidence.ts (sumber tunggal P15-A) agar seluruh aplikasi satu bahasa.
 * String ASCII. Teruji: scripts/test-offline-status.ts (suite 35).
 *
 * Prinsip P14 (keputusan Gus Fi): murni UX/status -- TIDAK mengubah
 * transaksi, skema (v29), atau file fiqih. Data per modul DIBACA dari
 * localStorage sisi klien (kop:lastfetch:<module> + kop:lastonline);
 * penulisan key itu milik fitur (bukan instrumentasi page-load), jadi
 * modul ini HANYA membaca + menyusun label. Saat belum ada fitur yang
 * menulis, panel menampilkan "Belum ada catatan akses" (jujur, tidak
 * berpura-pula segar).
 *
 * SSR-safe: API baca/tulis menerima KvStore (bentuk minim localStorage)
 * secara eksplisit; di server / Node store = null -> read null / write
 * no-op. Efek DOM hanya di caller (shell.tsx, panel) dalam useEffect.
 */
import { ageDays, ageLabel, emptyLabel, freshnessStamp, syncLabel } from './confidence.ts';

/** Bentuk minim localStorage (getItem/setItem) -- memudahkan mock test. */
export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Prefix key per modul (sisi klien, bukan DB). */
export const LASTFETCH_PREFIX = 'kop:lastfetch:';
/** Key stempel "terakhir online" utk strip shell. */
export const LASTONLINE_KEY = 'kop:lastonline';

/** Key localStorage modul tertentu (mis. 'kas' -> 'kop:lastfetch:kas'). */
export function lastFetchKey(module: string): string {
  return LASTFETCH_PREFIX + module;
}

/** Baca stempel fetch terakhir modul (ISO); null bila tak ada / SSR. */
export function readLastFetch(module: string, store: KvStore | null): string | null {
  if (!store) return null;
  return store.getItem(lastFetchKey(module));
}

/** Baca stempel "terakhir online"; null bila tak ada / SSR. */
export function readLastOnline(store: KvStore | null): string | null {
  if (!store) return null;
  return store.getItem(LASTONLINE_KEY);
}

/** Tulis stempel fetch terakhir modul (no-op bila store null / SSR). */
export function recordLastFetch(module: string, iso: string, store: KvStore | null): void {
  if (!store) return;
  store.setItem(lastFetchKey(module), iso);
}

/** Tulis stempel "terakhir online" (no-op bila store null / SSR). */
export function recordLastOnline(iso: string, store: KvStore | null): void {
  if (!store) return;
  store.setItem(LASTONLINE_KEY, iso);
}

/** Stempel valid? (bukan null/kosong & ISO ter-parse). */
export function isValidStamp(iso: string | null): boolean {
  if (!iso) return false;
  return !Number.isNaN(Date.parse(iso));
}

/**
 * FRESHNESS per modul (keluarga 1 confidence): ada stempel -> "Terakhir
 * diperbarui {umur}"; tak ada -> "Belum ada catatan akses" (keluarga 2).
 * Satu sumber label = confidence.ts.
 */
export function freshnessOf(iso: string | null, nowIso: string): string {
  return isValidStamp(iso) ? freshnessStamp(iso, nowIso) : emptyLabel('catatan akses');
}

/**
 * SUSUNAN penuh P15-A utk panel (freshnessStamp + syncLabel, fallback
 * emptyLabel): "Terakhir diperbarui {umur} / {sinkron}". Contoh:
 * "Terakhir diperbarui 2 hari lalu / Tersinkron" /
 * "Belum ada catatan akses / 3 menunggu sinkronisasi".
 */
export function lastFetchLabel(iso: string | null, pending: number, nowIso: string): string {
  return freshnessOf(iso, nowIso) + ' / ' + syncLabel(pending);
}

/**
 * Strip shell (keluarga 1, kata kerja "online" bukan "diperbarui"):
 * "Terakhir online {umur}" / tak ada -> "Belum ada catatan online".
 */
export function lastOnlineLabel(iso: string | null, nowIso: string): string {
  return isValidStamp(iso)
    ? 'Terakhir online ' + ageLabel(ageDays(iso, nowIso))
    : emptyLabel('catatan online');
}

/** Delegasi keluarga 3 (sinkron) agar panel tak perlu impor confidence. */
export function syncOf(pending: number): string {
  return syncLabel(pending);
}
