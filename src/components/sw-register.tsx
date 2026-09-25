'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Register service worker /sw.js (hanya di konteks secure).
 * Register saat load pertama bisa gagal jika dokumen belum punya sesi /
 * respons /sw.js belum siap — jadi retry saat dokumen aktif lagi
 * (visibilitychange->visible / pageshow). Register idempoten; flag sukses
 * + counter (MAKS_RETRY) mencegah spam. Kalau masih gagal setelah
 * MAKS_RETRY, error di-log sekali agar bisa didiagnosa.
 *
 * Deteksi update:
 * SW-BUILD di /sw.js di-stamp ulang tiap build → konten berubah →
 * `reg.update()` tiap load mendeteksi SW baru. Ketika SW baru masuk
 * status "installed" sementara halaman masih dikendalikan SW lama,
 * banner "Versi anyar tersedia" muncul di bawah layar:
 * - "Perbarui" → kirim message SKIP_WAITING → controllerchange (atau
 *   fallback timer) → halaman reload dengan versi baru.
 * - "Nanti"    → banner disembunyikan utk sesi tab ini (sessionStorage);
 *   muncul lagi saat aplikasi ditutup & dibuka ulang (load baru).
 * Halaman TIDAK di-reload otomatis (menghindari gangguan saat kasir
 * sedang mengetik transaksi).
 */
const MAKS_RETRY = 3;
const DISMISS_KEY = 'kopontren_sw_update_dismissed';

export function SwRegister() {
  const okRef = useRef(false);
  const attemptsRef = useRef(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    // "Nanti" dari load sebelumnya (tab belum ditutup) → mulai dalam
    // kondisi disembunyikan; muncul lagi setelah aplikasi ditutup.
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch {
      /* storage tidak tersedia: abaikan */
    }

    const tryRegister = () => {
      if (okRef.current) return; // sudah sukses -> berhenti
      if (attemptsRef.current >= MAKS_RETRY) return; // retry habis
      const secure =
        location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';
      // Tidak didukung / tidak secure: jangan buang retry.
      if (!('serviceWorker' in navigator) || !secure) return;
      attemptsRef.current += 1;
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          okRef.current = true;
          // Paksa cek update setiap load (Chrome throttle default 1 jam).
          // sw.js di-stamp SW-BUILD tiap build → konten berubah → SW lama
          // (yang bisa menyajikan page/API basi & menyebabkan "0 request")
          // langsung digantikan: install + skipWaiting + clientsClaim.
          reg.update().catch(() => {});

          // Peringatan update: SW baru di-"installed" sementara halaman
          // ini masih dikendalikan SW lama.
          reg.addEventListener('updatefound', () => {
            const newSw = reg.installing;
            if (!newSw) return;
            newSw.addEventListener('statechange', () => {
              if (
                newSw.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                setUpdateAvailable(true);
              }
            });
          });
          // Race: SW baru sudah terdeteksi sebelum listener terpasang.
          if (reg.installing && reg.active && reg.installing !== reg.active) {
            setUpdateAvailable(true);
          }
        })
        .catch((err) => {
          // Gagal: retry akan terjadi lagi di visibilitychange/pageshow
          // berikutnya. Kalau sudah MAKS_RETRY, log sekali.
          if (attemptsRef.current >= MAKS_RETRY) {
            console.error(
              `[PWA] service worker gagal register setelah ${MAKS_RETRY}x percobaan:`,
              err
            );
          }
        });
    };
    // visibilitychange fire saat hide pun — hanya retry saat dokumen visible.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tryRegister();
    };
    tryRegister();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', tryRegister);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', tryRegister);
    };
  }, []);
  /** "Nanti" — sembunyikan banner untuk sesi tab ini saja. */
  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* abaikan */
    }
  };

  /** "Perbarui" — aktivasi SW baru SEKARANG, lalu reload halaman. */
  const applyUpdate = () => {
    if (applying) return;
    setApplying(true);
    let reloaded = false;
    const done = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    // SKIP_WAITING → SW baru claim → controllerchange → reload.
    try {
      navigator.serviceWorker?.addEventListener('controllerchange', done, {
        once: true,
      });
      navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      /* abaikan */
    }
    // Fallback: bila controllerchange tak pernah fire, reload tetap jalan.
    setTimeout(done, 2000);
  };

  if (updateAvailable && !dismissed) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="print:hidden fixed inset-x-0 bottom-0 z-50 border-t border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          <span className="flex-1 font-medium">
            🆕 Versi anyar tersedia{applying ? ' — perbarui…' : ''}
          </span>
          <button
            type="button"
            onClick={dismiss}
            disabled={applying}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-amber-400 px-4 font-medium text-amber-800 disabled:opacity-50"
          >
            Nanti
          </button>
          <button
            type="button"
            onClick={applyUpdate}
            disabled={applying}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-amber-600 px-4 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {applying ? 'Memuat…' : 'Perbarui'}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
