'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageSkeleton, api, Badge, Modal, Toast, useConfirm, useToast } from '@/components/ui';
import { rp, fmtDateTime, todayWibStr } from '@/lib/format';

type Payable = {
  id: number;
  supplier_name: string;
  supplier_phone: string;
  amount: number;
  paid: number;
  remaining: number;
  due_date: string;
  status: string;
  note: string;
  created_at: string;
};
type PayableResp = {
  payables: Payable[];
  summary: {
    open_total: number;
    open_count: number;
    overdue_count: number;
    due_soon_count: number;
  };
};

function plusDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function HutangClient({ admin }: { admin: boolean }) {
  const [filter, setFilter] = useState<'open' | 'settled' | 'all'>('open');
  const [data, setData] = useState<PayableResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();
  const [form, setForm] = useState({
    supplier_name: '',
    supplier_phone: '',
    amount: 0,
    due_date: '',
    note: '',
  });
  const [payFor, setPayFor] = useState<Payable | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  // Guard busy: cegah double-submit saat request dalam perjalanan.
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<PayableResp>('/api/payables?status=' + filter);
    if (r.ok && r.data) setData(r.data);
    setLoading(false);
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (busy) return;
    if (!form.supplier_name.trim() || form.amount <= 0) {
      showToast('Nama supplier & nominal wajib');
      return;
    }
    setBusy(true);
    try {
      const r = await api('/api/payables', { method: 'POST', body: JSON.stringify(form) });
      if (r.ok) {
        showToast('Hutang tercatat');
        setForm({ supplier_name: '', supplier_phone: '', amount: 0, due_date: '', note: '' });
        load();
      } else showToast(r.error || 'Gagal');
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (busy) return;
    if (!payFor || payAmt <= 0) {
      showToast('Nominal pembayaran wajib > 0');
      return;
    }
    setBusy(true);
    try {
      const r = await api('/api/payables/' + payFor.id, {
        method: 'PATCH',
        body: JSON.stringify({ pay: payAmt }),
      });
      if (r.ok) {
        const d = r.data as { remaining?: number; status?: string };
        showToast(
          d.status === 'settled'
            ? 'Lunas! Hutang sudah tertutup & kas keluar tercatat'
            : 'Pembayaran ' + rp(payAmt) + ' tercatat (kas keluar), sisa ' + rp(d.remaining ?? 0)
        );
        setPayFor(null);
        setPayAmt(0);
        load();
      } else showToast(r.error || 'Gagal');
    } finally {
      setBusy(false);
    }
  }

  function del(id: number) {
    ask({
      title: 'Hapus hutang',
      message: 'Hapus hutang ini? Riwayat di log audit & kas tetap tersimpan.',
      confirmLabel: 'Hapus',
      proceed: async () => {
        const r = await api('/api/payables/' + id, { method: 'DELETE' });
        if (r.ok) {
          showToast('Hutang dihapus');
          load();
        } else showToast(r.error || 'Gagal');
      },
    });
  }

  const payables = data?.payables ?? [];
  const open = data?.summary.open_total ?? 0;
  const openCount = data?.summary.open_count ?? 0;
  const overdue = data?.summary.overdue_count ?? 0;
  const dueSoon = data?.summary.due_soon_count ?? 0;
  const today = todayWibStr();
  const isOverdue = (x: Payable) =>
    x.status === 'open' && !!x.due_date && x.due_date < today;
  const isDueSoon = (x: Payable) =>
    x.status === 'open' && !!x.due_date && x.due_date >= today && x.due_date <= plusDays(today, 6);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Utang terbuka
          </p>
          <p className="mt-1 text-2xl font-extrabold text-amber-600 dark:text-amber-400">{rp(open)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{openCount} supplier</p>
          {(overdue > 0 || dueSoon > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {overdue > 0 && <Badge tone="red">{overdue} tunggak</Badge>}
              {dueSoon > 0 && <Badge tone="amber">{dueSoon} awas jatuh tempo (≤7 hari)</Badge>}
            </div>
          )}
        </div>
        <div className="card p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Tampilkan
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['open', 'Belum lunas'],
                ['settled', 'Lunas'],
                ['all', 'Semua'],
              ] as const
            ).map(([k, label]) => (
              <button type="button"
                key={k}
                onClick={() => setFilter(k)}
                className={filter === k ? 'btn-primary !py-1.5 text-xs' : 'btn-ghost !py-1.5 text-xs'}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Pembayaran otomatis tercatat sebagai kas keluar di menu Kas.
          </p>
        </div>
      </div>
      <div className="card mb-3 p-3">
        <p className="mb-2 text-sm font-bold">Catat hutang baru</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div>
            <label className="label">Supplier</label>
            <input
              className="input"
              value={form.supplier_name}
              placeholder="CV Sumber Rejeki"
              onChange={(ev) => setForm({ ...form, supplier_name: ev.target.value })}
            />
          </div>
          <div>
            <label className="label">No. HP</label>
            <input
              className="input"
              value={form.supplier_phone}
              placeholder="Opsional"
              onChange={(ev) => setForm({ ...form, supplier_phone: ev.target.value })}
            />
          </div>
          <div>
            <label className="label">Nominal (Rp)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.amount}
              onChange={(ev) => setForm({ ...form, amount: Number(ev.target.value) })}
            />
          </div>
          <div>
            <label className="label">Jatuh tempo</label>
            <input
              className="input"
              type="date"
              value={form.due_date}
              onChange={(ev) => setForm({ ...form, due_date: ev.target.value })}
            />
          </div>
          <div className="flex items-end">
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={create}>
              {busy ? 'Menyimpan…' : 'Catat'}
            </button>
          </div>
        </div>
        <div className="mt-2">
          <label className="label">Catatan</label>
          <input
            className="input"
            value={form.note}
            placeholder="Mis. belanja stok madu partai besar"
            onChange={(ev) => setForm({ ...form, note: ev.target.value })}
          />
        </div>
      </div>

      <div>
        <div className="card mb-2 p-3">
          <p className="text-sm font-bold">Daftar hutang</p>
        </div>
        <div className="space-y-2">
          {payables.map((x) => {
            const overdueRow = isOverdue(x);
            const dueSoonRow = isDueSoon(x);
            return (
              <div key={x.id} className="card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {x.supplier_name}
                      {x.supplier_phone && (
                        <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                          {x.supplier_phone}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {rp(x.paid)} dibayar dari {rp(x.amount)}
                      {x.due_date && ' · tempo ' + x.due_date}
                    </p>
                    {x.note && <p className="mt-0.5 text-xs italic text-slate-500">{x.note}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={x.status === 'settled' ? 'green' : 'amber'}>
                      {x.status === 'settled' ? 'Lunas' : 'Sisa ' + rp(x.remaining)}
                    </Badge>
                    {overdueRow && <Badge tone="red">Tunggak</Badge>}
                    {dueSoonRow && <Badge tone="amber">Awas jatuh tempo</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-500">
                    {fmtDateTime(x.created_at)}
                  </span>
                  <div className="flex gap-1.5">
                    {x.status === 'open' && (
                      <button type="button"
                        className="btn-amber !px-2.5 !py-1 text-xs"
                        onClick={() => {
                          setPayFor(x);
                          setPayAmt(x.remaining);
                        }}
                      >
                        Bayar
                      </button>
                    )}
                    {admin && (
                      <button type="button" className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => del(x.id)}>
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {payables.length === 0 && <p className="text-sm text-slate-500">Belum ada.</p>}
        </div>
      </div>

      <Modal
        open={payFor !== null}
        title="Bayar hutang"
        onClose={() => setPayFor(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setPayFor(null)}>
              Batal
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={pay}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </button>
          </>
        }
      >
        {payFor && (
          <div>
            <p className="mb-2 text-sm">
              {payFor.supplier_name} — sisa <b>{rp(payFor.remaining)}</b>
            </p>
            <label className="label">Jumlah dibayar (Rp)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={payFor.remaining}
              value={payAmt}
              onChange={(ev) => setPayAmt(Number(ev.target.value))}
            />
            {payAmt > payFor.remaining && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Melebihi sisa — hanya {rp(payFor.remaining)} yang akan diterapkan.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Otomatis dicatat sebagai kas keluar: &ldquo;Bayar hutang · {payFor.supplier_name}
              &rdquo;. Status menjadi &ldquo;lunas&rdquo; saat sisa = 0.
            </p>
          </div>
        )}
      </Modal>

      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}

