/**
 * UX-7E: persistensi "Saved Views" — filter halaman laporan/produk disimpan
 * di localStorage (per browser, client-only). TANPA API & TANPA migrasi DB:
 * ini preferensi lokal, bukan data bisnis. Nilai tak valid/korup dianggap
 * kosong (fallback ke default halaman) — tidak pernah melempar.
 */

/**Baca saved view JSON dari localStorage; null bila belum ada/korup/SSR. */
export function readSavedView<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**Tulis patch ke saved view (timestamp `savedAt` ditambahkan otomatis). */
export function writeSavedView(key: string, patch: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...patch, savedAt: new Date().toISOString() }));
  } catch {
    // storage penuh/dikosongkan (mode private) — fitur kosmetik, swallow.
  }
}

/** Kunci localStorage per halaman (satu preferensi per modul). */
export const SAVEDVIEW_KEYS = {
  laporan: 'kopontren_savedview_laporan',
  produk: 'kopontren_savedview_produk',
} as const;
