'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageSkeleton, api, Badge, Toast, useConfirm, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';
import { buildRekapMsg, shareRekap, type RekapSale } from '@/lib/rekap';
import { parsePaySplit, payMethodLabel } from '@/lib/pay-methods';
import { ChevronDown, FileDown, FileText, Smartphone } from 'lucide-react';

type Sale = {
  id: number;
  kasir_name: string;
  customer: string;
  pay_method: string;
  pay_split?: string;
  status: string;
  total: number;
  created_at: string;
  items: { product_name: string; qty: number; unit: string; unit_price: number; subtotal: number }[];
};
type ListResp = { sales: Sale[]; total?: number };

export function LaporanClient({ admin, scope = 'all' }: { admin: boolean; scope?: 'all' | 'today' }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  // Total baris dari server (COUNT /api/sales) — "N" utk notifikasi
  // "Menampilkan X dari N transaksi" (bukan jumlah baris yang sudah termuat).
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState(scope === 'today' ? 1 : 7);
  const [statusF, setStatusF] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();
  const [undoMsg, setUndoMsg] = useState('');
  const [undoIds, setUndoIds] = useState<number[]>([]);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  // Muat daftar transaksi dengan pagination (server default limit 50).
  // Loop memakai offset sampai halaman < limit (maks. 500 baris) — rekap
  // tetap lengkap, tapi tiap request kecil & Turso Rows Read per request
  // tetap rendah.
  const load = useCallback(async () => {
    setLoading(true);
    const all: Sale[] = [];
    const PAGE = 50;
    try {
      let totalSeen = 0;
      for (let offset = 0; ; offset += PAGE) {
        const r = await api<ListResp>(
          '/api/sales?days=' + period + '&status=' + (statusF || 'all') + '&limit=' + PAGE + '&offset=' + offset
        );
        if (!r.ok || !r.data) break;
        if (typeof r.data.total === 'number') totalSeen = r.data.total;
        const page = r.data.sales || [];
        all.push(...page);
        if (page.length < PAGE || all.length >= 500) break;
      }
      setSales(all);
      setTotal(totalSeen || all.length);
    } finally {
      setLoading(false);
    }
  }, [period, statusF]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredSales = useMemo(() => {
    if (!q.trim()) return sales;
    const term = q.trim().toLowerCase();
    return sales.filter((s) => {
      const matchCust = (s.customer || '').toLowerCase().includes(term);
      const matchKasir = (s.kasir_name || '').toLowerCase().includes(term);
      const matchId = ('#' + s.id).includes(term) || String(s.id).includes(term);
      const matchItem = s.items.some((it) => it.product_name.toLowerCase().includes(term));
      return matchCust || matchKasir || matchId || matchItem;
    });
  }, [sales, q]);

  const unreported = filteredSales.filter((s) => s.status === 'unreported');
  const unreportedTotal = unreported.reduce((a, s) => a + s.total, 0);
  const grandTotal = filteredSales.reduce((a, s) => a + s.total, 0);

  async function toggleStatus(s: Sale) {
    const next = s.status === 'unreported' ? 'reported' : 'unreported';
    await api('/api/sales/' + s.id, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    showToast(
      next === 'reported'
        ? 'Transaksi #' + s.id + ' ditandai Sudah Dilapor'
        : 'Transaksi #' + s.id + ' dikembalikan ke Belum Dilapor'
    );
    load();
  }

  function remove(id: number) {
    ask({
      title: 'Hapus transaksi',
      message: 'Hapus transaksi #' + id + '? Stok akan dikembalikan.',
      confirmLabel: 'Hapus',
      proceed: async () => {
        const r = await api('/api/sales/' + id, { method: 'DELETE' });
        if (r.ok) {
          showToast('Transaksi #' + id + ' dihapus & stok dikembalikan');
          load();
        } else {
          showToast(r.error || 'Gagal menghapus');
        }
      },
    });
  }

  async function markAll() {
    const ids = unreported.map((s) => s.id);
    if (ids.length === 0) return;
    for (const id of ids) {
      await api('/api/sales/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'reported' }) });
    }
    setUndoIds(ids);
    setUndoMsg(ids.length + ' transaksi ditandai Sudah Dilapor — klik Urungkan untuk membatalkan');
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndoMsg('');
      setUndoIds([]);
      undoTimer.current = null;
    }, 8000);
    load();
  }

  async function undoAll() {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    for (const id of undoIds) {
      await api('/api/sales/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'unreported' }),
      });
    }
    setUndoMsg('');
    setUndoIds([]);
    showToast('Semua dikembalikan ke Belum Dilapor');
    load();
  }

  async function shareWa() {
    const msg = buildRekapMsg(unreported.map((s) => s as RekapSale), 'LAPORAN PENJUALAN KOPONTREN');
    await shareRekap(msg);
  }

  async function downloadCsv() {
    const fromDate = period > 0 ? new Date(Date.now() - period * 86400000).toISOString() : '1970-01-01';
    // Blob download: tanpa tab baru/flicker (window.open dulu buka tab kosong).
    try {
      const r = await fetch('/api/reports/csv?from=' + fromDate);
      if (!r.ok) {
        showToast('Gagal unduh CSV (HTTP ' + r.status + ')');
        return;
      }
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = 'penjualan-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    } catch {
      showToast('Gagal unduh CSV (jaringan)');
    }
  }

  if (loading && sales.length === 0) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total Transaksi</p>
          <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-100">
            {filteredSales.length}
          </p>
          <p className="text-[11px] text-slate-400">Periode terpilih</p>
        </div>
        <div className="card p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total Penjualan</p>
          <p className="mt-1 text-xl font-extrabold text-accent-500 dark:text-accent-300">
            {rp(grandTotal)}
          </p>
          <p className="text-[11px] text-slate-400">Omset kotor</p>
        </div>
        <div className="card p-3 border-amber-500/30 bg-amber-500/5">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Menunggu Rekap
          </p>
          <p className="mt-1 text-xl font-extrabold text-amber-600 dark:text-amber-400">
            {unreported.length}
          </p>
          <p className="text-[11px] text-amber-600/70">{rp(unreportedTotal)}</p>
        </div>
        <div className="card p-3 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Sudah Dilapor
          </p>
          <p className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {filteredSales.length - unreported.length}
          </p>
          <p className="text-[11px] text-emerald-600/70">Tersinkronisasi</p>
        </div>
      </div>

      {/* Filter and Action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            [1, 'Hari ini'],
            [7, '7 hari'],
            [30, '30 hari'],
            [0, 'Semua'],
          ].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setPeriod(v as number)}
              className={
                'rounded-full px-3 py-1 text-xs font-bold transition ' +
                (period === v
                  ? 'bg-accent-500 text-white shadow-sm'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800')
              }
            >
              {label}
            </button>
          ))}
          <select
            className="input w-auto text-xs"
            value={statusF}
            onChange={(e) => setStatusF(e.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="unreported">Belum dilapor</option>
            <option value="reported">Sudah dilapor</option>
          </select>
          <input
            className="input w-48 text-xs"
            placeholder="Cari pembeli / produk / #id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadCsv}
            className="btn-ghost px-2.5 py-1.5 text-xs font-bold"
            title="Download laporan transaksi format Excel/CSV"
          >
            <span className="inline-flex items-center gap-1.5">
              <FileDown className="h-3.5 w-3.5" />
              Unduh CSV
            </span>
          </button>
          <button
            onClick={shareWa}
            disabled={unreported.length === 0}
            className="btn-ghost px-2.5 py-1.5 text-xs font-bold"
          >
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" />
              Rekap WA ({unreported.length})
            </span>
          </button>
          {admin && (
            <button
              onClick={markAll}
              disabled={unreported.length === 0}
              className="btn-amber px-2.5 py-1.5 text-xs font-bold"
            >
              Tandai Semua Laporan
            </button>
          )}
        </div>
      </div>

      {undoMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-sm">
          <span>{undoMsg}</span>
          <button onClick={undoAll} className="font-bold text-accent-500 dark:text-accent-300">
            Urungkan
          </button>
        </div>
      )}

      {/* Transaction list */}
      <div className="space-y-2">
        {filteredSales.map((s) => (
          <div key={s.id} className="card p-3 hover:border-slate-300 dark:hover:border-navy-600 transition">
            <button
              className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              onClick={() => setOpen(open === s.id ? null : s.id)}
            >
              <div className="flex items-center gap-2">
                <Badge tone={s.status === 'unreported' ? 'amber' : 'green'}>
                  {s.status === 'unreported' ? 'BELUM' : 'SUDAH'}
                </Badge>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {s.customer || 'Pelanggan Umum'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {payMethodLabel(s.pay_method)}
                  {parsePaySplit(s.pay_split).length > 0 ? ' (campur)' : ''} · {fmtDateTime(s.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  {rp(s.total)}
                </span>
                <ChevronDown
                  className={
                    'h-4 w-4 text-slate-400 transition-transform ' +
                    (open === s.id ? 'rotate-180' : '')
                  }
                />
              </div>
            </button>
            {open === s.id && (
              <div className="mt-3 border-t border-slate-200 pt-3 dark:border-navy-700">
                <table className="w-full text-xs">
                  <tbody>
                    {s.items.map((it, i) => (
                      <tr key={i} className="table-row">
                        <td className="td font-medium">{it.product_name}</td>
                        <td className="td text-right text-slate-500">
                          {it.qty} {it.unit} × {rp(it.unit_price)}
                        </td>
                        <td className="td text-right font-bold">{rp(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Kasir: {s.kasir_name || 'Kasir'} · Transaksi #{s.id}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleStatus(s)}
                    className={s.status === 'unreported' ? 'btn-primary px-3 py-1 text-xs' : 'btn-ghost px-3 py-1 text-xs'}
                  >
                    {s.status === 'unreported' ? 'Tandai Sudah Dilapor' : 'Kembali ke Belum'}
                  </button>
                  {admin && (
                    <button onClick={() => remove(s.id)} className="btn-danger px-3 py-1 text-xs">
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {filteredSales.length === 0 && (
          <div className="card py-12 text-center text-sm text-slate-500">
            <div className="mb-1 flex justify-center">
              <FileText className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            </div>
            {q ? 'Tidak ada transaksi yang cocok dengan filter pencarian.' : 'Belum ada transaksi pada periode ini.'}
          </div>
        )}
      </div>
      {/* Notifikasi pagination: N = total baris dari server (COUNT), jadi
          user tahu kalau daftar yang tampil hanya sebagian. */}
      {total > 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Menampilkan {filteredSales.length} dari {total} transaksi
        </p>
      )}
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
