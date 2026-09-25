/**
 * Unit test fetch-util.ts (UX-1b): fetchRetry + isAbort. Modul murni —
 * jalan LANGSUNG oleh Node (type-stripping), konvensi sama dgn
 * test-zakat: fetch dimock lewat globalThis, tanpa jaringan nyata.
 *     npm run test:fetch     (== node scripts/test-fetch-util.ts)
 *
 * Sifat yang diuji (sesuai keputusan UX-1b):
 *  - HANYA GET yang di-retry; 1 retry; backoff tetap 800ms (bukan
 *    eksponensial).
 *  - Retry pada: jaringan putus, timeout/abort, 5xx, 429.
 *  - TIDAK di-retry: 400/401/403/404 (galat logika/otorisasi),
 *    method non-GET, abort dari signal eksternal (unmount).
 *  - Gagal dua-duanya -> hasil/error TERAKHIR propagasi natural
 *    (tidak ada silent-undefined).
 */
import { fetchRetry, isAbort, RETRY_BACKOFF_MS } from '../src/lib/fetch-util.ts';

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.error('  FAIL ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mock fetch: urutan hasil per panggilan (Response = OK, Error = throw). */
type FetchResult = Response | Error;
function mockFetch(seq: FetchResult[]) {
  let n = 0;
  const f = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const r = seq[Math.min(n, seq.length - 1)]!;
    n++;
    if (r instanceof Error) throw r;
    // Hormati abort: fetchTimeout menggabungkan signal (eksternal atau
    // timer-nya sendiri) jadi satu AbortController lalu melewatkan
    // signal-nya ke fetch — bila sudah aborted, fetch asli melempar
    // AbortError.
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return r;
  };
  return { calls: () => n, fetch: f as unknown as typeof globalThis.fetch };
}

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;

  // ── konstanta & isAbort ──
  ok('backoff: tetap 800ms (bukan eksponensial)', RETRY_BACKOFF_MS === 800, String(RETRY_BACKOFF_MS));
  ok('isAbort: DOMException AbortError -> true', isAbort(new DOMException('x', 'AbortError')));
  ok('isAbort: Error jaringan biasa -> false', !isAbort(new Error('net')));

  // ── sukses percobaan pertama: hanya 1 panggilan, tanpa backoff ──
  {
    const m = mockFetch([jsonResponse(200)]);
    globalThis.fetch = m.fetch;
    const res = await fetchRetry('/test/success-first');
    ok('success-first: HTTP 200 lolos langsung', res.status === 200);
    ok('success-first: hanya 1 panggilan', m.calls() === 1, String(m.calls()));
  }

  // ── 503 -> 200: di-retry, akhirnya sukses ──
  {
    const m = mockFetch([jsonResponse(503), jsonResponse(200)]);
    globalThis.fetch = m.fetch;
    const res = await fetchRetry('/test/503-then-200');
    ok('5xx: 503 di-retry lalu 200', res.status === 200 && m.calls() === 2, 'calls=' + m.calls());
  }

  // ── 5xx dua kali: retry HANYA 1x, hasil terakhir propagasi ──
  {
    const m = mockFetch([jsonResponse(503), jsonResponse(502)]);
    globalThis.fetch = m.fetch;
    const res = await fetchRetry('/test/5xx-both');
    ok('5xx: dua-duanya gagal -> status TERAKHIR (502), tak ada loop', res.status === 502);
    ok('5xx: persis 2 panggilan (1 retry)', m.calls() === 2, String(m.calls()));
  }

  // ── 4xx: TIDAK di-retry (galat logika/otorisasi) ──
  for (const st of [400, 401, 403, 404]) {
    const m = mockFetch([jsonResponse(st)]);
    globalThis.fetch = m.fetch;
    const res = await fetchRetry('/test/4xx');
    ok('4xx: HTTP ' + st + ' tidak di-retry (1 panggilan)', res.status === st && m.calls() === 1);
  }

  // ── 429: di-retry (rate limit) ──
  {
    const m = mockFetch([jsonResponse(429), jsonResponse(200)]);
    globalThis.fetch = m.fetch;
    const res = await fetchRetry('/test/429');
    ok('429: di-retry lalu 200', res.status === 200 && m.calls() === 2, 'calls=' + m.calls());
  }

  // ── jaringan putus -> pulih ──
  {
    const m = mockFetch([new Error('fetch failed'), jsonResponse(200)]);
    globalThis.fetch = m.fetch;
    const res = await fetchRetry('/test/net-recover');
    ok('jaringan: putus lalu pulih -> 200', res.status === 200 && m.calls() === 2);
  }

  // ── jaringan dua-duanya gagal: error terakhir melempar ──
  {
    const m = mockFetch([new Error('fetch failed'), new Error('fetch failed')]);
    globalThis.fetch = m.fetch;
    let caught: unknown = null;
    try {
      await fetchRetry('/test/net-both');
    } catch (e) {
      caught = e;
    }
    ok(
      'jaringan: dua-duanya gagal -> error TERAKHIR propagasi',
      caught instanceof Error,
      String((caught as Error | null)?.message)
    );
    ok('jaringan: persis 2 panggilan', m.calls() === 2, String(m.calls()));
  }

  // ── timeout (AbortError) -> di-retry ──
  {
    const m = mockFetch([
      new DOMException('The operation was aborted.', 'AbortError'),
      jsonResponse(200),
    ]);
    globalThis.fetch = m.fetch;
    const res = await fetchRetry('/test/timeout-recover', undefined, 10);
    ok('timeout: AbortError di-retry lalu 200', res.status === 200 && m.calls() === 2);
  }

  // ── non-GET: TIDAK PERNAH di-retry (non-idempotent) ──
  {
    const m = mockFetch([jsonResponse(503)]);
    globalThis.fetch = m.fetch;
    const res = await fetchRetry('/test/post', { method: 'POST', body: '{}' });
    ok('POST: 503 pun tak di-retry (1 panggilan)', res.status === 503 && m.calls() === 1);
  }
  {
    const netErr = new Error('fetch failed');
    const m = mockFetch([netErr, netErr]);
    globalThis.fetch = m.fetch;
    let caught = false;
    try {
      await fetchRetry('/test/patch', { method: 'PATCH', body: '{}' });
    } catch {
      caught = true;
    }
    ok('PATCH: jaringan gagal -> propagasi tanpa retry', caught && m.calls() === 1, 'calls=' + m.calls());
  }

  // ── abort eksternal (unmount/cancel): jangan di-retry ──
  {
    const m = mockFetch([jsonResponse(200)]);
    globalThis.fetch = m.fetch;
    const ctrl = new AbortController();
    ctrl.abort();
    let caught: unknown = null;
    try {
      await fetchRetry('/test/external-abort', { signal: ctrl.signal });
    } catch (e) {
      caught = e;
    }
    ok('abort eksternal: tak di-retry (1 panggilan, error propagasi)', m.calls() === 1 && caught !== null);
  }

  globalThis.fetch = realFetch;

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();