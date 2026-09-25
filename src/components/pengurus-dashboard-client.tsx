'use client';

import { useCallback, useEffect, useState } from 'react';
import { SalesBarChart, type DailyPoint } from '@/components/charts';
import { PageSkeleton, Toast, api, apiRetry, useToast } from '@/components/ui';
import { fmtDate, rp } from '@/lib/format';
import { shareWa } from '@/lib/rekap';
import { payMethodLabel } from '@/lib/pay-methods';

type ReportPayload = {
  from: string;
  days: number;
  sales_count: number;
  sales_total: number;
  profit: number;
  cogs: number;
  purchases_total: number;
  expenses_total: number;
  cash_in: number;
  cash_out: number;
  cash_net: number;
  by_method: Record<string, number>;
  top: { name: string; qty: number; revenue: number }[];
  daily: DailyPoint[];
  stores: { id: number; name: string; address: string }[];
};

const PERIODS: { days: number; label: string }[] = [
  { days: 7, label: '7 hari' },
  { days: 30, label: '30 hari' },
  { days: 365, label: '1 tahun' },
];

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PengurusDashboardClient() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportPayload | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast, clearToast] = useToast();

  const load = useCallback(async (n: number) => {
    setErr('');
    // apiRetry: GET read-only load awal/refresh dashboard — tahan cold
    // start Vercel (1 retry, backoff 800ms). Aksi tombol tetap api().
    const r = await apiRetry<ReportPayload>('/api/reports?days=' + n);
    if (!r.ok) setErr(r.error || 'Gagal memuat laporan.');
    else setData(r.data);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const exportCsv = () => {
    if (!data) return;
    const L: (string | number)[][] = [];
    L.push(['LAPORAN GLOBAL KOPONTREN']);
    L.push(['Periode', data.days + ' hari (sejak ' + fmtDate(data.from) + ')']);
    L.push([]);
    L.push(['RINGKASAN']);
    L.push(['Penjualan (Rp)', data.sales_total]);
    L.push(['Jumlah transaksi', data.sales_count]);
    L.push(['Laba kotor (Rp)', data.profit]);
    L.push(['Belanja supplier (Rp)', data.purchases_total]);
    L.push(['Pengeluaran lain (Rp)', data.expenses_total]);
    L.push(['Arus kas bersih (Rp)', data.cash_net]);
    L.push([]);
    L.push(['METODE BAYAR']);
    Object.entries(data.by_method).forEach(([m, v]) => L.push([payMethodLabel(m), v]));
    L.push([]);
    L.push(['TOP PRODUK']);
    L.push(['Produk', 'Qty', 'Omzet']);
    data.top.forEach((t) => L.push([t.name, t.qty, t.revenue]));
    L.push([]);
    L.push(['HARIAN']);
    L.push(['Tanggal', 'Transaksi', 'Penjualan (Rp)']);
    data.daily.forEach((d) => L.push([d.day, d.c, d.t]));
    const text = L.map((row) => row.map(csvCell).join(',')).join('\n');
    downloadBlob(
      '\uFEFF' + text,
      `kopontren-laporan-${data.days}h-${stamp()}.csv`,
      'text/csv;charset=utf-8'
    );
    setToast('CSV terunduh');
  };

  const exportXlsx = async () => {
    if (!data) return;
    setBusy('xlsx');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet([
        ['LAPORAN GLOBAL KOPONTREN'],
        ['Periode', data.days + ' hari (sejak ' + fmtDate(data.from) + ')'],
        [],
        ['Penjualan (Rp)', data.sales_total],
        ['Jumlah transaksi', data.sales_count],
        ['Laba kotor (Rp)', data.profit],
        ['Belanja supplier (Rp)', data.purchases_total],
        ['Pengeluaran lain (Rp)', data.expenses_total],
        ['Arus kas bersih (Rp)', data.cash_net],
        [],
        ['METODE BAYAR'],
        ...Object.entries(data.by_method).map(([m, v]) => [payMethodLabel(m), v] as string[]),
        [],
        ['TOP PRODUK'],
        ['Produk', 'Qty', 'Omzet'],
        ...data.top.map((t) => [t.name, t.qty, t.revenue]),
      ]);
      ws1['!cols'] = [{ wch: 28 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan');
      const ws2 = XLSX.utils.aoa_to_sheet([
        ['Tanggal', 'Transaksi', 'Penjualan (Rp)'],
        ...data.daily.map((d) => [d.day, d.c, d.t] as (string | number)[]),
      ]);
      ws2['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Harian');
      const ws3 = XLSX.utils.aoa_to_sheet([
        ['Cabang', 'Alamat'],
        ...data.stores.map((s) => [s.name, s.address || '-'] as string[]),
      ]);
      ws3['!cols'] = [{ wch: 26 }, { wch: 44 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Cabang');
      XLSX.writeFile(wb, `kopontren-laporan-${data.days}h-${stamp()}.xlsx`);
      setToast('Excel terunduh');
    } catch {
      setToast('Gagal membuat Excel - pakai Export CSV');
    } finally {
      setBusy('');
    }
  };

  const printPdf = () => {
    window.print();
  };

  const waReport = async () => {
    if (!data) return;
    setBusy('wa');
    try {
      const s = await api<{ settings: Record<string, string> }>('/api/settings');
      const phone = s.ok ? s.data.settings.store_phone : '';
      const top5 = data.top.slice(0, 5);
      const lines: string[] = [];
      lines.push('*LAPORAN GLOBAL KOPONTREN*');
      lines.push('Periode: ' + data.days + ' hari (sejak ' + fmtDate(data.from) + ')');
      lines.push('===========================');
      lines.push('Penjualan: ' + rp(data.sales_total) + ' (' + data.sales_count + ' transaksi)');
      lines.push('Laba kotor: ' + rp(data.profit));
      lines.push('Arus kas bersih: ' + rp(data.cash_net));
      lines.push('Belanja supplier: ' + rp(data.purchases_total));
      lines.push('Pengeluaran lain: ' + rp(data.expenses_total));
      lines.push('===========================');
      if (top5.length) {
        lines.push('TOP ' + top5.length + ' PRODUK:');
        top5.forEach((t, i) =>
          lines.push((i + 1) + '. ' + t.name + ' - ' + t.qty + ' pcs (' + rp(t.revenue) + ')')
        );
        lines.push('===========================');
      }
      lines.push('METODE BAYAR:');
      Object.entries(data.by_method).forEach(([m, v]) =>
        lines.push(payMethodLabel(m) + ': ' + rp(v))
      );
      lines.push('===========================');
      lines.push('Mohon diperiksa - terima kasih.');
      shareWa(lines.join('\n'), phone);
      setToast('WhatsApp dibuka');
    } finally {
      setBusy('');
    }
  };

  if (err)
    return (
      <div className="card p-4">
        <p className="text-sm text-rose-600 dark:text-rose-300">{err}</p>
        <button type="button" className="btn-ghost mt-2" onClick={() => void load(days)}>
          Ulangi
        </button>
      </div>
    );

  if (!data) return <PageSkeleton />;

  return (
    <div className="print-area space-y-3">
      {/* Periode + export */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-navy-600">
            {PERIODS.map((p) => (
              <button type="button"
                key={p.days}
                onClick={() => setDays(p.days)}
                className={
                  'px-3 py-1.5 text-xs font-bold transition ' +
                  (days === p.days
                    ? 'bg-accent-500 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700')
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" className="btn-ghost" onClick={exportCsv}>
              Export CSV
            </button>
            <button type="button" className="btn-ghost" onClick={() => void exportXlsx()} disabled={busy === 'xlsx'}>
              {busy === 'xlsx' ? 'Membuat…' : 'Export Excel'}
            </button>
            <button type="button" className="btn-ghost" onClick={printPdf}>
              Cetak / PDF
            </button>
            <button type="button" className="btn-primary" onClick={() => void waReport()} disabled={busy === 'wa'}>
              {busy === 'wa' ? 'Membuka…' : 'Laporan via WA'}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Periode {data.days} hari · sejak {fmtDate(data.from)} · {data.stores.length}{' '}
          cabang terdaftar (penjualan masih tercatat global, belum per-cabang)
        </p>
      </div>

      {/* Chart */}
      <div className="card p-4">
        <h2 className="mb-2 font-bold">
          Grafik Penjualan {data.days} Hari{' '}
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
            (arahkan kursor ke batang utk detail hari)
          </span>
        </h2>
        <SalesBarChart points={data.daily} days={data.days} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Top produk */}
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Top Produk</h2>
          {data.top.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada penjualan.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700">
                  <th className="th">Produk</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Omzet</th>
                </tr>
              </thead>
              <tbody>
                {data.top.map((t, i) => (
                  <tr key={t.name} className="table-row">
                    <td className="td">
                      <span className="mr-1.5 text-slate-500">{i + 1}.</span>
                      {t.name}
                    </td>
                    <td className="td text-right font-semibold">{t.qty}</td>
                    <td className="td text-right font-bold text-accent-500 dark:text-accent-300">
                      {rp(t.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Metode bayar + laba */}
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Metode Bayar &amp; Arus Kas</h2>
          <div className="space-y-1.5">
            {Object.entries(data.by_method).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada penjualan.</p>
            ) : (
              Object.entries(data.by_method).map(([m, v]) => {
                const pct = data.sales_total > 0 ? Math.round((v / data.sales_total) * 100) : 0;
                return (
                  <div key={m} className="flex items-center gap-2 text-sm">
                    <span className="w-14 font-bold">{payMethodLabel(m)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
                      <div className="h-full bg-accent-500" style={{ width: pct + '%' }} />
                    </div>
                    <span className="w-24 text-right font-semibold">{rp(v)}</span>
                    <span className="w-10 text-right text-xs text-slate-500">{pct}%</span>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-navy-700">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Laba kotor
              </p>
              <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                {rp(data.profit)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Arus kas bersih
              </p>
              <p className="text-lg font-extrabold">{rp(data.cash_net)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Cabang */}
      <div className="card p-4">
        <h2 className="mb-2 font-bold">Cabang</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.stores.map((s) => (
            <div key={s.id} className="rounded-lg bg-slate-50 p-2.5 dark:bg-navy-900/50">
              <p className="text-sm font-bold">{s.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.address || '-'}</p>
            </div>
          ))}
        </div>
      </div>

      <Toast msg={toast} onClose={clearToast} />
    </div>
  );
}