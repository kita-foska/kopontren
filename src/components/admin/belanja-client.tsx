'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageSkeleton, api, Badge, Toast, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';

type Purchase = {
  id: number;
  product_name: string;
  qty: number;
  unit_cost: number;
  supplier: string;
  created_at: string;
};
type Expense = {
  id: number;
  name: string;
  category: string;
  amount: number;
  created_at: string;
};
  type Resp = {
    purchases: Purchase[];
    expenses: Expense[];
    products: { id: number; name: string }[];
    /** Total global dari server (seluruh data), akurat walau daftar hanya 50 terbaru. */
    totals: { in: number; out: number };
  };

export function BelanjaClient() {
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [data, setData] = useState<Resp | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const r = await api<Resp>('/api/belanja');
    if (r.ok && r.data) setData(r.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const [p, setP] = useState({ product_id: '', qty: 1, unit_cost: 0, supplier: '' });
  const [e, setE] = useState({ name: '', category: '', amount: 0 });
  // Guard busy: cegah double-submit (null = idle, 'in'/'out' = tab yg request).
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);

  async function addPurchase() {
    if (busy) return;
    if (!p.product_id || p.qty <= 0) {
      showToast('Pilih produk & jumlah minimal 1');
      return;
    }
    setBusy('in');
    try {
      const r = await api('/api/purchases', { method: 'POST', body: JSON.stringify(p) });
      if (r.ok) {
        showToast('Stok masuk tercatat, HPP diperbarui');
        setP({ product_id: '', qty: 1, unit_cost: 0, supplier: '' });
        load();
      } else showToast(r.error || 'Gagal');
    } finally {
      setBusy(null);
    }
  }

  async function addExpense() {
    if (busy) return;
    if (!e.name.trim() || e.amount <= 0) {
      showToast('Nama & nominal wajib');
      return;
    }
    setBusy('out');
    try {
      const r = await api('/api/expenses', { method: 'POST', body: JSON.stringify(e) });
      if (r.ok) {
        showToast('Pengeluaran tercatat');
        setE({ name: '', category: '', amount: 0 });
        load();
      } else showToast(r.error || 'Gagal');
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <PageSkeleton />;
  // Total memakai agregat global dari server (semua data), bukan jumlah dari
  // daftar 50 terbaru — kartu ringkasan tetap akurat.
  const inTotal = data.totals.in;
  const outTotal = data.totals.out;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab('in')} className={tab === 'in' ? 'btn-primary' : 'btn-ghost'}>
          Stok Masuk (Belanja)
        </button>
        <button onClick={() => setTab('out')} className={tab === 'out' ? 'btn-primary' : 'btn-ghost'}>
          Pengeluaran
        </button>
      </div>
      {tab === 'in' ? (
        <>
          <div className="card mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-5">
            <div>
              <label className="label">Produk</label>
              <select
                className="input"
                value={p.product_id}
                onChange={(ev) => setP({ ...p, product_id: ev.target.value })}
              >
                <option value="">—</option>
                {data.products.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Jumlah</label>
              <input
                className="input"
                type="number"
                min={1}
                value={p.qty}
                onChange={(ev) => setP({ ...p, qty: Number(ev.target.value) })}
              />
            </div>
            <div>
              <label className="label">HPP (Rp)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={p.unit_cost}
                onChange={(ev) => setP({ ...p, unit_cost: Number(ev.target.value) })}
              />
            </div>
            <div>
              <label className="label">Supplier</label>
              <input
                className="input"
                value={p.supplier}
                onChange={(ev) => setP({ ...p, supplier: ev.target.value })}
              />
            </div>
            <div className="flex items-end">
              <button
                className="btn-primary w-full"
                disabled={busy === 'in'}
                onClick={addPurchase}
              >
                {busy === 'in' ? 'Menyimpan…' : 'Catat'}
              </button>
            </div>
          </div>
          <div className="card p-3 text-sm">
            Total pembelian: <b className="text-accent-500 dark:text-accent-300">{rp(inTotal)}</b>{' '}
            <span className="text-xs text-slate-400">(dari semua data)</span>
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {data.purchases.map((x) => (
                <div
                  key={x.id}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 dark:border-navy-700"
                >
                  <span className="text-sm">
                    {x.product_name} · {x.qty}×{rp(x.unit_cost)}
                    {x.supplier && (
                      <span className="text-xs text-slate-500"> · {x.supplier}</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {fmtDateTime(x.created_at)}
                  </span>
                </div>
              ))}
              {data.purchases.length === 0 && (
                <p className="text-sm text-slate-500">Belum ada.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
            <div>
              <label className="label">Uraian</label>
              <input
                className="input"
                value={e.name}
                placeholder="Listrik, air, bensin…"
                onChange={(ev) => setE({ ...e, name: ev.target.value })}
              />
            </div>
            <div>
              <label className="label">Kategori</label>
              <input
                className="input"
                value={e.category}
                placeholder="Umum"
                onChange={(ev) => setE({ ...e, category: ev.target.value })}
              />
            </div>
            <div>
              <label className="label">Nominal (Rp)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={e.amount}
                onChange={(ev) => setE({ ...e, amount: Number(ev.target.value) })}
              />
            </div>
            <div className="flex items-end">
              <button
                className="btn-primary w-full"
                disabled={busy === 'out'}
                onClick={addExpense}
              >
                {busy === 'out' ? 'Menyimpan…' : 'Catat'}
              </button>
            </div>
          </div>
          <div className="card p-3 text-sm">
            Total pengeluaran: <b className="text-rose-600 dark:text-rose-400">{rp(outTotal)}</b>{' '}
            <span className="text-xs text-slate-400">(dari semua data)</span>
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {data.expenses.map((x) => (
                <div
                  key={x.id}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 dark:border-navy-700"
                >
                  <span className="text-sm">
                    {x.name}
                    {x.category && <Badge tone="gray">{x.category}</Badge>}
                  </span>
                  <span className="flex items-center gap-2">
                    <b>{rp(x.amount)}</b>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {fmtDateTime(x.created_at)}
                    </span>
                  </span>
                </div>
              ))}
              {data.expenses.length === 0 && <p className="text-sm text-slate-500">Belum ada.</p>}
            </div>
          </div>
        </>
      )}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
