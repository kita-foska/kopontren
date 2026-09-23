'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageSkeleton, api, Badge, Modal, Toast, useConfirm, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';

type Debt = {
  id: number;
  customer_name: string;
  customer_phone: string;
  amount: number;
  paid: number;
  remaining: number;
  due_date: string;
  status: string;
  note: string;
  created_at: string;
};
type DebtResp = { debts: Debt[]; summary: { open_total: number; open_count: number } };

function todayStr(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
}

export function PiutangClient({ admin }: { admin: boolean }) {
  const [filter, setFilter] = useState<'open' | 'settled' | 'all'>('open');
  const [data, setData] = useState<DebtResp | null>(null);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    amount: 0,
    due_date: '',
    note: '',
  });
  const [payFor, setPayFor] = useState<Debt | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  // Guard busy: cegah double-submit saat request dalam perjalanan.
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<DebtResp>('/api/debts?status=' + filter);
    if (r.ok && r.data) setData(r.data);
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (busy) return;
    if (!form.customer_name.trim() || form.amount <= 0) {
      showToast('Nama pelanggan & nominal wajib');
      return;
    }
    setBusy(true);
    try {
      const r = await api('/api/debts', { method: 'POST', body: JSON.stringify(form) });
      if (r.ok) {
        showToast('Piutang tercatat');
        setForm({ customer_name: '', customer_phone: '', amount: 0, due_date: '', note: '' });
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
      const r = await api('/api/debts/' + payFor.id, {
        method: 'PATCH',
        body: JSON.stringify({ pay: payAmt }),
      });
      if (r.ok) {
        const d = r.data as { remaining?: number; status?: string };
        showToast(
          d.status === 'settled'
            ? 'Lunasan! Piutang sudah tertutup'
            : 'Pembayaran ' + rp(payAmt) + ' tercatat, sisa ' + rp(d.remaining ?? 0)
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
      title: 'Hapus piutang',
      message: 'Hapus piutang ini? Riwayat di log audit tetap tersimpan.',
      confirmLabel: 'Hapus',
      proceed: async () => {
        const r = await api('/api/debts/' + id, { method: 'DELETE' });
        if (r.ok) {
          showToast('Piutang dihapus');
          load();
        } else showToast(r.error || 'Gagal');
      },
    });
  }

  const debts = data?.debts ?? [];
  const open = data?.summary.open_total ?? 0;
  const openCount = data?.summary.open_count ?? 0;

  if (!data) return <PageSkeleton />;

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Belum lunas
          </p>
          <p className="mt-1 text-2xl font-extrabold text-amber-600 dark:text-amber-400">{rp(open)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{openCount} pelanggan</p>
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
        </div>
      </div>

      <div className="card mb-3 p-3">
        <p className="mb-2 text-sm font-bold">Catat piutang baru</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div>
            <label className="label">Nama</label>
            <input
              className="input"
              value={form.customer_name}
              placeholder="Pak Ahmad"
              onChange={(ev) => setForm({ ...form, customer_name: ev.target.value })}
            />
          </div>
          <div>
            <label className="label">No. HP</label>
            <input
              className="input"
              value={form.customer_phone}
              placeholder="Opsional"
              onChange={(ev) => setForm({ ...form, customer_phone: ev.target.value })}
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
            placeholder="Belanja untuk arisan, dll. (opsional)"
            onChange={(ev) => setForm({ ...form, note: ev.target.value })}
          />
        </div>
      </div>

      <div className="card p-3">
        <p className="mb-2 text-sm font-bold">
          {filter === 'open' ? 'Belum lunas' : filter === 'settled' ? 'Lunas' : 'Semua piutang'}
        </p>
        <div className="max-h-96 space-y-2 overflow-y-auto">

          {debts.map((x) => {
            const overdue = x.status === 'open' && x.due_date !== '' && x.due_date < todayStr();
            return (
              <div key={x.id} className="rounded-lg border border-slate-100 p-2.5 dark:border-navy-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      {x.customer_name}
                      {x.customer_phone && (
                        <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                          {x.customer_phone}
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
                    {overdue && <Badge tone="red">Tunggak</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
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
                        Terima Bayar
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
          {debts.length === 0 && <p className="text-sm text-slate-500">Belum ada.</p>}
        </div>
      </div>

      <Modal
        open={payFor !== null}
        title="Terima pembayaran"
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
              {payFor.customer_name} — sisa <b>{rp(payFor.remaining)}</b>
            </p>
            <label className="label">Jumlah diterima (Rp)</label>
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
              Status menjadi &ldquo;lunas&rdquo; otomatis saat sisa = 0.
            </p>
          </div>
        )}
      </Modal>

      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
