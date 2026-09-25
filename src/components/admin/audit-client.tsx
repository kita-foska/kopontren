'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Modal, Toast, useConfirm, useToast } from '@/components/ui';
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
type Resp = {
  logs: Log[];
  tables: string[];
  /** Daftar semua pengguna aktif (utk dropdown filter) — server-side. */
  users?: { username: string; name: string }[];
  limit?: number;
  offset?: number;
};

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

/** Pretty-print JSON string (fallback: raw string). Dipakai di modal detail perubahan. */
function prettyJson(v: string | null): string {
  if (!v) return '';
  try {
    return JSON.stringify(JSON.parse(v), null, 2);
  } catch {
    return v;
  }
}

export function AuditClient() {
  const [data, setData] = useState<Resp | null>(null);
  const [userF, setUserF] = useState('');
  const [tableF, setTableF] = useState('');
  const [sinceF, setSinceF] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [canMore, setCanMore] = useState(false);
  const [viewLog, setViewLog] = useState<Log | null>(null);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();

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

  function purge(days: number) {
    ask({
      title: 'Bersihkan log audit',
      message: 'Hapus log audit lebih tua dari ' + days + ' hari?\nTindakan ini permanen.',
      confirmLabel: 'Bersihkan',
      proceed: async () => {
        const r = await api('/api/audit?days=' + days, { method: 'DELETE' });
        if (r.ok) {
          showToast('Log lama dihapus');
          load();
        } else showToast(r.error || 'Gagal');
      },
    });
  }

  const users = useMemo(() => {
    if (!data) return [];
    // Sumber utama: daftar pengguna aktif dari server (seluruh tabel users),
    // BUKAN dari 50 log pertama — akun yang log-nya tak masuk halaman tetap
    // bisa dipilih. Fallback (field lama/kosong): turunan dari log yang ada.
    if (data.users && data.users.length > 0) {
      return data.users.map((u) => ({
        value: u.username,
        label: u.name ? u.username + ' (' + u.name + ')' : u.username,
      }));
    }
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
          <button type="button" className="btn-ghost flex-1" onClick={() => purge(90)}>
            Bersihkan &gt;90h
          </button>
          <button type="button" className="btn-ghost flex-1" onClick={() => purge(365)}>
            Bersihkan &gt;1th
          </button>
        </div>
      </div>

      <div className="card hidden overflow-x-auto sm:block">
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
                <td className="td max-w-xs text-xs text-slate-500 dark:text-slate-400">
                  {l.old_value || l.new_value ? (
                    <button
                      type="button"
                      onClick={() => setViewLog(l)}
                      className="block w-full max-w-xs truncate text-left hover:text-accent-500 hover:underline dark:hover:text-accent-300"
                    >
                      {l.old_value ? (
                        <span className="text-slate-500 dark:text-slate-500">
                          lama: {truncate(l.old_value, 40)} →{' '}
                        </span>
                      ) : null}
                      {l.new_value ? (
                        <span>{truncate(l.new_value, 40)}</span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-500">(hapus)</span>
                      )}
                    </button>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-500">—</span>
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

      {/* Mobile: kartu log audit (<sm) — data sama dengan tabel; tombol detail
          perubahan pakai hit-area 44px (min-h-[44px]). */}
      <div className="card sm:hidden">
        {logs.map((l) => (
          <div key={l.id} className="border-b border-slate-200 p-3 last:border-0 dark:border-navy-700">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{fmtDateTime(l.created_at)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">{l.table_name}</p>
            </div>
            <p className="mt-1 text-sm font-semibold text-accent-500 dark:text-accent-300">
              {l.action}
              {l.record_id ? ' #' + l.record_id : ''}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {l.user_name || l.username} ({l.username}
              {l.user_role ? ', ' + l.user_role : ''})
            </p>
            {l.old_value || l.new_value ? (
              <button
                type="button"
                onClick={() => setViewLog(l)}
                className="mt-2 block min-h-[44px] w-full rounded-lg bg-slate-100 px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-200 dark:bg-navy-900/50 dark:text-slate-300 dark:hover:bg-navy-800"
              >
                {l.old_value ? (
                  <span className="text-slate-500 dark:text-slate-500">
                    lama: {truncate(l.old_value, 40)} →{' '}
                  </span>
                ) : null}
                {l.new_value ? truncate(l.new_value, 40) : <span className="text-slate-500 dark:text-slate-500">(hapus)</span>}
              </button>
            ) : (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">—</p>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="p-4 text-center text-sm text-slate-500">Tidak ada log yang cocok dengan filter.</div>
        )}
      </div>
      {canMore && (
        <div className="p-1 text-center">
          <button type="button" className="btn-ghost text-xs" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Memuat…' : 'Muat lebih banyak log'}
          </button>
        </div>
      )}
      {viewLog && (
        <Modal
          open
          title={viewLog.table_name + ' #' + (viewLog.record_id ?? '?') + ' — detail perubahan'}
          onClose={() => setViewLog(null)}
        >
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {fmtDateTime(viewLog.created_at)} · {viewLog.user_name || viewLog.username} ·{' '}
              {viewLog.action}
            </p>
            {viewLog.old_value && (
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                  Sebelum
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-red-50 p-3 font-mono text-xs text-red-900 dark:bg-red-500/10 dark:text-red-200">
                  {prettyJson(viewLog.old_value)}
                </pre>
              </div>
            )}
            {viewLog.new_value && (
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Sesudah
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-emerald-50 p-3 font-mono text-xs text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                  {prettyJson(viewLog.new_value)}
                </pre>
              </div>
            )}
            {!viewLog.old_value && !viewLog.new_value && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tidak ada detail perubahan yang tercatat untuk aksi ini.
              </p>
            )}
          </div>
        </Modal>
      )}
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
