'use client';

import { useEffect } from 'react';

export function SwRegister() {
  useEffect(() => {
    const secure =
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    if ('serviceWorker' in navigator && secure) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Paksa cek update setiap load (Chrome throttle default 1 jam).
          // sw.js di-stamp SW-BUILD tiap build → konten berubah → SW lama
          // (yang bisa menyajikan page/API basi & menyebabkan "0 request")
          // langsung digantikan: install + skipWaiting + clientsClaim.
          reg.update().catch(() => {});
        })
        .catch(() => {});
    }
  }, []);
  return null;
}
