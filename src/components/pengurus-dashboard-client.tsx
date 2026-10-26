'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { type DailyPoint } from '@/components/charts';
import { Button, PageSkeleton, Table, Td, Th, Trow, Toast, api, apiRetry, useToast } from '@/components/ui';
import { fmtDate, rp } from '@/lib/format';

// W16-A: grafik penjualan di-code-split (chunk dashboard, bukan main).
const SalesBarChart = dynamic(
  () => import('@/components/charts').then((m) => m.SalesBarChart),
  { ssr: false, loading: () => <PageSkeleton /> }
);
import {
  buildReportRows,
  csvCell,
  flattenCsvRows,
  xlsxSheets,
  type ReportPayload,
} from '@/lib/admin/report-rows';
import { shareWa } from '@/lib/rekap';
import { payMethodLabel } from '@/lib/pay-methods';

const PERIODS: { days: number; label: string }[] = [
  { days: 7, label: '7 hari' },
  { days: 30, label: '30 hari' },
  { days: 365, label: '1 tahun' },
];

// Q46 (top-10): field enggal /api/reports (additive saking ReportPayload).
type TopKasir = { name: string; count: number; total: number };
type TopTransaksi = {
  id: number;
  kasir: string;
  customer: string;
  pay_method: string;
  status: string;
  total: number;
  created_at: string;
};
type ReportData = ReportPayload & { top_kasir: TopKasir[]; top_transaksi: TopTransaksi[] };

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
  const [data, setData] = useState<ReportData | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast, clearToast, toastTone] = useToast();

  const load = useCallback(async (n: number) => {
    setErr('');
    // apiRetry: GET read-only load awal/refresh dashboard -- tahan cold
    // start Vercel (1 retry, backoff 800ms). Aksi tombol tetap api().
    const r = await apiRetry<ReportData>('/api/reports?days=' + n);
    if (!r.ok) setErr(r.error || 'Gagal memuat laporan.');
    else setData(r.data);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const exportCsv = () => {
    if (!data) return;
    // 2b-5: baris laporan dari satu sumber (src/lib/admin/report-rows.ts);
    // layout byte-identik dgn export lama (regression: test-report-rows).
    const text = flattenCsvRows(buildReportRows(data, { payMethodLabel, fmtDate }))
      .map((row) => row.map(csvCell).join(','))
      .join('\n');
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
      // 2b-5: 3 sheet dari satu sumber (xlsxSheets, report-rows.ts);
      // layout + lebar kolom !cols tak berubah (regression: test-report-rows).
      for (const sheet of xlsxSheets(buildReportRows(data, { payMethodLabel, fmtDate }))) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
        ws['!cols'] = sheet.cols;
        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
      }
      XLSX.writeFile(wb, `kopontren-laporan-${data.days}h-${stamp()}.xlsx`);
      setToast('Excel terunduh');
    } catch {
      setToast('Gagal membuat Excel - pakai Export CSV', 'error');
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
        <Button variant="ghost" className="mt-2" onClick={() => void load(days)}>
          Ulangi
        </Button>
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
            <Button variant="ghost" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="ghost" onClick={() => void exportXlsx()} disabled={busy === 'xlsx'}>
              {busy === 'xlsx' ? 'Membuat...' : 'Export Excel'}
            </Button>
            <Button variant="ghost" onClick={printPdf}>
              Cetak / PDF
            </Button>
            <Button variant="primary" onClick={() => void waReport()} disabled={busy === 'wa'}>
              {busy === 'wa' ? 'Membuka...' : 'Laporan via WA'}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Periode {data.days} hari - sejak {fmtDate(data.from)} - {data.stores.length}{' '}
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
            <Table>
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700">
                  <Th>Produk</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Omzet</Th>
                </tr>
              </thead>
              <tbody>
                {data.top.map((t, i) => (
                  <Trow key={t.name}>
                    <Td>
                      <span className="mr-1.5 text-slate-500">{i + 1}.</span>
                      {t.name}
                    </Td>
                    <Td className="text-right font-semibold">{t.qty}</Td>
                    <Td className="text-right font-bold text-accent-500 dark:text-accent-300">
                      {rp(t.revenue)}
                    </Td>
                  </Trow>
                ))}
              </tbody>
            </Table>
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
              <p className="card-label">
                Laba kotor
              </p>
              <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                {rp(data.profit)}
              </p>
            </div>
            <div>
              <p className="card-label">
                Arus kas bersih
              </p>
              <p className="text-lg font-extrabold">{rp(data.cash_net)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Q46 (top-10): top kasir + transaksi terbesarpun, sinkron preset periode */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Top Kasir</h2>
          {data.top_kasir.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada penjualan.</p>
          ) : (
            <Table>
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700">
                  <Th>Kasir</Th>
                  <Th className="text-right">Transaksi</Th>
                  <Th className="text-right">Omzet</Th>
                </tr>
              </thead>
              <tbody>
                {data.top_kasir.map((k, i) => (
                  <Trow key={k.name}>
                    <Td>
                      <span className="mr-1.5 text-slate-500">{i + 1}.</span>
                      {k.name}
                    </Td>
                    <Td className="text-right font-semibold">{k.count}</Td>
                    <Td className="text-right font-bold text-accent-500 dark:text-accent-300">
                      {rp(k.total)}
                    </Td>
                  </Trow>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        <div className="card p-4">
          <h2 className="mb-2 font-bold">Transaksi Terbesar</h2>
          {data.top_transaksi.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada penjualan.</p>
          ) : (
            <Table>
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700">
                  <Th>Tanggal</Th>
                  <Th>Kasir</Th>
                  <Th>Pelanggan</Th>
                  <Th>Metode</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {data.top_transaksi.map((t) => (
                  <Trow key={t.id}>
                    <Td className="whitespace-nowrap">
                      <div className="text-xs">{fmtDate(t.created_at)}</div>
                      <div className="text-2xs text-slate-500 dark:text-slate-400">
                        {t.status === 'unreported' ? 'Belum dicatat' : 'Tercatat'}
                      </div>
                    </Td>
                    <Td>{t.kasir}</Td>
                    <Td>{t.customer || '-'}</Td>
                    <Td>{payMethodLabel(t.pay_method)}</Td>
                    <Td className="text-right font-bold text-accent-500 dark:text-accent-300">
                      {rp(t.total)}
                    </Td>
                  </Trow>
                ))}
              </tbody>
            </Table>
          )}
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

      <Toast msg={toast} tone={toastTone} onClose={clearToast} />
    </div>
  );
}