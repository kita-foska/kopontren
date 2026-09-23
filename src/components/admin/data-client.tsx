'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  Badge,
  Toast,
  useConfirm,
  useToast,
  useTablistNav,
} from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { AlertTriangle, Download, FileSpreadsheet, Package } from 'lucide-react';

type Log = {
  id: number;
  user_id: number;
  username: string;
  action: string;
  table_name: string;
  record_id: number | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};
type AuditResp = { logs: Log[]; tables: string[] };

export function DataClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();
  const [activeTab, setActiveTab] = useState<'backup' | 'audit'>('backup');
  // Keyboard nav tablist: ArrowRight/Left (wrap) + Home/End, aktivasi
  // otomatis (WCAG 16.20 / APG tabs).
  const { onTabKeyDown } = useTablistNav<'backup' | 'audit'>(
    (i) => (i === 0 ? 'backup' : 'audit'),
    setActiveTab
  );

  // Audit log states
  const [logs, setLogs] = useState<Log[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [tableFilter, setTableFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canMore, setCanMore] = useState(false);

  const loadLogs = useCallback(async (offset = 0, append = false) => {
    // Server cap 50 baris/halaman (target Rows Read); "Muat lebih banyak"
    // melanjutkan dari offset halaman terakhir.
    const url = `/api/audit?limit=${limit}&offset=${offset}${tableFilter ? '&table=' + tableFilter : ''}`;
    const r = await api<AuditResp & { limit?: number; offset?: number }>(url);
    if (r.ok && r.data) {
      setLogs((prev) => {
        const got = r.data!.logs || [];
        if (!append) return got;
        const seen = new Set((prev || []).map((l) => l.id));
        return [...(prev || []), ...got.filter((l) => !seen.has(l.id))];
      });
      setTables(r.data.tables || []);
      setCanMore((r.data.logs?.length || 0) >= 50);
    }
  }, [limit, tableFilter]);

  const loadMoreLogs = useCallback(async () => {
    if (loadingMore || !canMore) return;
    setLoadingMore(true);
    await loadLogs(logs.length, true);
    setLoadingMore(false);
  }, [loadingMore, canMore, loadLogs, logs.length]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadLogs();
    }
  }, [activeTab, loadLogs]);

  /** Unduh via fetch -> Blob -> objectURL: tanpa tab baru/flicker,
   *  dengan busy-state & toast. (window.open('/api/...') membuka tab
   *  kosong dulu sebelum download — pengalaman buruk di browser modern.) */
  async function downloadFile(url: string, filename: string) {
    if (busy) return;
    setBusy('dl');
    try {
      const r = await fetch(url);
      if (!r.ok) {
        let msg = 'HTTP ' + r.status;
        try {
          const j = (await r.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* respons non-JSON */
        }
        showToast('Gagal unduh: ' + msg);
        return;
      }
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      showToast('Unduhan dimulai: ' + filename);
    } catch {
      showToast('Gagal unduh (jaringan)');
    } finally {
      setBusy('');
    }
  }

  const todayStr = () => new Date().toISOString().slice(0, 10);

  function exportJson() {
    void downloadFile('/api/backup', 'kopontren-backup-' + todayStr() + '.json');
  }

  function exportSalesCsv() {
    void downloadFile(
      '/api/reports/csv?from=1970-01-01',
      'penjualan-' + todayStr() + '.csv'
    );
  }

  function importJson(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    ask({
      title: 'Import backup JSON',
      message:
        'Import akan MENGGANTIKAN seluruh data: produk, penjualan, retur, piutang, hutang dagang, belanja, pengeluaran, jurnal kas, member, shift, notifikasi (termasuk pengaturan) & audit log. Lanjutkan?',
      confirmLabel: 'Import & Ganti Data',
      proceed: async () => {
        setBusy('import');
        const text = await file.text();
        const r = await api('/api/backup', { method: 'POST', body: text });
        setBusy('');
        if (r.ok) showToast('Backup berhasil diimport');
        else showToast(r.error || 'Import gagal');
      },
    });
  }

  function resetAll() {
    ask({
      title: 'Reset seluruh data',
      message:
        'HAPUS SEMUA DATA operasi (produk, penjualan, retur, piutang, hutang dagang, belanja, pengeluaran, jurnal, konsinyasi, member, notifikasi)? Akun pengguna, audit log & pengaturan tetap ada.\nKonfirmasi terakhir: data HILANG PERMANEN (kecuali file backup). Tindakan ini TIDAK BISA DIBATALKAN!',
      confirmLabel: 'Hapus Semua',
      proceed: async () => {
        setBusy('reset');
        const r = await api('/api/backup/reset', { method: 'POST' });
        setBusy('');
        if (r.ok) showToast('Semua data operasional dihapus');
        else showToast(r.error || 'Gagal menghapus');
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2 dark:border-navy-700" role="tablist" onKeyDown={onTabKeyDown}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'backup'}
          onClick={() => setActiveTab('backup')}
          className={
            'rounded-lg px-4 py-2 text-sm font-bold transition ' +
            (activeTab === 'backup'
              ? 'bg-accent-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800')
          }
        >
          Backup & Ekspor Data
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audit'}
          onClick={() => setActiveTab('audit')}
          className={
            'rounded-lg px-4 py-2 text-sm font-bold transition ' +
            (activeTab === 'audit'
              ? 'bg-accent-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800')
          }
        >
          Audit Log (Rekam Jejak)
        </button>
      </div>

      {activeTab === 'backup' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="card flex flex-col justify-between p-4">
            <div>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/15 text-accent-600 dark:text-accent-300">
                <Package className="h-5 w-5" />
              </div>
              <h2 className="mb-1 font-bold">Backup JSON</h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Unduh salinan lengkap seluruh database (produk, penjualan, retur, piutang, hutang dagang, kas, konsinyasi, member, shift, notifikasi, pengaturan notifikasi & audit log) untuk arsip / pindah server.
              </p>
            </div>
            <button type="button"
              className="btn-primary w-full"
              disabled={busy === 'dl'}
              onClick={exportJson}
            >
              {busy === 'dl' ? 'Mengunduh…' : 'Unduh Backup JSON'}
            </button>
          </div>

          <div className="card flex flex-col justify-between p-4">
            <div>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <h2 className="mb-1 font-bold">Ekspor Excel / CSV</h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Unduh rekap detail semua transaksi item penjualan format CSV yang bisa dibuka langsung di Microsoft Excel.
              </p>
            </div>
            <button type="button"
              className="btn-ghost w-full font-bold"
              disabled={busy === 'dl'}
              onClick={exportSalesCsv}
            >
              {busy === 'dl' ? 'Mengunduh…' : 'Unduh CSV Penjualan'}
            </button>
          </div>

          <div className="card flex flex-col justify-between p-4">
            <div>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
                <Download className="h-5 w-5" />
              </div>
              <h2 className="mb-1 font-bold">Import Backup</h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Pulihkan seluruh data dari file backup JSON Kopontren (termasuk piutang, hutang dagang, riwayat retur, notifikasi, pengaturan notifikasi & audit log). Data saat ini akan ditimpa.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={importJson}
            />
            <button type="button"
              className="btn-ghost w-full font-bold"
              disabled={busy === 'import'}
              onClick={() => fileRef.current?.click()}
            >
              {busy === 'import' ? 'Memproses…' : 'Pilih File Backup'}
            </button>
          </div>

          <div className="card flex flex-col justify-between border-rose-200 bg-rose-50/20 p-4 dark:border-rose-950 dark:bg-rose-950/10">
            <div>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="mb-1 font-bold text-rose-600 dark:text-rose-400">Reset Total Data</h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Kosongkan seluruh data operasional (penjualan, retur, piutang, hutang dagang, stok, kas, konsinyasi, notifikasi). Akun login pengurus, audit log & pengaturan tetap aman.
              </p>
            </div>
            <button type="button"
              className="btn-danger w-full"
              disabled={busy === 'reset'}
              onClick={resetAll}
            >
              {busy === 'reset' ? 'Menghapus…' : 'Hapus Semua Data'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <select
                className="input w-auto text-xs"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
              >
                <option value="">Semua entitas</option>
                {tables.map((t) => (
                  <option key={t} value={t}>
                    Tabel: {t}
                  </option>
                ))}
              </select>
              <select
                className="input w-auto text-xs"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 50)}
              >
                <option value={25}>25 log</option>
                <option value={50}>50 log</option>
              </select>
            </div>
            <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => loadLogs()}>
              Refresh Log
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-700">
                  <th className="th">Waktu</th>
                  <th className="th">Pengguna</th>
                  <th className="th">Aksi</th>
                  <th className="th">Entitas / ID</th>
                  <th className="th">Perubahan Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="table-row hover:bg-slate-50/50 dark:hover:bg-navy-800/50">
                    <td className="td whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                      {fmtDateTime(l.created_at)}
                    </td>
                    <td className="td font-bold text-slate-800 dark:text-slate-200">
                      {l.username || 'Sistem'}
                    </td>
                    <td className="td">
                      <Badge
                        tone={
                          l.action.includes('delete') || l.action.includes('reset')
                            ? 'red'
                            : l.action.includes('create')
                            ? 'green'
                            : 'blue'
                        }
                      >
                        {l.action}
                      </Badge>
                    </td>
                    <td className="td text-xs font-mono text-slate-600 dark:text-slate-300">
                      {l.table_name} {l.record_id != null ? '#' + l.record_id : ''}
                    </td>
                    <td className="td max-w-xs truncate text-xs text-slate-500 dark:text-slate-400">
                      {l.new_value || l.old_value || '—'}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td className="td py-8 text-center text-sm text-slate-500" colSpan={5}>
                      Belum ada riwayat aktivitas yang tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {canMore && (
            <div className="p-1 text-center">
              <button type="button" className="btn-ghost text-xs" onClick={loadMoreLogs} disabled={loadingMore}>
                {loadingMore ? 'Memuat…' : 'Muat lebih banyak log'}
              </button>
            </div>
          )}
        </div>
      )}

      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
