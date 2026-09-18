/**
 * Tiny per-instance in-memory TTL cache for low-churn reads.
 *
 * Lives in the serverless function's heap: shared across warm invocations of
 * the same container (Vercel reuses containers for bursts), gone on cold
 * start. That is exactly what we want here — it de-duplicates repeated
 * identical reads (managers reloading the reports page, POS clients polling
 * products) without persisting anything and without adding a shared store.
 */
type Entry = { value: string; exp: number };
const cache = new Map<string, Entry>();
const MAX_ENTRIES = 100;

/** Return the cached JSON string, or null when absent/expired. */
export function ttlGet(key: string): string | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    cache.delete(key);
    return null;
  }
  return e.value;
}

/** Store value (serialized JSON) for ttlMs. */
export function ttlSet(key: string, value: string, ttlMs: number): void {
  cache.set(key, { value, exp: Date.now() + ttlMs });
  if (cache.size > MAX_ENTRIES) {
    // Drop expired first (Map keeps insertion order, so stale ones age out).
    for (const [k, e] of [...cache]) {
      if (cache.size <= MAX_ENTRIES) break;
      if (Date.now() > e.exp) cache.delete(k);
    }
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
}

/** Drop a key (cache invalidation after a write). */
export function ttlDel(key: string): void {
  cache.delete(key);
}
