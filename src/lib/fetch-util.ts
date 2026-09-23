/**
 * Utilitas fetch KLIEN: timeout via AbortController agar request tidak
 * menggantung selamanya (Vercel cold start + Turso lambat, jaringan lemah,
 * device tertidur, dll).
 *
 * Default 10 detik -> abort -> caller menangkap AbortError dan fallback ke
 * error state yang sudah ada (toast / pesan galat / tombol coba lagi).
 *
 * Client-only: pakai global fetch + AbortController browser. Jangan import
 * dari API route (fetch server punya penanganan timeoutnya sendiri).
 */
export const FETCH_TIMEOUT_MS = 10_000;

/** true bila error berasal dari abort timeout (bukan kesalahan jaringan lain). */
export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * fetch dengan abort timeout. `ms` opsional (default 10 dtk).
 * Bila `init.signal` sudah diset (unmount / cancel manual), digabung:
 * abort terjadi jika salah satu memicu.
 */
export async function fetchTimeout(
  url: string,
  init?: RequestInit,
  ms: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const ctrl = new AbortController();
  if (init?.signal) {
    if (init.signal.aborted) ctrl.abort();
    else init.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
