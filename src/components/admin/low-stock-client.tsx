'use client';

import { useState } from 'react';
import { api, Badge, Empty, Toast, useToast } from '@/components/ui';
import { shareWa } from '@/lib/rekap';
import { Copy, MessageCircle } from 'lucide-react';

type Item = {
  id: number;
  name: string;
  stock: number;
  unit: string;
  avg_daily: number;
  days_left: number | null;
};

/**
 * Widget stok menipis: estimasi sisa hari (prediksi dari penjualan 14 hari
 * terakhir) + tombol kirim alert ke WhatsApp (deep-link wa.me — tanpa API
 * credentials; nomor tujuan dari settings toko, fallback share sheet).
 */
export function LowStockClient({ items }: { items: Item[] }) {
  const [toast, showToast] = useToast();
  const [busy, setBusy] = useState(false);

  function waMessage(): string {
    const lines: string[] = [];
    lines.push('*ALERT STOK MENIPIS*');
    lines.push('Kopontren AL ITTIHAD - ' + new Date().toLocaleDateString('id-ID'));
    lines.push('===========================');
    for (const p of items) {
      const eta =
        p.days_left == null ? 'belum ada penjualan 14 hari' : 'sisa ±' + p.days_left + ' hari';
      lines.push('- ' + p.name + ': ' + p.stock + ' ' + p.unit + ' (' + eta + ')');
    }
    lines.push('===========================');
    lines.push('Harap segera restock. Terima kasih.');
    return lines.join('\n');
  }

  async function sendWa() {
    if (items.length === 0) return;
    setBusy(true);
    const r = await api<{ store_phone?: string }>('/api/settings');
    setBusy(false);
    shareWa(waMessage(), r.ok ? r.data?.store_phone || '' : '');
    showToast('Membuka WhatsApp dengan pesan alert stok…');
  }

  function copyMsg() {
    navigator.clipboard?.writeText(waMessage());
    showToast('Pesan alert stok disalin ke clipboard');
  }

  return (
    <div className="card fade-up p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold">
          Stok Menipis <span className="text-xs text-slate-500">(&lt; 10, prediksi ±hari)</span>
        </h2>
        {items.length > 0 && (
          <div className="flex gap-1.5">
            <button type="button"
              className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1 text-xs"
              onClick={copyMsg}
            >
              <Copy className="h-3.5 w-3.5" />
              Salin
            </button>
            <button type="button"
              className="btn-primary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
              onClick={() => void sendWa()}
              disabled={busy}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Notif WA
            </button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <Empty text="Semua stok aman (≥ 10). Tidak ada alert." />
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{p.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {p.stock} {p.unit}
                </span>
                <Badge tone={p.stock <= 0 ? 'red' : p.days_left != null && p.days_left <= 2 ? 'red' : 'amber'}>
                  {p.days_left == null ? (
                'belum ada penjualan 14 hari'
              ) : (
                'habis dalam ±' + p.days_left + ' hr'
              )}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}