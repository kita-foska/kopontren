'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Toast, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';

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
type Resp = { shifts: Shift[]; open: Shift | null; open_all?: Shift[] };

const METHOD_LABEL: Record<string, string> = { cash: 'Tunai', tf: 'Transfer', wa: 'QRIS/WA' };

export function ShiftClient({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<Resp | null>(null);
  const [toast, showToast] = useToast();
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const r = await api<Resp>('/api/shifts');
    if (r.ok && r.data) setData(r.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function close(id: number) {
    if (!confirm('Tutup shift #' + id + ' dan kunci rekapnya?')) return;
    setBusy('close' + id);
    const r = await api<Resp>('/api/shifts', { method: 'PATCH', body: JSON.stringify({ id }) });
    setBusy('');
    if (r.ok) {
      showToast('Shift #' + id + ' ditutup & direkap');
      load();
    } else showToast(r.error || 'Gagal menutup shift');
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
            <div className="flex items-center gap-2 text-xs">
              <span>
                {openShift.sales_count} transaksi · {rp(openShift.sales_total)}
              </span>
              {/* Kasir hanya melihat shift-nya sendiri; admin semua. API tetap menegakkan izin. */}
              <button
                className="btn-danger px-2 py-1"
                disabled={busy === 'close' + openShift.id}
                onClick={() => close(openShift.id)}
              >
                Tutup Shift
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="card overflow-x-auto">
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
                  {s.label ? <span className="text-xs text-slate-400"> · {s.label}</span> : null}
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
                    .map(([k, v]) => (METHOD_LABEL[k] || k) + ' ' + rp(v as number))
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
                  Belum ada shift yang ditutup. Buka shift dulu di menu Kasir (POS).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
