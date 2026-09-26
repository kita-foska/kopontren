'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageSkeleton, Empty, api, Badge, Toast, useConfirm, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';
import { Trash2 } from 'lucide-react';

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
  // Guard busy: cegah double-submit saat request dalam perjalanan.
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<KasResp>('/api/kas');
    if (r.ok && r.data) setData(r.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function addEntry() {
    if (busy) return;
    if (!form.label.trim() || form.amount <= 0) {
      showToast('Uraian & nominal wajib');
      return;
    }
    setBusy(true);
    try {
      const r = await api('/api/kas', { method: 'POST', body: JSON.stringify(form) });
      if (r.ok) {
        showToast('Jurnal kas manual tercatat');
        setForm({ type: form.type, label: '', amount: 0 });
        load();
      } else showToast(r.error || 'Gagal');
    } finally {
      setBusy(false);
    }
  }

  function removeEntry(id: number) {
    ask({
      title: 'Hapus jurnal kas manual',
      message: 'Hapus jurnal manual ini?',
      confirmLabel: 'Hapus',
      proceed: async () => {
        if (busy) return;
        setBusy(true);
        try {
          const r = await api('/api/kas?entry_id=' + id, { method: 'DELETE' });
          showToast(r.ok ? 'Jurnal manual dihapus' : r.error || 'Gagal menghapus');
          load();
        } finally {
          setBusy(false);
        }
      },
    });
  }

  if (!data) return <PageSkeleton />;

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
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400')
          }
        >
          {rp(data.balance)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          = penjualan + jurnal masuk − belanja − pengeluaran − jurnal keluar
        </p>
      </div>

      <div id="kas-form" className="card mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
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
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={addEntry}>
            {busy ? 'Menyimpan…' : 'Tambah Jurnal'}
          </button>
        </div>
      </div>

      <div className="card hidden overflow-x-auto sm:block">
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
                    <button type="button"
                      onClick={() => removeEntry(r.id)}
                      className="ml-2 text-[10px] text-slate-500 underline hover:text-rose-600 dark:hover:text-rose-400"
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
                    (r.sign > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')
                  }
                >
                  {r.sign > 0 ? '+' : '−'} {rp(r.amount)}
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td className="td" colSpan={4}>
                  <Empty
                    compact
                    text="Belum ada gerakan kas."
                    ctaLabel="Catat jurnal kas"
                    ctaOnClick={() =>
                      document
                        .getElementById('kas-form')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: kartu jurnal kas (<sm) — data sama dengan tabel; tombol hapus
          ikon Trash2 dengan hit-area 44px. */}
      <div className="card sm:hidden">
        {data.rows.map((r) => (
          <div key={r.kind + r.id} className="border-b border-slate-200 p-3 last:border-0 dark:border-navy-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-h-[44px] items-center gap-2">
                  <Badge tone={kindBadge[r.kind]?.tone || 'gray'}>
                    {kindBadge[r.kind]?.label || r.kind}
                  </Badge>
                  {r.kind === 'entry' && (
                    <button type="button"
                      onClick={() => removeEntry(r.id)}
                      aria-label="Hapus jurnal manual ini"
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{r.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDateTime(r.created_at)}</p>
              </div>
              <p
                className={
                  'text-lg font-extrabold ' +
                  (r.sign > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400')
                }
              >
                {r.sign > 0 ? '+' : '−'} {rp(r.amount)}
              </p>
            </div>
          </div>
        ))}
        {data.rows.length === 0 && (
          <Empty
            compact
            text="Belum ada gerakan kas."
            ctaLabel="Catat jurnal kas"
            ctaOnClick={() =>
              document.getElementById('kas-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          />
        )}
      </div>
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
