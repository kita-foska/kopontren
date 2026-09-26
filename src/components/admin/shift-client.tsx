'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Toast, useConfirm, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';
import { payMethodLabel } from '@/lib/pay-methods';

type Shift = {
  id: number;
  kasir_id: number;
  kasir_name: string;
  label: string;
  status: string;
  start_time: string;
  end_time: string | null;
  sales_count: number;
  sales_total: number;
  cash_total: number;
  by_method: Record<string, number>;
  setor?: number;
};
type Resp = { shifts: Shift[]; open: Shift | null; open_all?: Shift[]; limit?: number; offset?: number };

export function ShiftClient({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<Resp | null>(null);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();
  const [busy, setBusy] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [canMore, setCanMore] = useState(false);

  const load = useCallback(async (offset = 0, append = false) => {
    // Server cap 50 baris/halaman; offset melanjutkan daftar rekap shift.
    const r = await api<Resp>('/api/shifts?limit=50&offset=' + offset);
    if (r.ok && r.data) {
      setData((prev) => {
        const d = r.data!;
        if (!prev || !append) return d;
        const seen = new Set(prev.shifts.map((s) => s.id));
        return { ...d, shifts: [...prev.shifts, ...d.shifts.filter((s) => !seen.has(s.id))] };
      });
      setCanMore((r.data!.shifts?.length || 0) >= 50);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (loadingMore || !canMore || !data) return;
    setLoadingMore(true);
    await load(data.shifts.length, true);
    setLoadingMore(false);
  }

  function close(id: number) {
    ask({
      title: 'Tutup shift',
      message: 'Tutup shift #' + id + ' dan kunci rekapnya?',
      confirmLabel: 'Tutup',
      proceed: async () => {
        setBusy('close' + id);
        const r = await api<Resp>('/api/shifts', { method: 'PATCH', body: JSON.stringify({ id }) });
        setBusy('');
        if (r.ok) {
          showToast('Shift #' + id + ' ditutup & direkap');
          load();
        } else showToast(r.error || 'Gagal menutup shift');
      },
    });
  }

  async function setor(id: number, on: boolean) {
    setBusy('setor' + id);
    const r = await api('/api/shifts', {
      method: 'PATCH',
      body: JSON.stringify({ id, setor: on ? 1 : 0 }),
    });
    setBusy('');
    if (r.ok) {
      showToast(on ? 'Shift #' + id + ' ditandai sudah setor kas' : 'Tanda setor dihapus');
      load();
    } else showToast(r.error || 'Gagal menandai setor');
  }

  if (!data) return <p className="text-sm text-slate-500">Memuat…</p>;

  // Admin sees every open shift; kasir sees their own open shift.
  const openList: Shift[] = isAdmin
    ? (data.open_all && data.open_all.length > 0 ? data.open_all : data.open ? [data.open] : [])
    : data.open ? [data.open] : [];
  const all = data.shifts;

  return (
    <div className="space-y-3">
      {openList.map((openShift) => (
        <div key={'open' + openShift.id} className="card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone="amber">OPEN</Badge>
              <span className="text-sm font-bold">
                Shift #{openShift.id} · {openShift.kasir_name || openShift.label}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                mulai {fmtDateTime(openShift.start_time)}
              </span>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 text-xs sm:w-auto">
              <span>
                {openShift.sales_count} transaksi · {rp(openShift.sales_total)}
              </span>
              {/* Kasir hanya melihat shift-nya sendiri; admin semua. API tetap menegakkan izin. */}
              <button type="button"
                className="btn-danger h-11 px-2 py-1 sm:h-auto"
                disabled={busy === 'close' + openShift.id}
                onClick={() => close(openShift.id)}
              >
                Tutup Shift
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="card hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[40rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <th className="th">Shift</th>
              <th className="th">Kasir</th>
              <th className="th">Periode</th>
              <th className="th text-right">Transaksi</th>
              <th className="th text-right">Total</th>
              <th className="th">Metode</th>
              <th className="th">Setor</th>
            </tr>
          </thead>
          <tbody>
            {all.map((s) => (
              <tr key={s.id} className="table-row">
                <td className="td">
                  #{s.id}
                  {s.label ? <span className="text-xs text-slate-500"> · {s.label}</span> : null}
                </td>
                <td className="td text-sm">{s.kasir_name || '-'}</td>
                <td className="td text-xs text-slate-500 dark:text-slate-400">
                  {fmtDateTime(s.start_time)}
                  {s.end_time ? ' → ' + fmtDateTime(s.end_time) : ''}
                </td>
                <td className="td text-right">{s.sales_count}</td>
                <td className="td text-right font-bold">{rp(s.sales_total)}</td>
                <td className="td text-xs text-slate-500 dark:text-slate-400">
                  {Object.entries(s.by_method || {})
                    .filter(([, v]) => (v as number) > 0)
                    .map(([k, v]) => payMethodLabel(k) + ' ' + rp(v as number))
                    .join(' · ') || '-'}
                </td>
                <td className="td">
                  {isAdmin ? (
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={!!s.setor}
                        disabled={busy === 'setor' + s.id}
                        onChange={(e) => setor(s.id, e.target.checked)}
                      />
                      Setor kas
                    </label>
                  ) : (
                    <Badge tone={s.setor ? 'green' : 'gray'}>{s.setor ? 'Sudah setor' : 'Belum setor'}</Badge>
                  )}
                </td>
              </tr>
            ))}
            {all.length === 0 && openList.length === 0 && (
              <tr>
                <td className="td py-6 text-center text-sm text-slate-500" colSpan={7}>
                  Belum ada shift yang ditutup.
                  <div className="mt-2">
                    <a href="/kasir" className="btn-ghost text-xs">
                      Buka di Kasir
                    </a>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: kartu rekap shift (<sm) — data sama dengan tabel. */}
      <div className="card sm:hidden">
        {all.map((s) => (
          <div key={s.id} className="border-b border-slate-200 p-3 last:border-0 dark:border-navy-700">
            <div className="flex min-h-[44px] items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                #{s.id}
                {s.label ? <span className="text-xs font-normal text-slate-500"> · {s.label}</span> : null}
              </p>
              {isAdmin ? (
                <label className="flex min-h-[44px] items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    className="h-6 w-6 accent-accent-500"
                    checked={!!s.setor}
                    disabled={busy === 'setor' + s.id}
                    onChange={(e) => setor(s.id, e.target.checked)}
                  />
                  Setor kas
                </label>
              ) : (
                <Badge tone={s.setor ? 'green' : 'gray'}>{s.setor ? 'Sudah setor' : 'Belum setor'}</Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {s.kasir_name || '-'} · {fmtDateTime(s.start_time)}
              {s.end_time ? ' → ' + fmtDateTime(s.end_time) : ''}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{s.sales_count} transaksi</span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{rp(s.sales_total)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {Object.entries(s.by_method || {})
                .filter(([, v]) => (v as number) > 0)
                .map(([k, v]) => payMethodLabel(k) + ' ' + rp(v as number))
                .join(' · ') || '-'}
            </p>
          </div>
        ))}
        {all.length === 0 && openList.length === 0 && (
          <div className="p-4 text-center text-sm text-slate-500">
            Belum ada shift yang ditutup.
            <div className="mt-2 flex justify-center">
              <a href="/kasir" className="btn-ghost text-xs">
                Buka di Kasir
              </a>
            </div>
          </div>
        )}
      </div>
      {canMore && (
        <div className="p-1 text-center">
          <button type="button" className="btn-ghost h-11 px-4 text-xs sm:h-9" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Memuat…' : 'Muat shift lama lainnya'}
          </button>
        </div>
      )}
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
