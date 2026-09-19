'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/components/ui';

type Notif = {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  read: number;
  created_at: string;
};

/**
 * Ikon lonceng notifikasi (HANYA admin) di header: badge jumlah belum dibaca,
 * dropdown 8 notifikasi terbaru + tandai-dibaca. Poll count tiap 30 detik.
 * Klik item -> tandai dibaca + buka link terkait.
 */
export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    const res = await api<{ count: number }>('/api/notifications/count');
    if (res.ok) setCount(res.data.count || 0);
  }, []);

  const loadItems = useCallback(async () => {
    const res = await api<{ notifications: Notif[] }>('/api/notifications?limit=8&unread=1');
    if (res.ok) setItems(res.data.notifications || []);
  }, []);

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30_000);
    return () => clearInterval(t);
  }, [loadCount]);

  // Tutup panel bila klik di luar.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await Promise.all([loadItems(), loadCount()]);
    }
  };

  const markRead = async (ids: number[]) => {
    await api('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    await Promise.all([loadCount(), loadItems()]);
  };

  const markAll = async () => {
    setBusy(true);
    await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) });
    await Promise.all([loadCount(), loadItems()]);
    setBusy(false);
  };

  const onItem = async (n: Notif) => {
    await markRead([n.id]);
    setOpen(false);
    if (n.link) window.location.href = n.link;
  };

  const time = (iso: string) =>
    new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={toggle}
        aria-label="Notifikasi"
        title="Notifikasi"
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-200 dark:hover:bg-navy-700"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(92vw,22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-navy-600 dark:bg-navy-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-navy-600">
            <p className="text-sm font-bold">Notifikasi</p>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button
                  onClick={markAll}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-accent-600 hover:bg-accent-500/10 disabled:opacity-50 dark:text-accent-300"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Semua dibaca
                </button>
              )}
              <a
                href="/admin/notifications"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700"
              >
                Lihat
              </a>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-400">Belum ada notifikasi</li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onItem(n)}
                    className="block w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-navy-700"
                  >
                    <p className="text-sm font-bold leading-tight">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {n.message}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {time(n.created_at)}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
          <a
            href="/admin/notifications"
            className="block border-t border-slate-100 px-3 py-2 text-center text-xs font-bold text-accent-600 hover:bg-accent-500/10 dark:border-navy-600 dark:text-accent-300"
          >
            Buka pusat notifikasi
          </a>
        </div>
      )}
    </div>
  );
}
