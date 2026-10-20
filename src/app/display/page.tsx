import type { Metadata } from 'next';
import { DisplayClient } from '@/components/display-client';

/**
 * W8 ITEM 4 (CUSTOMER DISPLAY): kiosk pelanggan PUBLIK (tanpa login,
 * ruling Opasi B 20 Okt) -- layar HP lama / monitor kedua di kasir.
 * Polling 3 dtk menampilkan transaksi terakhir 15 dtk (QR QRIS bila
 * ada), selain itu = layar idle. Latar navy gelap tetap (layar kiosk
 * tak ikut tema aplikasi). Tanpa Shell (kiosk standalone).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Layar Pelanggan',
  description:
    'Kiosk pelanggan: menampilkan transaksi terakhir (total + QR QRIS) dan ucapan terima kasih.',
};

export default function DisplayPage() {
  return <DisplayClient />;
}
