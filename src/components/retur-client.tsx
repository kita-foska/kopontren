'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Empty, Toast, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';

type SaleItem = {
  product_id: number | null;
  product_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  subtotal?: number;
  discount?: number;
};
type Sale = {
  id: number;
  customer: string;
  total: number;
  pay_method: string;
  created_at: string;
  items: SaleItem[];
};
type Retur = {
  id: number;
  sale_id: number;
  product_id: number;
  qty: number;
  reason: string;
  amount: number;
  created_at: string;
  sale_customer: string;
  sale_total: number;
  item_name: string;
};
type ReturResp = { returns: Retur[] };

export function ReturClient() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [rets, setRet] = useState<Retur[]>([]);
  const [toast, showToast] = useToast();
  const [saleId, setSaleId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [rr, sr] = await Promise.all([
      api<ReturResp>('/api/returns'),
      api<{ sales: Sale[] }>('/api/sales?days=30&status=all'),
    ]);
    if (rr.ok && rr.data) setRet(rr.data.returns);
    if (sr.ok && sr.data) setSales(sr.data.sales.slice(0, 100));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const selectedSale = sales.find((s) => String(s.id) === saleId);
  const items = (selectedSale?.items ?? []).filter((i) => i.product_id);
  const selItem = items.find((i) => String(i.product_id) === itemId);
  // Estimasi refund memakai harga efektif (net setelah diskon baris), sinkron
  // dgn server /api/returns — bukan unit_price mentah.
  const soldQty = Math.max(1, selItem?.qty || 0);
  const lineNet = selItem
    ? Math.max(0, (selItem.subtotal ?? selItem.unit_price * soldQty) - (selItem.discount ?? 0))
    : 0;
  const amount = selItem ? Math.round((lineNet * qty) / soldQty) : 0;

  async function submit() {
    if (!saleId || !itemId || qty < 1) {
      showToast('Pilih transaksi, produk & jumlah (min 1)');
      return;
    }
    setBusy(true);
    const r = await api<{ note?: string }>('/api/returns', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: Number(saleId),
        product_id: Number(itemId),
        qty,
        reason,
        refund,
      }),
    });
    setBusy(false);
    if (r.ok) {
      showToast(r.data?.note || 'Retur tercatat, stok dikembalikan');
      setSaleId('');
      setItemId('');
      setQty(1);
      setReason('');
      setRefund(true);
      load();
    } else showToast(r.error || 'Gagal');
  }

  return (
    <div>
      <div id="retur-form" className="card mb-3 p-3">
        <p className="mb-2 text-sm font-bold">Catat retur</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div>
            <label className="label">Transaksi</label>
            <select
              className="input"
              value={saleId}
              onChange={(ev) => {
                setSaleId(ev.target.value);
                setItemId('');
              }}
            >
              <option value="">—</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} {s.customer ? '· ' + s.customer : ''} · {rp(s.total)} ·{' '}
                  {fmtDateTime(s.created_at)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Produk di transaksi</label>
            <select
              className="input"
              value={itemId}
              onChange={(ev) => setItemId(ev.target.value)}
              disabled={!saleId}
            >
              <option value="">—</option>
              {items.map((i) => (
                <option key={i.product_id ?? i.product_name} value={i.product_id ?? ''}>
                  {i.product_name} ({i.qty} {i.unit} @ {rp(i.unit_price)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Jumlah retur</label>
            <input
              className="input"
              type="number"
              min={1}
              value={qty}
              onChange={(ev) => setQty(Number(ev.target.value))}
            />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div>
            <label className="label">Alasan</label>
            <input
              className="input"
              value={reason}
              placeholder="Kualitas, salah pesanan…"
              onChange={(ev) => setReason(ev.target.value)}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={refund} onChange={(ev) => setRefund(ev.target.checked)} />
              Refund tunai
            </label>
          </div>
          <div className="flex items-end">
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={submit}>
              {busy ? 'Menyimpan…' : 'Simpan Retur'}
            </button>
          </div>
        </div>
        {selItem && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Nilai retur: <b className="text-accent-500 dark:text-accent-300">{rp(amount)}</b>
            {refund ? ' (masuk jurnal kas keluar)' : ''} + stok {selItem.product_name} +{qty}.
          </p>
        )}
      </div>

      <div className="card p-3">
        <p className="mb-2 text-sm font-bold">Riwayat retur</p>
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {rets.map((x) => (
            <div
              key={x.id}
              className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 dark:border-navy-700"
            >
              <span className="text-sm">
                {x.item_name || ('Produk #' + x.product_id)} · {x.qty}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {' '}
                  · transaksi #{x.sale_id}
                  {x.sale_customer ? ' · ' + x.sale_customer : ''}
                  {x.reason ? ' · ' + x.reason : ''}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone="blue">-{rp(x.amount)}</Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {fmtDateTime(x.created_at)}
                </span>
              </span>
            </div>
          ))}
          {rets.length === 0 && (
            <Empty
              compact
              text="Belum ada."
              ctaLabel="Catat retur"
              ctaOnClick={() =>
                document
                  .getElementById('retur-form')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            />
          )}
        </div>
      </div>

      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}

