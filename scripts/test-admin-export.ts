/**
 * P3d -- Unit test src/lib/admin/export-download.ts (util unduhan CSV admin).
 * Node langsung (type-stripping, Node >= 23.6), konvensi sama dgn
 * test-fetch-util.ts: fetch dimock lewat globalThis, tanpa jaringan nyata.
 *     npm run test:admin-export   (== node scripts/test-admin-export.ts)
 *
 * Sifat yang diuji:
 *  - buildExportUrl: susun query, skip nilai kosong, encode karakter khusus.
 *  - parseFilenameFromResponse: baca Content-Disposition (filename /
 *    filename*), fallback bila tidak ada.
 *  - buildExportTasks: penjualan hanya `from`; laba-rugi `from`+`to`.
 *  - downloadExportCsv: sukses (nama dari Content-Disposition + bytes);
 *    gagal HTTP -> lempar dengan pesan dari body JSON.
 *  - downloadAll: berurutan; gagal satu modul TIDAK menghentikan lainnya;
 *    onProgress dipanggil; abort user -> berhenti.
 */
import {
  buildExportTasks,
  buildExportUrl,
  parseFilenameFromResponse,
  downloadExportCsv,
  downloadAll,
  CSV_MODULES,
} from '../src/lib/admin/export-download.ts';

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

/** CSV 200 + header Content-Disposition utk file `name`. */
function csvResponse(name: string, body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + name + '"',
    },
  });
}

