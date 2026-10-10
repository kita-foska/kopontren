/**
 * P3d -- Util unduhan CSV admin (orkestrasi di sisi frontend).
 *
 * Tidak membuat endpoint agregasi server baru: helper ini membangun URL +
 * query periode utk endpoint CSV yang sudah ada (/api/reports/csv,
 * /api/keuangan/csv), lalu fetch -> blob -> objectURL -> unduh <a download>.
 * Modul berjalan BERURUTAN (bukan paralel) dengan state progress per modul
 * (sukses/gagal), timeout per modul (~10 dtk), dan abort controller (batal
 * manual / unmount).
 *
 * Sifat hermetis utk test Node (scripts/test-admin-export.ts): modul ini
 * TIDAK mengimpor apa pun (tanpa alias @/). Logika fetch + timeout sengaja
 * meniru src/lib/fetch-util.ts (FETCH_TIMEOUT_MS 10 dtk, AbortController +
 * gabung signal eksternal, isAbort) TANPA mengimpornya, agar test bisa
 * menjalankan file ini langsung lewat type-stripping Node.
 *
 * Tanpa emoji/unicode; ikon di UI memakai inline SVG (lihat
 * src/components/admin/ekspor/export-progress.tsx).
 */

/** Satu modul unduhan CSV (endpoint + label + parameter query + nama cadangan). */
export interface ExportTask {
  /** Kunci stabil (dipakai progress + dedup). */
  id: string;
  /** Label tampilan (Bahasa Indonesia, tanpa emoji). */
  label: string;
  /** Path endpoint CSV (mis. '/api/reports/csv'). */
  endpoint: string;
  /** Parameter query (periode dll.). */
  params: Record<string, string>;
  /** Nama file cadangan bila respons tanpa Content-Disposition. */
  fallbackFilename: string;
}

/** Status satu modul dalam progress. */
export type ExportStatus = 'idle' | 'running' | 'ok' | 'fail';

/** Status detail satu modul utk indikator progress. */
export interface ExportProgress {
  taskId: string;
  status: ExportStatus;
  /** Nama file yang diunduh (bila ok). */
  filename?: string;
  /** Ukuran byte (bila ok). */
  bytes?: number;
  /** Pesan galat / dibatalkan (bila fail). */
  error?: string;
}

/** Ringkasan hasil "Unduh semua". */
export interface DownloadAllSummary {
  ok: number;
  fail: number;
  /** true bila dibatalkan user (abort). */
  cancelled: boolean;
  results: ExportProgress[];
}

/** Opsi unduhan satu modul. */
export interface DownloadOneOpts {
  /** Sinyal pembatalan (batal manual / unmount). */
  signal?: AbortSignal;
  /** Timeout per modul (ms); default 10 dtk (meniru fetch-util). */
  timeoutMs?: number;
}

/** Opsi "Unduh semua" (berurutan). */
export interface DownloadAllOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Notifikasi progress per modul (saat mulai 'running' + hasil akhir). */
  onProgress?: (p: ExportProgress, index: number, total: number) => void;
}

/** Default timeout per modul (meniru FETCH_TIMEOUT_MS di fetch-util). */
export const EXPORT_TIMEOUT_MS = 10_000;

/** Daftar modul CSV (hard-code P3d; D2 -- tanpa endpoint manifest server). */
export const CSV_MODULES: ReadonlyArray<{ id: string; label: string; endpoint: string }> = [
  { id: 'penjualan', label: 'Penjualan (detail)', endpoint: '/api/reports/csv' },
  { id: 'laba-rugi', label: 'Laba-Rugi V1', endpoint: '/api/keuangan/csv' },
];

/**
 * Bangun tugas unduhan utk tiap modul dari rentang periode (WIB,
 * YYYY-MM-DD). /api/reports/csv hanya membaca `from` (cap 365 hari di
 * server); /api/keuangan/csv membaca `from` + `to` (span maks 3650 hari).
 */
export function buildExportTasks(period: { from: string; to: string }): ExportTask[] {
  return CSV_MODULES.map((m) => {
    const params: Record<string, string> = { from: period.from };
    // Laba-Rugi memakai rentang penuh (from s.d. to); penjualan hanya from.
    if (m.id === 'laba-rugi') params.to = period.to;
    return {
      id: m.id,
      label: m.label,
      endpoint: m.endpoint,
      params,
      fallbackFilename: 'kopontren-' + m.id + '.csv',
    };
  });
}

