'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Toast, useToast } from '@/components/ui';
import { rp, startOfDayJakarta } from '@/lib/format';

type Summary = {
  from: string;
  to: string;
  sales_count: number;
  sales_total: number;
  cogs: number;
  profit: number;
  purchases_total: number;
  expenses_total: number;
  cash_net: number;
  by_method: Record<string, number>;
  top: { name: string; qty: number; revenue: number }[];
};

export function LaporanAdminClient() {
  const [period, setPeriod] = useState('30');
  const [s, setS] = useState<Summary | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const r = await api<Summary>('/api/reports?days=' + period);
    if (r.ok && r.data) setS(r.data);
  }, [period]);
  useEffect(() => {
    load();
  }, [load]);

  function csv() {
    const from = startOfDayJakarta(Number(period) === 0 ? -3650 : -Number(period) + 1);
    window.open('/api/reports/csv?from=' + encodeURIComponent(from), '_blank');
  }

  if (!s) return <p className="text-sm text-slate-500">Memuat…</p>;

  const cards = [
    { label: 'Penjualan', value: rp(s.sales_total), sub: s.sales_count + ' transaksi', cls: 'text-accent-500 dark:text-accent-300' },
    { label: 'HPP (biaya produk)', value: rp(s.cogs), sub: 'basis harga beli', cls: 'text-amber-600 dark:text-amber-400' },
    { label: 'Laba kotor', value: rp(s.profit), sub: 'penjualan − HPP', cls: s.profit >= 0 ? 'text-emerald-500' : 'text-rose-500' },
    { label: 'Kas keluar (belanja)', value: rp(s.purchases_total), sub: 'stok masuk', cls: 'text-rose-500' },
    { label: 'Pengeluaran', value: rp(s.expenses_total), sub: 'listrik, operasional', cls: 'text-rose-500' },
    { label: 'Arus kas neto', value: rp(s.cash_net), sub: 'masuk − keluar', cls: s.cash_net >= 0 ? 'text-emerald-500' : 'text-rose-500' },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[
          [1, 'Hari ini'],
          [7, '7 hari'],
          [30, '30 hari'],
          [365, '1 tahun'],
        ].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setPeriod(String(v))}
            className={
              'rounded-full px-3 py-1 text-xs font-bold ' +
              (period === String(v)
                ? 'bg-accent-500 text-white'
                : 'border border-slate-300 text-slate-600 dark:border-navy-600 dark:text-slate-300')
            }
          >
            {label}
          </button>
        ))}
        <button onClick={csv} className="btn-ghost ml-auto">
          Unduh CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {c.label}
            </p>
            <p className={'mt-1 text-xl font-extrabold ' + c.cls}>{c.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Top produk</h2>
          {s.top.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada penjualan di periode ini.</p>
          ) : (
            <ul className="space-y-1.5">
              {s.top.map((t) => (
                <li key={t.name} className="flex items-center justify-between text-sm">
                  <span>{t.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {t.qty} terjual · <b className="text-slate-800 dark:text-slate-200">{rp(t.revenue)}</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Metode pembayaran</h2>
          <ul className="space-y-1.5 text-sm">
            {Object.keys(s.by_method || {}).length === 0 && (
              <li className="text-slate-500">Belum ada data.</li>
            )}
            {Object.entries(s.by_method || {}).map(([m, v]) => (
              <li key={m} className="flex items-center justify-between">
                <span className="capitalize">{m}</span>
                <b>{rp(v)}</b>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Catatan: laba kotor menggunakan HPP historis saat penjualan (snapshot harga beli). Jika HPP item tidak tercatat, menggunakan harga beli produk saat ini.
          </p>
        </div>
      </div>
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
