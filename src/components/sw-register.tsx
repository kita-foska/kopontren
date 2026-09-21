'use client';

import { useEffect, useRef } from 'react';

/**
 * Register service worker /sw.js (hanya di konteks secure).
 * Register saat load pertama bisa gagal jika dokumen belum punya sesi /
 * respons /sw.js belum siap — jadi retry saat dokumen aktif lagi
 * (visibilitychange->visible / pageshow). Register idempoten; flag sukses
 * + counter (MAKS_RETRY) mencegah spam. Kalau masih gagal setelah
 * MAKS_RETRY, error di-log sekali agar bisa didiagnosa.
 */
const MAKS_RETRY = 3;

export function SwRegister() {
  const okRef = useRef(false);
  const attemptsRef = useRef(0);
  useEffect(() => {
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
  return null;
}