/** Susun URL `?k=v&...` dari endpoint + param (nilai kosong di-skip). */
export function buildExportUrl(endpoint: string, params: Record<string, string>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    .join('&');
  return qs ? endpoint + '?' + qs : endpoint;
}

/** Ambil nama file dari Content-Disposition; fallback bila tidak ada. */
export function parseFilenameFromResponse(res: Response, fallback: string): string {
  const cd = res.headers.get('Content-Disposition') || '';
  if (cd) {
    // Prefer `filename*=...`, lalu `filename="..."`. Karakter nama file di
    // endpoint sudah di-sanitize ([A-Za-z0-9._-]) -> regex aman.
    const star = cd.match(/filename\*\s*=\s*(?:UTF-8'')?"?([A-Za-z0-9._-]+)\s*"?/i);
    if (star && star[1]) return star[1];
    const plain = cd.match(/filename\s*=\s*"?([A-Za-z0-9._-]+)"?/i);
    if (plain && plain[1]) return plain[1];
  }
  return fallback;
}

/**
 * Picu unduhan di browser: objectURL + <a download>. Di Node/SSR (tanpa
 * document) menjadi no-op agar test tetap jalan.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke setelah klik diproses frame berikutnya.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** true bila error berasal dari abort (timeout timer / pembatalan user). */
export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * Unduh SATU modul CSV: fetch (timeout + abort) -> cek status -> blob ->
 * picu unduhan. Melempar Error bila HTTP tak ok (pesan dari body JSON bila
 * ada), agar pemanggil bisa menampilkan pesan galat per modul.
 */
export async function downloadExportCsv(
  task: ExportTask,
  opts: DownloadOneOpts = {},
): Promise<{ filename: string; bytes: number }> {
  const url = buildExportUrl(task.endpoint, task.params);
  const timeoutMs = opts.timeoutMs ?? EXPORT_TIMEOUT_MS;

  // Gabung timeout per-modul + signal eksternal jadi satu AbortController
  // (pola fetch-util.fetchTimeout).
  const ctrl = new AbortController();
  const onExtAbort = (): void => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', onExtAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExtAbort);
  }

  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try {
      const j = await res.json();
      if (j && typeof j.error === 'string') detail = j.error;
    } catch {
      // Body bukan JSON -> pertahankan status.
    }
    throw new Error('Gagal unduh ' + task.label + ': ' + detail);
  }

  const blob = await res.blob();
  const filename = parseFilenameFromResponse(res, task.fallbackFilename);
  triggerBrowserDownload(blob, filename);
  return { filename, bytes: blob.size };
}

/**
 * "Unduh semua": jalankan modul BERURUTAN (bukan paralel) agar unduhan
 * besar tidak menumpuk. Gagal satu modul TIDAK menghentikan modul lain.
 * Pembatalan user (abort) menghentikan loop.
 */
export async function downloadAll(
  tasks: ExportTask[],
  opts: DownloadAllOpts = {},
): Promise<DownloadAllSummary> {
  const results: ExportProgress[] = tasks.map((t) => ({ taskId: t.id, status: 'idle' }));
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < tasks.length; i++) {
    // Batal user -> hentikan (modul sisa tetap idle).
    if (opts.signal?.aborted) break;

    const t = tasks[i];
    opts.onProgress?.({ taskId: t.id, status: 'running' }, i, tasks.length);

    try {
      const r = await downloadExportCsv(t, { signal: opts.signal, timeoutMs: opts.timeoutMs });
      results[i] = { taskId: t.id, status: 'ok', filename: r.filename, bytes: r.bytes };
      ok += 1;
    } catch (e) {
      const aborted = opts.signal?.aborted;
      results[i] = {
        taskId: t.id,
        status: 'fail',
        error: aborted
          ? 'Dibatalkan'
          : isAbortError(e)
            ? 'Waktu habis (timeout)'
            : e instanceof Error
              ? e.message
              : String(e),
      };
      fail += 1;
      // Pembatalan user -> berhenti (modul berikutnya tidak diproses).
      if (aborted) break;
    }

    opts.onProgress?.(results[i], i, tasks.length);
  }

  return { ok, fail, cancelled: Boolean(opts.signal?.aborted), results };
}