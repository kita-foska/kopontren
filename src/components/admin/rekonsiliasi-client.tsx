'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Table, Td, Th, Trow, api } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

type RekCheck = {
  id: string;
  label: string;
  status: 'ok' | 'drift';
  drift_count: number;
  detail: string;
  rows: Record<string, unknown>[];
};
type Resp = {
  ok?: boolean;
  clean?: boolean;
  as_of?: string;
  drift_total?: number;
  checks?: RekCheck[];
  notes?: string[];
  error?: string;
};

/**
 * Konfigurasi kolom detail per cek — SELARAS dgn id & bentuk baris di
 * src/lib/rekonsiliasi.ts (ID cek sengaja stabil di sisi server).
 */
const COLS: Record<string, { k: string; t: string }[]> = {
  SALES_PAY: [
    { k: 'id', t: 'ID' },
    { k: 'total', t: 'Total' },
    { k: 'amount_paid', t: 'Dibayar' },
    { k: 'change', t: 'Kembalian' },
    { k: 'pay_method', t: 'Metode' },
  ],
  SALES_MONEY: [
    { k: 'id', t: 'ID' },
    { k: 'total', t: 'Total' },
    { k: 'amount_paid', t: 'Dibayar' },
    { k: 'change', t: 'Kembalian' },
  ],
  SPLIT: [
    { k: 'id', t: 'ID' },
    { k: 'total', t: 'Total' },
    { k: 'pay_split', t: 'pay_split' },
  ],
  SHIFT: [
    { k: 'id', t: 'Shif #' },
    { k: 'kasir_id', t: 'Kasir' },
    { k: 'shift_count', t: 'Rekap trx' },
    { k: 'pos_count', t: 'Rehitung trx' },
    { k: 'shift_total', t: 'Rekap total' },
    { k: 'pos_total', t: 'Rehitung total' },
    { k: 'shift_cash', t: 'Rekap tunai' },
    { k: 'pos_cash', t: 'Rehitung tunai' },
  ],
  RETURN: [
    { k: 'sale_id', t: 'Transaksi' },
    { k: 'product_id', t: 'Produk' },
    { k: 'qty', t: 'Qty terjual' },
    { k: 'qty_retur', t: 'Qty retur' },
  ],
  STOCK: [
    { k: 'id', t: 'ID' },
    { k: 'name', t: 'Produk' },
    { k: 'stock', t: 'Stok' },
  ],
  DEBTS: [
    { k: 'id', t: 'ID' },
    { k: 'customer_name', t: 'Piutang' },
    { k: 'amount', t: 'Tagihan' },
    { k: 'paid', t: 'Lunas' },
    { k: 'remaining', t: 'Sisa' },
  ],
  PAYABLES: [
    { k: 'id', t: 'ID' },
    { k: 'supplier_name', t: 'Supplier' },
    { k: 'amount', t: 'Tagihan' },
    { k: 'paid', t: 'Lunas' },
    { k: 'remaining', t: 'Sisa' },
  ],
  POINTS: [
    { k: 'id', t: 'ID' },
    { k: 'name', t: 'Member' },
    { k: 'points', t: 'Poin' },
    { k: 'ledger', t: 'Ledger' },
  ],
  CASHBACK: [
    { k: 'id', t: 'ID' },
    { k: 'name', t: 'Member' },
    { k: 'cashback_balance', t: 'Saldo' },
    { k: 'ledger', t: 'Ledger' },
  ],
  KONSIN: [
    { k: 'id', t: 'ID' },
    { k: 'owner', t: 'Pemilik' },
    { k: 'item_name', t: 'Barang' },
    { k: 'remaining', t: 'Sisa' },
    { k: 'payable', t: 'Tagihan' },
    { k: 'amount_paid', t: 'Terbayar' },
    { k: 'status', t: 'Status' },
  ],
  KONSIN_UJRAH: [
    { k: 'expected', t: 'Ujrah diharapkan' },
    { k: 'recorded', t: 'Tercatat kas' },
  ],
  KONSIN_PAY: [
    { k: 'expected', t: 'Terbayar (konsinyasi)' },
    { k: 'recorded', t: 'Tercatat kas' },
  ],
  RETURN_COGS: [
    { k: 'id', t: 'Retur #' },
    { k: 'sale_id', t: 'Transaksi' },
    { k: 'product_id', t: 'Produk' },
    { k: 'qty', t: 'Qty retur' },
    { k: 'cogs', t: 'COGS tercatat' },
    { k: 'cost_price', t: 'HPP item' },
    { k: 'expected', t: 'HPP diharapkan' },
  ],
  JOURNAL_BAL: [
    { k: 'id', t: 'ID entry' },
    { k: 'ref_table', t: 'Ref' },
    { k: 'ref_id', t: 'Ref #' },
    { k: 'type', t: 'Tipe' },
    { k: 'debit', t: 'Debit' },
    { k: 'credit', t: 'Credit' },
    { k: 'selisih', t: 'Selisih' },
  ],
  GL_TZ: [
    { k: 'id', t: 'ID entry' },
    { k: 'ref_table', t: 'Ref' },
    { k: 'ref_id', t: 'Ref #' },
    { k: 'entry_date', t: 'Tanggal entry' },
  ],
};