/** Respons JSON galat (4xx/5xx). */
function errResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Handler = (url: string, init?: RequestInit) => Response;
function mockFetch(handler: Handler) {
  const urls: string[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const u = String(input);
    urls.push(u);
    // Hormati abort (sinyal gabungan dari timeout / pembatalan user).
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return handler(u, init);
  };
  return { urls, f: f as unknown as typeof globalThis.fetch };
}

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;

  // -- buildExportUrl --
  ok('url: tanpa param -> endpoint apa adanya', buildExportUrl('/api/x/csv', {}) === '/api/x/csv');
  ok(
    'url: param disusun k=v&...',
    buildExportUrl('/api/keuangan/csv', { from: '2025-09-01', to: '2025-09-30' }) ===
      '/api/keuangan/csv?from=2025-09-01&to=2025-09-30',
  );
  ok(
    'url: nilai kosong di-skip',
    buildExportUrl('/api/x/csv', { from: '', to: '2025-09-30' }) === '/api/x/csv?to=2025-09-30',
  );
  ok(
    'url: karakter khusus di-encode',
    buildExportUrl('/api/x/csv', { q: 'a b&c' }) === '/api/x/csv?q=' + encodeURIComponent('a b&c'),
  );

  // -- parseFilenameFromResponse --
  ok(
    'nama: dari Content-Disposition filename=',
    parseFilenameFromResponse(
      new Response('x', { headers: { 'Content-Disposition': 'attachment; filename="kopontren-laba-rugi-2025-09-01-2025-09-30.csv"' } }),
      'fallback.csv',
    ) === 'kopontren-laba-rugi-2025-09-01-2025-09-30.csv',
  );
  ok(
    'nama: dari Content-Disposition filename* (UTF-8)',
    parseFilenameFromResponse(
      new Response('x', { headers: { 'Content-Disposition': "attachment; filename*=UTF-8''laba.csv" } }),
      'fallback.csv',
    ) === 'laba.csv',
  );
  ok(
    'nama: fallback bila tidak ada header',
    parseFilenameFromResponse(new Response('x'), 'fallback.csv') === 'fallback.csv',
  );

  // -- buildExportTasks --
  const tasks = buildExportTasks({ from: '2025-09-01', to: '2025-09-30' });
  ok('tugas: 2 modul (penjualan + laba-rugi)', tasks.length === 2);
  ok('tugas: penjualan hanya from', JSON.stringify(tasks[0].params) === JSON.stringify({ from: '2025-09-01' }));
  ok('tugas: laba-rugi from+to', JSON.stringify(tasks[1].params) === JSON.stringify({ from: '2025-09-01', to: '2025-09-30' }));
  ok(
    'tugas: endpoint sesuai modul',
    tasks[0].endpoint === CSV_MODULES[0].endpoint && tasks[1].endpoint === CSV_MODULES[1].endpoint,
  );

  // -- downloadExportCsv: sukses --
  {
    const m = mockFetch(() => csvResponse('kopontren-penjualan-2025-09-01.csv', 'a,b\n1,2\n'));
    globalThis.fetch = m.f;
    const t = buildExportTasks({ from: '2025-09-01', to: '2025-09-30' })[0];
    const r = await downloadExportCsv(t, { timeoutMs: 1000 });
    ok('unduh sukses: nama dari header', r.filename === 'kopontren-penjualan-2025-09-01.csv');
    ok('unduh sukses: bytes > 0', r.bytes > 0, String(r.bytes));
    ok('unduh sukses: URL benar (from saja)', m.urls[0] === '/api/reports/csv?from=2025-09-01', m.urls[0]);
  }

  // -- downloadExportCsv: gagal HTTP (403) -> lempar + pesan --
  {
    const m = mockFetch(() => errResponse(403, 'Hanya admin/manajer/pengurus'));
    globalThis.fetch = m.f;
    const t = buildExportTasks({ from: '2025-09-01', to: '2025-09-30' })[1];
    let caught: unknown = null;
    try {
      await downloadExportCsv(t, { timeoutMs: 1000 });
    } catch (e) {
      caught = e;
    }
    ok('unduh gagal: 403 -> melempar', caught instanceof Error);
    ok(
      'unduh gagal: pesan dari JSON error',
      (caught as Error).message.includes('Hanya admin/manajer/pengurus'),
      (caught as Error).message,
    );
  }

  // -- downloadAll: berurutan, gagal tak menghentikan --
  {
    const m = mockFetch((url) =>
      url.includes('keuangan') ? csvResponse('kopontren-laba-rugi.csv', 'item,nilai\n') : errResponse(403, 'Hanya admin/manajer/pengurus'),
    );
    globalThis.fetch = m.f;
    const ts = buildExportTasks({ from: '2025-09-01', to: '2025-09-30' });
    const events: string[] = [];
    const summary = await downloadAll(ts, {
      timeoutMs: 1000,
      onProgress: (p) => {
        events.push(p.taskId + ':' + p.status);
      },
    });
    ok('semua: ok=1 fail=1', summary.ok === 1 && summary.fail === 1, 'ok=' + summary.ok + ' fail=' + summary.fail);
    ok('semua: tak dibatalkan', summary.cancelled === false);
    ok('semua: penjualan gagal, laba-rugi ok', summary.results[0].status === 'fail' && summary.results[1].status === 'ok');
    ok('semua: laba-rugi bytes > 0', (summary.results[1].bytes ?? 0) > 0);
    ok('semua: keduanya diproses (berurutan)', m.urls.length === 2, String(m.urls.length));
    ok(
      'semua: onProgress running dulu + hasil akhir',
      events.includes('penjualan:running') && events.includes('laba-rugi:ok'),
      events.join(','),
    );
  }

  // -- downloadAll: abort user -> stop, 0 diproses --
  {
    const m = mockFetch(() => csvResponse('x.csv', 'a\n'));
    globalThis.fetch = m.f;
    const ctrl = new AbortController();
    ctrl.abort(); // sebelum mulai
    const ts = buildExportTasks({ from: '2025-09-01', to: '2025-09-30' });
    const summary = await downloadAll(ts, { signal: ctrl.signal, timeoutMs: 1000 });
    ok('abort: dibatalkan', summary.cancelled === true);
    ok('abort: tak ada yang diproses', summary.ok === 0 && summary.fail === 0);
    ok('abort: modul tetap idle', summary.results.every((r) => r.status === 'idle'));
    ok('abort: fetch tidak dipanggil', m.urls.length === 0, String(m.urls.length));
  }

  globalThis.fetch = realFetch;

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();