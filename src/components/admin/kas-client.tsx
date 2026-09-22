'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Toast, useConfirm, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';

type Row = {
  id: number;
  kind: string;
  sign: number;
  label: string;
  amount: number;
  created_at: string;
};
type KasResp = {
  balance: number;
  rows: Row[];
  entries: { id: number; type: string; label: string; amount: number; created_at: string }[];
};

export function KasClient() {
  const [data, setData] = useState<KasResp | null>(null);
  const [form, setForm] = useState({ type: 'income', label: '', amount: 0 });
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();

  const load = useCallback(async () => {
    const r = await api<KasResp>('/api/kas');
    if (r.ok && r.data) setData(r.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function addEntry() {
    if (!form.label.trim() || form.amount <= 0) {
      showToast('Uraian & nominal wajib');
      return;
    }
    const r = await api('/api/kas', { method: 'POST', body: JSON.stringify(form) });
    if (r.ok) {
      showToast('Jurnal kas manual tercatat');
      setForm({ type: form.type, label: '', amount: 0 });
      load();
    } else showToast(r.error || 'Gagal');
  }

  function removeEntry(id: number) {
    ask({
      title: 'Hapus jurnal kas manual',
      message: 'Hapus jurnal manual ini?',
      confirmLabel: 'Hapus',
      proceed: async () => {
        await api('/api/kas?entry_id=' + id, { method: 'DELETE' });
        load();
      },
    });
  }

  if (!data) return <p className="text-sm text-slate-500">Memuat…</p>;

  const kindBadge: Record<string, { tone: 'green' | 'red' | 'blue' | 'amber'; label: string }> = {
    sale: { tone: 'green', label: 'JUALAN' },
    purchase: { tone: 'red', label: 'BELANJA' },
    expense: { tone: 'red', label: 'PENGELUARAN' },
    entry: { tone: 'blue', label: 'JURNAL' },
  };

  return (
    <div>
      <div className="card mb-3 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Saldo kas tercatat
        </p>
        <p
          className={
            'text-3xl font-extrabold ' +
            (data.balance >= 0
              ? 'text-emerald-500'
              : 'text-rose-500')
          }
        >
          {rp(data.balance)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          = penjualan + jurnal masuk − belanja − pengeluaran − jurnal keluar
        </p>
      </div>

      <div className="card mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <div>
          <label className="label">Jenis jurnal</label>
          <select
            className="input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="income">Uang masuk (setoran, zakat, dll)</option>
            <option value="expense">Uang keluar (pembayaran manual, dll)</option>
          </select>
        </div>
        <div>
          <label className="label">Uraian</label>
          <input
            className="input"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Nominal (Rp)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={addEntry}>
            Tambah Jurnal
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[36rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <th className="th">Jenis</th>
              <th className="th">Uraian</th>
              <th className="th">Waktu</th>
              <th className="th text-right">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.kind + r.id} className="table-row">
                <td className="td">
                  <Badge tone={kindBadge[r.kind]?.tone || 'gray'}>
                    {kindBadge[r.kind]?.label || r.kind}
                  </Badge>
                  {r.kind === 'entry' && (
                    <button
                      onClick={() => removeEntry(r.id)}
                      className="ml-2 text-[10px] text-slate-400 underline hover:text-rose-500"
                    >
                      hapus
                    </button>
                  )}
                </td>
                <td className="td text-sm">{r.label}</td>
                <td className="td text-xs text-slate-500 dark:text-slate-400">
                  {fmtDateTime(r.created_at)}
                </td>
                <td
                  className={
                    'td text-right font-bold ' +
                    (r.sign > 0 ? 'text-emerald-500' : 'text-rose-500')
                  }
                >
                  {r.sign > 0 ? '+' : '−'} {rp(r.amount)}
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td className="td py-5 text-center text-sm text-slate-500" colSpan={4}>
                  Belum ada gerakan kas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
