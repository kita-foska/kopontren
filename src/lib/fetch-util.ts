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

/** Backoff tetap utk retry (bukan eksponensial — hanya 1 retry). */
export const RETRY_BACKOFF_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Status HTTP yang layak diulang (transien; bukan galat logika klien). */
function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * fetchTimeout + 1 retry otomatis HANYA untuk GET (idempotent, aman
 * diulang). Retry memicu pada:
 *  - kegagalan jaringan (offline / DNS / koneksi putus),
 *  - timeout abort (Vercel cold start / Turso lambat / device tertidur),
 *  - respons 5xx (gateway hiccup) dan 429 (rate limit).
 *
 * TIDAK diulang: 4xx lain (400/401/403/404 — galat logika/otorisasi),
 * method selain GET (POST/PATCH/DELETE non-idempotent), dan abort dari
 * `init.signal` eksternal (unmount/cancel manual — jangan paksa ulang).
 *
 * Bila kedua percobaan gagal, hasil/error TERAKHIR dilewati apa adanya
 * (propagasi natural) — caller tetap melihat kesalahan standar, tidak ada
 * silent-undefined.
 *
 * Setiap percobaan retry DICATAT via console.error (bukan silent) agar
 * mudah didiagnosis di devtools; galat akhirnya tetap propagasi natural
 * (caller menampilkan state pesan galat — pola UX-0).
 *
 * ATURAN: GET = auto-retry 1x; POST/PUT/DELETE/PATCH = manual ("Coba
 * lagi") — non-idempotent, risiko double-submit bila diulang otomatis.
 */
export async function fetchRetry(
  url: string,
  init?: RequestInit,
  ms: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    // Non-idempotent: jangan pernah diulang — perilaku sama persis dgn fetchTimeout.
    return fetchTimeout(url, init, ms);
  }
  try {
    const res = await fetchTimeout(url, init, ms);
    if (!isRetriableStatus(res.status)) return res;
    // 5xx/429: log (bukan silent), tunggu backoff lalu ulangi satu kali.
    console.error(
      `[fetchRetry] GET ${url} -> HTTP ${res.status}; retry dalam ${RETRY_BACKOFF_MS}ms`
    );
    await sleep(RETRY_BACKOFF_MS);
    return fetchTimeout(url, init, ms);
  } catch (e) {
    // Abort dari signal eksternal (unmount/cancel) → jangan retry.
    if (init?.signal?.aborted) throw e;
    // Jaringan/timeout: log (bukan silent), tunggu backoff lalu ulangi satu
    // kali. (Percobaan kedua boleh gagal lagi — galatnya propagasi natural.)
    console.error(
      `[fetchRetry] GET ${url} gagal (${(e as Error)?.name ?? String(e)}); retry dalam ${RETRY_BACKOFF_MS}ms`,
      e
    );
    await sleep(RETRY_BACKOFF_MS);
    return fetchTimeout(url, init, ms);
  }
}
