'use client';

import { useEffect, useRef, useState } from 'react';
import { lowStockLabel } from '@/lib/low-stock';

/**
 * COUNTER (POST-W5, 2026-10-13): badge "N produk stok menipis"
 * (pill amber) di header global -- item paling kiri grup kanan,
 * sebelum pemicu palette (D2). Target /admin/produk (D3); tier
 * gating 'stock' (D4: admin/manajer/gudang) -- kasir TIDAK lihat
 * (stok bukan wewenang POS).
 *
 * Visual (D5): pill rounded-full, satu tone amber + varian dark
 * (konsisten strip offline & alert notifikasi -- amber = peringatan).
 * Ikon = inline SVG triangle-alert 14px aria-hidden (tanpa emoji/
 * unicode). Target sentuh >= 44px (min-h-[44px] px-3).
 *
 * Teks responsif: md+ "N produk stok menipis"; mobile "N" (header
 * sempit). Teks lebar tetap jadi aria-label/title (a11y utuh).
 *
 * Data: GET /api/low-stock-count. Load di mount; fokus jendela
 * re-fetch hanya bila >60 detik sejak sukses terakhir; offline
 * lewati (badge = indikator, bukan fitur kritis). Loading /
 * gagal / tak berwenang = render null (TIDAK ada spinner di
 * header -- tidak ada perubahan tata letak). Gating tier 'stock'
 * milik shell (parent) -- komponen ini hanya menampilkan angka.
 *
 * Hermetis utk uji unit (scripts/test-low-stock-count.ts): label
 * & definisi diisolasi ke modul pure src/lib/low-stock.ts.
 */

/** Jarak re-fetch saat fokus (ms): >60 dtk sejak sukses terakhir. */
const REFRESH_MS = 60_000;

export function LowStockBadge() {
  const [count, setCount] = useState<number | null>(null);
  const lastOk = useRef(0);

  useEffect(() => {
    let stopped = false;
    const fetchCount = async () => {
      // Offline: lewati (tidak ada titik data).
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const res = await fetch('/api/low-stock-count', { cache: 'no-store' });
        if (!res.ok) {
          // 401/403/5xx: badge disembunyikan (bukan error page).
          if (!stopped) setCount(null);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { count?: unknown } | null;
        if (stopped) return;
        const n = body && typeof body.count === 'number' ? body.count : null;
        setCount(n);
        lastOk.current = Date.now();
      } catch {
        if (!stopped) setCount(null);
      }
    };
    void fetchCount();
    const onFocus = () => {
      if (Date.now() - lastOk.current > REFRESH_MS) void fetchCount();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Loading / gagal / count 0 / tak berwenang -> tidak ada badge.
  if (count === null || count === 0) return null;
  const label = lowStockLabel(count, true);

  return (
    <a
      href="/admin/produk"
      title={label}
      aria-label={label}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
    >
      {/* Ikon peringatan: triangle-alert 14px, inline SVG (tanpa emoji). */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
      {/* Teks lebar (md+) / teks pendek (mobile) -- satu dan sama. */}
      <span className="hidden md:inline">{label}</span>
      <span className="md:hidden">{count}</span>
    </a>
  );
}
