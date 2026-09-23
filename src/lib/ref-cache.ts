/**
 * In-memory reference cache (per-instance Node/Vercel), TTL 60 detik.
 *
 * Dipakai untuk data referensi (products, categories, member settings)
 * dan agregat global yang mahal (SUM/COUNT seluruh tabel) — agar request
 * berulang dalam 60 detik tidak menembus Turso dan menurunkan "Rows Read".
 *
 * invalidate(prefix) dipanggil di route WRITE (POST/PUT/DELETE/PATCH)
 * supaya setelah mutasi, data segar terbaca dari Turso; TTL 60 dtk tetap
 * jadi backstop (multi-instance Vercel tidak saling invalidate).
 *
 * Prefix 'kas': SAAT INI TIDAK ADA key 'kas:…' yang di-cache. Key nyata:
 * reports:<from>, products:active, belanja:totals, members:totals:<q>,
 * settings:member, audit:tables, notif:list:<…>. invalidate('kas:') di
 * 10 route tulis (kas, sales, expenses, purchases, returns, debts,
 * payables, konsinyasi) = BACKSTOP INTENTIONAL (no-op, biaya ~0):
 * jika kelak ada cached('kas:…'), semua route mutasi SUDAH memanggil
 * invalidate('kas:') — tidak perlu disisir ulang. (Verifikasi FASE 1
 * 2026-09-23: bukan bug, didokumentasikan di sini + MEMORY.md.)
 */
const TTL_MS = 60_000;
// Plafon ukuran store: key dinamis (mis. 'members:totals:<q>' mengikuti
// string pencarian user) tidak boleh membesar tanpa batas di heap
// instance. Map menjaga urutan insert -> eviksi dari yang tertua.
const MAX_KEYS = 256;

type Entry = { t: number; v: unknown };
const store = new Map<string, Entry>();

/** Kembalikan nilai yang sudah di-cache (umur < 60 dtk), atau jalankan fn. */
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v as T;
  const v = await fn();
  store.set(key, { t: Date.now(), v });
  if (store.size > MAX_KEYS) {
    for (const [k, e] of [...store]) {
      if (store.size <= MAX_KEYS) break;
      if (Date.now() - e.t >= TTL_MS) store.delete(k); // buang yang basi dulu
    }
    while (store.size > MAX_KEYS) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest); // eviksi paling tua (urutan insert)
    }
  }
  return v;
}

/** Buang semua entri yang key-nya diawali `prefix` (mis. 'products:'). */
export function invalidate(prefix: string): void {
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
