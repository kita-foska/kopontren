'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Toast, useConfirm, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';

type Kons = {
  id: number;
  owner: string;
  owner_phone: string;
  item_name: string;
  unit: string;
  qty_received: number;
  agree_price: number;
  qty_sold: number;
  qty_returned: number;
  amount_paid: number;
  status: string;
  note: string;
  created_at: string;
  settled_at: string | null;
  remaining: number;
  payable: number;
  unpaid: number;
};
type Resp = {
  consignments: Kons[];
  totals: { active: number; unpaid: number; remaining: number };
  limit?: number;
  offset?: number;
};

const EMPTY_FORM = {
  owner: '',
  owner_phone: '',
  item_name: '',
  unit: 'pcs',
  qty: 1,
  agree_price: 0,
  note: '',
};

export function KonsinyasiClient() {
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [data, setData] = useState<Resp | null>(null);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();
  const [f, setF] = useState(EMPTY_FORM);
  const [acts, setActs] = useState<Record<number, { qty: number; pay: number }>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [canMore, setCanMore] = useState(false);

  const load = useCallback(async (offset = 0, append = false) => {
    // Server cap 50 baris/halaman; offset melanjutkan riwayat konsinyasi.
    const r = await api<Resp>('/api/konsinyasi?limit=50&offset=' + offset);
    if (r.ok && r.data) {
      setData((prev) => {
        const d = r.data!;
        if (!prev || !append) return d;
        const seen = new Set(prev.consignments.map((k) => k.id));
        return {
          ...d,
          consignments: [
            ...prev.consignments,
            ...d.consignments.filter((k) => !seen.has(k.id)),
          ],
        };
      });
      setCanMore((r.data!.consignments?.length || 0) >= 50);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (loadingMore || !canMore || !data) return;
    setLoadingMore(true);
    await load(data.consignments.length, true);
    setLoadingMore(false);
  }

  async function post(body: object, okMsg: string) {
    const r = await api<{ ok?: boolean }>('/api/konsinyasi', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      showToast(okMsg);
      load();
    } else showToast(r.error || 'Gagal memproses');
  }

  function act(id: number, patch: Partial<{ qty: number; pay: number }>) {
    setActs((a) => {
      const cur = a[id] ?? { qty: 1, pay: 0 };
      return { ...a, [id]: { ...cur, ...patch } };
    });
  }

  async function create() {
    if (!f.owner.trim() || !f.item_name.trim() || f.qty <= 0) {
      showToast('Pemilik, barang & jumlah wajib diisi');
      return;
    }
    await post(f, 'Konsinyasi diterima & tercatat');
    setF(EMPTY_FORM);
  }

  function jual(k: Kons) {
    post({ action: 'sell', id: k.id, qty: acts[k.id]?.qty || 1 }, 'Penjualan tercatat');
  }
  function kembalikan(k: Kons) {
    post({ action: 'return', id: k.id, qty: acts[k.id]?.qty || 1 }, 'Pengembalian tercatat');
  }
  function bayar(k: Kons) {
    post(
      { action: 'pay', id: k.id, amount: acts[k.id]?.pay || 0 },
      'Pembayaran tercatat & masuk pembukuan kas'
    );
  }
  function tutup(k: Kons) {
    ask({
      title: 'Tutup konsinyasi',
      message: 'Tutup konsinyasi ' + k.item_name + ' milik ' + k.owner + '?',
      confirmLabel: 'Tutup',
      proceed: () => post({ action: 'close', id: k.id }, 'Konsinyasi ditutup'),
    });
  }
  function bukaLagi(k: Kons) {
    post({ action: 'reopen', id: k.id }, 'Dibuka kembali');
  }

  const active = data?.consignments.filter((k) => k.status === 'active') || [];
  const done = data?.consignments.filter((k) => k.status === 'settled') || [];
  if (!data) return <p className="text-sm text-slate-500">Memuat…</p>;

  function KonsCard({ k, doneMode }: { k: Kons; doneMode: boolean }) {
    return (
      <div className="card mb-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold">
              {k.item_name} <Badge tone="gray">{k.unit}</Badge>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pemilik: {k.owner}
              {k.owner_phone ? ' · ' + k.owner_phone : ''}
            </p>
          </div>
          <Badge tone={doneMode ? 'gray' : 'green'}>{doneMode ? 'Selesai' : 'Aktif'}</Badge>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Diterima {k.qty_received} {k.unit} @ {rp(k.agree_price)}
          {k.note ? ' · ' + k.note : ''}
          {!doneMode ? ' · dicatat ' + fmtDateTime(k.created_at) : ''}
          {doneMode && k.settled_at ? ' · ditutup ' + fmtDateTime(k.settled_at) : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="blue">Terjual {k.qty_sold}</Badge>
          <Badge tone="gray">Dikembalikan {k.qty_returned}</Badge>
          <Badge tone="amber">Sisa {k.remaining}</Badge>
          <Badge tone="red">Tagihan {rp(k.payable)}</Badge>
          <Badge tone="green">Terbayar {rp(k.amount_paid)}</Badge>
          {k.unpaid > 0 && <Badge tone="red">Kurang {rp(k.unpaid)}</Badge>}
        </div>
        {doneMode ? (
          <div className="mt-3 flex justify-end">
            <button className="btn-ghost" onClick={() => bukaLagi(k)}>
              Buka lagi
            </button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
            <div>
              <label className="label">Jumlah (jual / kembalikan)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={acts[k.id]?.qty ?? 1}
                onChange={(e) => act(k.id, { qty: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Nominal bayar (Rp)</label>
              <input
                type="number"
                min={0}
                className="input"
                value={acts[k.id]?.pay ?? 0}
                onChange={(e) => act(k.id, { pay: Number(e.target.value) })}
              />
            </div>
            <button className="btn-ghost" onClick={() => jual(k)}>
              Jual
            </button>
            <button className="btn-ghost" onClick={() => kembalikan(k)}>
              Kembalikan
            </button>
            <button className="btn-amber" onClick={() => bayar(k)}>
              Bayar
            </button>
            <button className="btn-danger" onClick={() => tutup(k)}>
              Tutup
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Konsinyasi aktif
          </p>
          <p className="mt-1 text-2xl font-extrabold text-accent-500 dark:text-accent-300">
            {data.totals.active}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">barang titipan berjalan</p>
        </div>
        <div className="card p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Tagihan belum dibayar
          </p>
          <p className="mt-1 text-2xl font-extrabold text-rose-500">{rp(data.totals.unpaid)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">kepada pemilik</p>
        </div>
        <div className="card p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Sisa barang
          </p>
          <p className="mt-1 text-2xl font-extrabold">{data.totals.remaining}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            belum terjual / dikembalikan
          </p>
        </div>
      </div>

      <div className="card mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <div>
          <label className="label">Pemilik *</label>
          <input
            className="input"
            value={f.owner}
            placeholder="Nama pemilik / pemilik kebun…"
            onChange={(e) => setF({ ...f, owner: e.target.value })}
          />
        </div>
        <div>
          <label className="label">HP pemilik</label>
          <input
            className="input"
            value={f.owner_phone}
            placeholder="Opsional"
            onChange={(e) => setF({ ...f, owner_phone: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Barang titipan *</label>
          <input
            className="input"
            value={f.item_name}
            placeholder="Madu, walet, dll."
            onChange={(e) => setF({ ...f, item_name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Satuan</label>
          <input
            className="input"
            value={f.unit}
            placeholder="pcs, liter, gr…"
            onChange={(e) => setF({ ...f, unit: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Jumlah diterima *</label>
          <input
            type="number"
            min={1}
            className="input"
            value={f.qty}
            onChange={(e) => setF({ ...f, qty: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Rp / unit (harga perjanjian)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={f.agree_price}
            onChange={(e) => setF({ ...f, agree_price: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Catatan</label>
          <input
            className="input"
            value={f.note}
            placeholder="Opsional"
            onChange={(e) => setF({ ...f, note: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={create}>
            Terima Konsinyasi
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Harga perjanjian = nominal per unit yang dibayarkan kepada pemilik tiap barang terjual.
      </p>

      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setTab('active')}
          className={tab === 'active' ? 'btn-primary' : 'btn-ghost'}
        >
          Aktif ({active.length})
        </button>
        <button
          onClick={() => setTab('done')}
          className={tab === 'done' ? 'btn-primary' : 'btn-ghost'}
        >
          Selesai ({done.length})
        </button>
      </div>

      {tab === 'active' ? (
        active.length === 0 ? (
          <p className="text-sm text-slate-500">
            Belum ada konsinyasi aktif. Terima barang titipan melalui form di atas.
          </p>
        ) : (
          <div>
            {active.map((k) => (
              <KonsCard key={k.id} k={k} doneMode={false} />
            ))}
          </div>
        )
      ) : done.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada konsinyasi yang ditutup.</p>
      ) : (
        <div>
          {done.map((k) => (
            <KonsCard key={k.id} k={k} doneMode={true} />
          ))}
        </div>
      )}
      {canMore && (
        <div className="p-1 text-center">
          <button className="btn-ghost text-xs" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Memuat…' : 'Muat riwayat lebih lama'}
          </button>
        </div>
      )}
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}