/** Kolom bernilai rupiah (format id-ID). */
const MONEY = new Set([
  'total',
  'amount_paid',
  'change',
  'shift_total',
  'pos_total',
  'shift_cash',
  'pos_cash',
  'amount',
  'paid',
  'remaining',
  'payable',
  'cashback_balance',
  'expected',
  'recorded',
  'cogs',
  'cost_price',
  'debit',
  'credit',
  'selisih',
]);

function cellVal(r: Record<string, unknown>, k: string): string {
  const v = r[k];
  if (v === null || v === undefined) return '';
  if (MONEY.has(k) && typeof v === 'number') return 'Rp ' + v.toLocaleString('id-ID');
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

export function RekonsiliasiClient() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await api<Resp>('/api/reconciliation');
    if (r.ok && r.data) {
      setData(r.data);
      setErr('');
    } else {
      setData(null);
      setErr(r.error || 'Gagal memuat rekonsiliasi.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data)
    return (
      <div className="card p-4">
        {err ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>
            <Button variant="ghost" onClick={load}>
              Muat ulang
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Memuat…</p>
        )}
      </div>
    );

  const drift = data.drift_total ?? 0;
  return (
    <div className="space-y-3">
      {/* Baris atas: status keseluruhan — flag-only, tanpa aksi data */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-lg font-extrabold">
            {drift === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">Semua cek selaras</span>
            ) : (
              <span className="text-rose-600 dark:text-rose-400">{drift} selisih terdeteksi</span>
            )}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {(data.checks?.length ?? 0) + ' cek · per ' + (data.as_of ? fmtDateTime(data.as_of) : '-')} —
            flag-only: halaman ini TIDAK mengubah data.
          </p>
        </div>
        <Button variant="ghost" onClick={load}>
          Muat ulang
        </Button>
      </div>

      {/* 16 kartu cek (drift di-ring merah + tabel detail baris) */}
      {data.checks?.map((c) => {
        const cols = COLS[c.id] ?? [];
        const bad = c.status === 'drift';
        return (
          <div key={c.id} className={'card p-4' + (bad ? ' ring-1 ring-rose-200 dark:ring-rose-800' : '')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold">{c.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{c.detail}</p>
              </div>
              <span
                className={
                  'rounded-full px-2 py-0.5 text-xs font-bold ' +
                  (bad
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300')
                }
              >
                {bad ? 'DRIFT' : 'OK'}
              </span>
            </div>
            {bad && c.rows.length > 0 && cols.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <Table minW="min-w-[32rem]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-navy-700">
                      {cols.map((col) => (
                        <Th key={col.k}>{col.t}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.rows.map((r, i) => (
                      <Trow key={i}>
                        {cols.map((col) => (
                          <Td key={col.k} className="text-xs">
                            {cellVal(r, col.k)}
                          </Td>
                        ))}
                      </Trow>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        );
      })}

      {/* Catatan V1 (keputusan P0-C3) */}
      {data.notes && data.notes.length > 0 && (
        <div className="card p-4">
          <p className="mb-2 text-sm font-bold">Catatan</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-slate-500 dark:text-slate-400">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
