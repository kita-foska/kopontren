'use client';

/**
 * W8 ITEM 4 (CUSTOMER DISPLAY): layar kiosk pelanggan publik (/display).
 * Polling GET /api/display/latest tiap 3 dtk (pola confidence banner --
 * ruling Opasi B, bukan SSE/WebSocket); transaksi BARU (id berubah)
 * ditayangkan 15 dtk lalu auto-reset ke layar idle. Dua kondisi:
 *  - idle   : logo + "Silakan belanja" (tampan selalu);
 *  - last   : "Terima kasih" + total XL + jumlah baris + label metode
 *             + jam WIB + QR QRIS dinamis (bila ada; bila QRIS belom
 *             dikonfigurasi admin = total saja -- jujur, tanpa QR rusak).
 * Layaran PII-free (endpoint memproyeksi field; lihat
 * src/lib/display-latest.ts). Latar navy gelap tetap -- layar kiosk
 * tak ikut tema aplikasi. Ikon = lucide inline; tak ada emoji.
 */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, QrCode, Store } from 'lucide-react';
import { rp } from '@/lib/format';

type LastSale = {
  id: number;
  total: number;
  item_count: number;
  methods: string[];
  time_wib: string | null;
  qris: string | null;
};

const POLL_MS = 3000; // ruling: polling 3 detik
const SHOW_MS = 15000; // ruling: tampil 15 detik lalu idle lagi

export function DisplayClient() {
  const [sale, setSale] = useState<LastSale | null>(null);
  const [qr, setQr] = useState('');
  const lastSeenRef = useRef<number | null>(null);
  const hideTimerRef = useRef(0);

  useEffect(() => {
    let dead = false;
    async function tick() {
      try {
        const r = await fetch('/api/display/latest', { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { last: LastSale | null };
        const last = j.last;
        if (dead) return;
        if (last && last.id !== lastSeenRef.current) {
          // Transaksi BARU (atau polling pertama: tak ditayangkan --
          // kiosk hanya menampilkan transaksi yang baru terjadi, bukan
          // memutar ulang transaksi lama saat layar dibuka).
          const isNew = lastSeenRef.current !== null;
          lastSeenRef.current = last.id;
          if (isNew) {
            setSale(last);
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = window.setTimeout(() => setSale(null), SHOW_MS);
          }
        }
      } catch {
        /* offline: layar tetap di kondisi sekarang (tidak hang) */
      }
    }
    void tick();
    const iv = window.setInterval(tick, POLL_MS);
    return () => {
      dead = true;
      window.clearInterval(iv);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  // QR QRIS: payload QRIS dari endpoint -> dataURL (pola qris-client).
  useEffect(() => {
    setQr('');
    if (!sale?.qris) return;
    QRCode.toDataURL(sale.qris, { width: 1024, margin: 2 }).then(setQr).catch(() => setQr(''));
  }, [sale]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 overflow-hidden bg-navy-900 px-6 text-white sm:gap-8">
      {sale ? (
        <div className="flex w-full max-w-3xl flex-col items-center gap-4 text-center sm:gap-6">
          <div className="flex items-center gap-3 text-emerald-300">
            <CheckCircle2 className="h-10 w-10 sm:h-14 sm:w-14" aria-hidden />
            <p className="text-3xl font-extrabold tracking-tight sm:text-5xl">Terima kasih!</p>
          </div>
          <p className="text-4xl font-black tabular-nums text-white sm:text-6xl">{rp(sale.total)}</p>
          <p className="text-lg font-semibold text-slate-300 sm:text-2xl">
            {sale.item_count} {sale.item_count === 1 ? 'item' : 'item'} ·{' '}
            {sale.methods.join(' + ')}
          </p>
          {qr ? (
            <div className="rounded-2xl bg-white p-3 shadow-xl sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR QRIS" className="h-44 w-44 sm:h-64 sm:w-64" />
              <p className="mt-2 text-xs font-bold text-slate-700">Pindai dengan aplikasi e-wallet</p>
            </div>
          ) : sale.qris === null && sale.methods.includes('QRIS / WA') ? (
            <p className="text-sm text-slate-400">QRIS belum dikonfigurasi -- total tetap tercatat.</p>
          ) : null}
          <p className="text-xs text-slate-500">
            {sale.time_wib ? 'Waktu: ' + sale.time_wib : ''} · Transaksi #{sale.id}
          </p>
        </div>
      ) : (
        <div className="flex w-full max-w-3xl flex-col items-center gap-4 text-center sm:gap-6">
          <div className="rounded-full bg-white/10 p-5 sm:p-7">
            <Store className="h-12 w-12 text-emerald-300 sm:h-16 sm:w-16" aria-hidden />
          </div>
          <p className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Silakan belanja
          </p>
          <p className="text-lg text-slate-300 sm:text-xl">
            Kami tampilkan transaksi terakhir di layar ini
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <QrCode className="h-4 w-4" aria-hidden /> Layar Pelanggan
          </p>
        </div>
      )}
    </div>
  );
}
