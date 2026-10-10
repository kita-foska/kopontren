'use client';

/**
 * P3d -- Pusat Ekspor admin: daftar modul CSV + pilihan periode + tombol
 * Unduh per modul & Unduh semua (berurutan, progress per modul, abort) +
 * Cetak formal (re-use /admin/laporan -> GET /api/laporan/formal).
 * Orkestrasi di sisi frontend; TANPA endpoint agregasi server.
 * Gaya Tailwind + class .card; ikon inline SVG (export-progress).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { startOfDayJakarta, todayWibStr } from '@/lib/format';
import {
  CSV_MODULES,
  buildExportTasks,
  downloadAll,
  downloadExportCsv,
  type ExportProgress,
  type ExportTask,
} from '@/lib/admin/export-download';
import { ExportProgressList, type ExportProgressItem } from './export-progress';

export function ExportCenterClient() {
  // Periode default: bulan berjalan (from = 29 hari lalu WIB, to = hari ini).
  const [from, setFrom] = useState<string>(() => startOfDayJakarta(-29).slice(0, 10));
  const [to, setTo] = useState<string>(() => todayWibStr());
  const [items, setItems] = useState<ExportProgressItem[]>(() =>
    CSV_MODULES.map((m) => ({ taskId: m.id, status: 'idle', label: m.label })),
  );
  const [busy, setBusy] = useState(false);
  const allAbortRef = useRef<AbortController | null>(null);

  // Batalkan unduhan "semua" yang sedang berjalan saat halaman ditutup.
  useEffect(() => {
    return () => {
      allAbortRef.current?.abort();
    };
  }, []);

  const tasks = useMemo(() => buildExportTasks({ from, to }), [from, to]);
  const statusByTask = useMemo(
    () => new Map(items.map((i) => [i.taskId, i] as const)),
    [items],
  );

  const validPeriod = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);

  function patch(taskId: string, p: Omit<ExportProgress, 'taskId'>) {
    setItems((prev) => prev.map((it) => (it.taskId === taskId ? { ...it, ...p } : it)));
  }

  /** Unduh SATU modul CSV (timeout per modul; tak memblokir modul lain). */
  async function downloadOne(taskId: string): Promise<void> {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || busy || !validPeriod) return;
    patch(taskId, { status: 'running' });
    try {
      const r = await downloadExportCsv(task, {});
      patch(taskId, { status: 'ok', filename: r.filename, bytes: r.bytes });
    } catch (e) {
      patch(taskId, { status: 'fail', error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Unduh semua modul BERURUTAN (gagal satu tak menghentikan lainnya). */
  async function downloadAllModules(): Promise<void> {
    if (busy || !validPeriod) return;
    const ctrl = new AbortController();
    allAbortRef.current = ctrl;
    setBusy(true);
    setItems(CSV_MODULES.map((m) => ({ taskId: m.id, status: 'idle', label: m.label })));
    await downloadAll(tasks, {
      signal: ctrl.signal,
      onProgress: (p) => patch(p.taskId, p),
    });
    setBusy(false);
  }

  function cancelAll(): void {
    allAbortRef.current?.abort();
  }

  /** Cetak formal: re-use /admin/laporan (LaporanFormalClient -> /api/laporan/formal). */
  function openFormal(): void {
    if (!validPeriod) return;
    // as_of = batas periode (to); tab baru agar dialog print ada di sana.
    window.open('/admin/laporan?periode=' + encodeURIComponent(to), '_blank', 'noopener');
  }

  return (
    <div className="space-y-4">
      {/* Periode + aksi utama */}
      <div className="card p-4">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Periode ekspor (WIB)
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-xs text-slate-500 dark:text-slate-400">
            Dari
            <input
              type="date"
              className="input mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="block text-xs text-slate-500 dark:text-slate-400">
            Sampai
            <input
              type="date"
              className="input mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button
            onClick={downloadAllModules}
            disabled={!validPeriod || busy}
            loading={busy}
            loadingLabel="Mengunduh..."
          >
            Unduh semua
          </Button>
          <Button variant="ghost" onClick={openFormal} disabled={!validPeriod}>
            Cetak formal
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Unduhan berjalan berurutan; gagal satu modul tidak menghentikan modul lain.
          Cetak formal membuka /admin/laporan s.d. {to} (re-use /api/laporan/formal) pada
          tab baru -- cetak lewat dialog print browser.
        </p>
      </div>

      {/* Daftar modul */}
      <div className="card p-4">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Modul CSV</h2>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-navy-700">
          {tasks.map((t: ExportTask) => {
            const st = statusByTask.get(t.id);
            const stCls =
              st?.status === 'ok'
                ? 'text-emerald-600 dark:text-emerald-400'
                : st?.status === 'fail'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-400 dark:text-slate-500';
            const stText =
              st?.status === 'ok'
                ? st.filename
                  ? 'sukses - ' + st.filename
                  : 'sukses'
                : st?.status === 'fail'
                  ? st.error
                    ? 'gagal - ' + st.error
                    : 'gagal'
                  : st?.status === 'running'
                    ? 'mengunduh...'
                    : 'siap';
            return (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.label}
                  </p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {t.endpoint}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span className={'text-xs ' + stCls}>{stText}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadOne(t.id)}
                    disabled={!validPeriod || busy}
                  >
                    Unduh
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Progress */}
      <div className="card p-4">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Progress</h2>
        <div className="mt-3">
          <ExportProgressList items={items} busy={busy} onCancel={cancelAll} />
        </div>
      </div>
    </div>
  );
}