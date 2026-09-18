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
 */
const TTL_MS = 60_000;

type Entry = { t: number; v: unknown };
const store = new Map<string, Entry>();

/** Kembalikan nilai yang sudah di-cache (umur < 60 dtk), atau jalankan fn. */
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v as T;
  const v = await fn();
  store.set(key, { t: Date.now(), v });
  return v;
}

/** Buang semua entri yang key-nya diawali `prefix` (mis. 'products:'). */
export function invalidate(prefix: string): void {
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
