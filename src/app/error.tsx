'use client';

import { useEffect } from 'react';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';
import { shareWa } from '@/lib/rekap';
import { Button } from '@/components/ui';

/**
 * Global error boundary (Wave 11 UI/UX P1): "Maaf, terjadi kesalahan"
 * + Muat Ulang + Bantuan WhatsApp (deep-link wa.me, tanpa API
 * credentials; reuse shareWa lib/rekap -- pola low-stock alert).
 * Standalone card di atas hero-bg (tanpa Shell: tak ada sesi login
 * saat galat global).
 */
export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
    // Tanpa auto-reset: galat server (mis. cold start/migrasi) tak
    // diperparah loop; pengguna memilih "Muat Ulang" sendiri.
  }, [error]);

  const helpWa = () => {
    shareWa("Assalamu'alaikum, saya mengalami kesalahan saat membuka Kopontren.", '');
  };

  return (
    <div className="hero-bg relative grid min-h-screen place-items-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl" />
      <div className="fade-up card w-full max-w-md border-white/60 bg-white/95 p-6 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-navy-900/90 sm:p-7">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-center text-xl font-extrabold tracking-tight">
          Maaf, terjadi kesalahan
        </h1>
        <p className="mt-1 text-center text-sm text-slate-600 dark:text-slate-300">
          Mohon muat ulang halaman. Jika masih gagal, hubungi kami via WhatsApp.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="primary" onClick={() => reset()} className="shadow-lg shadow-accent-500/25">
            <RefreshCw className="h-4 w-4" /> Muat Ulang
          </Button>
          <Button variant="secondary" onClick={helpWa}>
            <MessageCircle className="h-4 w-4" /> Bantuan via WhatsApp
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Kopontren Al Ittihad
        </p>
      </div>
    </div>
  );
}