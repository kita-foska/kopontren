'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Toast, useToast } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

type Log = {
  id: number;
  user_id: number | null;
  username: string;
  user_name: string;
  user_role: string;
  action: string;
  table_name: string;
  record_id: number | null;
  old_value: string | null;
  new_value: string | null;
  ip_address: string;
  user_agent: string;
  created_at: string;
};
type Resp = { logs: Log[]; tables: string[]; limit?: number; offset?: number };

function truncate(s: string | null, n = 60): string {
  if (!s) return '';
  let clean = s;
  try {
    clean = JSON.stringify(JSON.parse(s));
  } catch {
    /* keep raw */
  }
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
}

export function AuditClient() {
  const [data, setData] = useState<Resp | null>(null);
  const [userF, setUserF] = useState('');
  const [tableF, setTableF] = useState('');
  const [sinceF, setSinceF] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [canMore, setCanMore] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async (offset = 0, append = false) => {
    // Server cap 50 baris/halaman (target Rows Read); tombol "Muat
    // lebih banyak" melanjutkan dari offset halaman terakhir.
    const r = await api<Resp>('/api/audit?limit=50&offset=' + offset);
    if (r.ok && r.data) {
      setData((prev) => {
        const d = r.data!;
        if (!prev || !append) return d;
        const seen = new Set(prev.logs.map((l) => l.id));
        return { ...d, logs: [...prev.logs, ...d.logs.filter((l) => !seen.has(l.id))] };
      });
      setCanMore((r.data!.logs?.length || 0) >= 50);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (loadingMore || !canMore || !data) return;
    setLoadingMore(true);
    await load(data.logs.length, true);
    setLoadingMore(false);
  }

  async function purge(days: number) {
    if (!confirm('Hapus log audit lebih tua dari ' + days + ' hari?')) return;
    const r = await api('/api/audit?days=' + days, { method: 'DELETE' });
    if (r.ok) {
      showToast('Log lama dihapus');
      load();
    } else showToast(r.error || 'Gagal');
  }

  const users = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const l of data.logs) {
      if (l.username && !seen.has(l.username)) seen.set(l.username, l.user_name || '');
    }
    return [...seen.entries()].map(([u, n]) => ({ value: u, label: n ? u + ' (' + n + ')' : u }));
  }, [data]);

  const logs = useMemo(() => {
    if (!data) return [];
    const since = sinceF ? new Date(sinceF).toISOString() : '';
    return data.logs.filter((l) => {
      if (userF && l.username !== userF) return false;
      if (tableF && l.table_name !== tableF) return false;
      if (since && l.created_at < since) return false;
      return true;
    });
  }, [data, userF, tableF, sinceF]);

  if (!data) return <p className="text-sm text-slate-500">Memuat…</p>;

  return (
    <div className="space-y-3">
      <div className="card grid grid-cols-1 gap-2 p-3 sm:grid-cols-4">
        <div>
          <label className="label">Pengguna</label>
          <select className="input" value={userF} onChange={(e) => setUserF(e.target.value)}>
            <option value="">Semua</option>
            {users.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Tabel</label>
          <select className="input" value={tableF} onChange={(e) => setTableF(e.target.value)}>
            <option value="">Semua</option>
            {data.tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Sejak tanggal</label>
          <input
            type="date"
            className="input"
            value={sinceF}
            onChange={(e) => setSinceF(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-ghost flex-1" onClick={() => purge(90)}>
            Bersihkan &gt;90h
          </button>
          <button className="btn-ghost flex-1" onClick={() => purge(365)}>
            Bersihkan &gt;1th
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[44rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <th className="th">Waktu</th>
              <th className="th">Pengguna</th>
              <th className="th">Aksi</th>
              <th className="th">Tabel</th>
              <th className="th">Perubahan</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="table-row">
                <td className="td text-xs text-slate-500 dark:text-slate-400">
                  {fmtDateTime(l.created_at)}
                </td>
                <td className="td">
                  <span
                    className="block text-sm font-bold"
                    title={
                      l.ip_address
                        ? 'IP: ' + l.ip_address + '\n' + l.user_agent
                        : undefined
                    }
                  >
                    {l.user_name || l.username}
                  </span>
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    ({l.username}
                    {l.user_role ? ', ' + l.user_role : ''})
                  </span>
                </td>
                <td className="td text-xs font-semibold text-accent-500 dark:text-accent-300">
                  {l.action}
                  {l.record_id ? ' #' + l.record_id : ''}
                </td>
                <td className="td text-xs text-slate-500 dark:text-slate-400">{l.table_name}</td>
                <td className="td text-xs text-slate-500 dark:text-slate-400">
                  {l.old_value ? (
                    <span title={l.old_value} className="mr-1 text-slate-400">
                      lama: {truncate(l.old_value, 40)} →
                    </span>
                  ) : null}
                  {l.new_value ? (
                    <span title={l.new_value}>{truncate(l.new_value, 60)}</span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td className="td py-6 text-center text-sm text-slate-500" colSpan={5}>
                  Tidak ada log yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canMore && (
        <div className="p-1 text-center">
          <button className="btn-ghost text-xs" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Memuat…' : 'Muat lebih banyak log'}
          </button>
        </div>
      )}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
