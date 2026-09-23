'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, RefreshCw, ExternalLink } from 'lucide-react';
import { api, Badge, Empty } from '@/components/ui';

type Notif = {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  read: number;
  created_at: string;
};

const LABELS: Record<string, string> = {
  stock_low: 'Stok Menipis',
  stock_out: 'Stok Habis',
  debt_due: 'Piutang Jatuh Tempo',
  payable_due: 'Hutang Jatuh Tempo',
  large_txn: 'Transaksi Besar',
  cash_low: 'Kas Menipis',
  shift_open: 'Shift Dibuka',
  shift_close: 'Shift Ditutup',
  retur_new: 'Retur Baru',
  belanja_new: 'Belanja Baru',
  konsinyasi_new: 'Konsinyasi Baru',
  zakat_new: 'Zakat Baru',
  report_daily: 'Laporan Harian',
  report_sales: 'Ringkasan Penjualan',
  report_top: 'Produk Terlaris',
  report_cash: 'Kas Akhir Hari',
  report_weekly: 'Laporan Mingguan',
  report_monthly: 'Laporan Bulanan',
  rekap_debt: 'Rekap Piutang',
  rekap_payable: 'Rekap Hutang',
};

function toneFor(type: string): 'blue' | 'amber' | 'green' | 'red' | 'gray' {
  if (type === 'stock_out' || type === 'cash_low') return 'red';
  if (
    type === 'stock_low' ||
    type === 'debt_due' ||
    type === 'payable_due' ||
    type === 'large_txn'
  )
    return 'amber';
  if (type.startsWith('report') || type.startsWith('rekap')) return 'green';
  if (type === 'shift_open' || type === 'shift_close') return 'blue';
  return 'gray';
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationListClient() {
  const [items, setItems] = useState<Notif[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<{ notifications: Notif[] }>(
      `/api/notifications?limit=50${filter === 'unread' ? '&unread=1' : ''}`
    );
    if (res.ok) setItems(res.data.notifications || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const markOne = async (id: number) => {
    await api('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids: [id] }),
    });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: 1 } : n)));
    if (filter === 'unread') load();
  };

  const markAll = async () => {
    setBusy(true);
    await api('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ all: true }),
    });
    setBusy(false);
    load();
  };

  const open = (n: Notif) => {
    if (!n.read) markOne(n.id);
    if (n.link) window.location.href = n.link;
  };

  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-1">
          <button type="button"
            onClick={() => setFilter('all')}
            className={
              'rounded-lg px-3 py-1.5 text-xs font-bold ' +
              (filter === 'all'
                ? 'bg-accent-500 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700')
            }
          >
            Semua
          </button>
          <button type="button"
            onClick={() => setFilter('unread')}
            className={
              'rounded-lg px-3 py-1.5 text-xs font-bold ' +
              (filter === 'unread'
                ? 'bg-accent-500 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700')
            }
          >
            Belum dibaca{unread ? ` (${unread})` : ''}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={load}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Segarkan
          </button>
          {unread > 0 && (
            <button type="button"
              onClick={markAll}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Memuat…</p>
        ) : items.length === 0 ? (
          <Empty text={filter === 'unread' ? 'Tidak ada notifikasi belum dibaca' : 'Belum ada notifikasi'} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-navy-700">
            {items.map((n) => (
              <li
                key={n.id}
                className={
                  'flex items-start gap-3 px-4 py-3 ' + (n.read ? 'opacity-70' : 'bg-accent-500/5')
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={toneFor(n.type)}>{LABELS[n.type] || n.type}</Badge>
                    <p className="text-sm font-bold">{n.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {fmtTime(n.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {n.link && (
                    <button type="button"
                      onClick={() => open(n)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-accent-600 hover:bg-accent-500/10 dark:text-accent-300"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Buka
                    </button>
                  )}
                  {!n.read && (
                    <button type="button"
                      onClick={() => markOne(n.id)}
                      className="rounded-md px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700"
                    >
                      Tandai dibaca
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}