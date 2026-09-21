'use client';

import { useEffect, useRef } from 'react';

/**
 * Register service worker /sw.js (hanya di konteks secure).
 * Retry saat dokumen aktif lagi (visibilitychange/pageshow) karena
 * register saat load pertama bisa gagal jika dokumen itu belum punya
 * sesi — register idempoten, flag mencegah spam.
 */
export function SwRegister() {
  const okRef = useRef(false);
  useEffect(() => {
    const tryRegister = () => {
      if (okRef.current) return;
      const secure =
        location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';
      if (!('serviceWorker' in navigator) || !secure) return;
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
        .catch(() => {});
    };
    tryRegister();
    document.addEventListener('visibilitychange', tryRegister);
    window.addEventListener('pageshow', tryRegister);
    return () => {
      document.removeEventListener('visibilitychange', tryRegister);
      window.removeEventListener('pageshow', tryRegister);
    };
  }, []);
  return null;
}
