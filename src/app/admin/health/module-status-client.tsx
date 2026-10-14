'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  freshnessOf,
  lastOnlineLabel,
  readLastFetch,
  readLastOnline,
  readPendingCount,
  syncOf,
} from '@/lib/offline-status';

/**
 * P14 (Offline Confidence): panel "Status Data per Modul" di /admin/health.
 * Baca stempel fetch terakhir per modul dari localStorage sisi klien
 * (kop:lastfetch:<module>) + stempel "terakhir online" (kop:lastonline);
 * label DISUSUN dari confidence.ts (sumber tunggal P15-A). Komponen client
 * (useEffect baca localStorage), co-located di route health sesuai plan.
 *
 * P15-B: kolom Sinkron = antrean offline DI PERANGKAT, nyata utk modul
 * kas (readPendingCount, key POS_QUEUE_KEY -- transaksi POS belum
 * tersinkron; tone amber bila > 0); modul lain online-only (tanpa
 * antrean lokal), jadi 0 antre = "Tersinkron" (komunikatif, bukan
 * asersi database). Stempel freshness ditulisi fiturnya (P15-B:
 * kas/member/produk/koperasi/zakat, bukan instrumentasi page-load);
 * modul tak tertempel menampilkan "Belum ada catatan akses" (jujur,
 * tak pura-pura segar).
 */

/** Modul data inti + drill-down ke halaman admin-nya. */
const MODULES: { key: string; label: string; href: string }[] = [
  { key: 'kas', label: 'Kas & Pembukuan', href: '/admin/kas' },
  { key: 'belanja', label: 'Belanja & Pengeluaran', href: '/admin/belanja' },
  { key: 'hutang', label: 'Hutang Supplier', href: '/admin/hutang' },
  { key: 'konsinyasi', label: 'Konsinyasi', href: '/admin/konsinyasi' },
  { key: 'member', label: 'Anggota', href: '/admin/member' },
  { key: 'produk', label: 'Produk & Stok', href: '/admin/produk' },
  { key: 'koperasi', label: 'Koperasi & Akad', href: '/admin/koperasi' },
  { key: 'zakat', label: 'Zakat & ZIS', href: '/admin/zakat' },
  { key: 'qris', label: 'QRIS', href: '/admin/qris' },
  { key: 'laporan', label: 'Laporan & Rekap', href: '/admin/laporan' },
];

type Row = { key: string; label: string; href: string; iso: string | null; pending: number };

export function ModuleStatusPanel({
  cacheKeys,
  nowIso,
}: {
  cacheKeys: number;
  nowIso: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    MODULES.map((m) => ({ key: m.key, label: m.label, href: m.href, iso: null, pending: 0 }))
  );
  const [lastOnlineIso, setLastOnlineIso] = useState<string | null>(null);

  useEffect(() => {
    const store = globalThis.localStorage ?? null;
    // P15-B: modul kas = satu-satunya modul dengan antrean offline di
    // perangkat (transaksi POS, P13.1); baris lain jujur 0 (online-only).
    const kasPending = readPendingCount(store);
    setRows(
      MODULES.map((m) => ({
        key: m.key,
        label: m.label,
        href: m.href,
        iso: readLastFetch(m.key, store),
        pending: m.key === 'kas' ? kasPending : 0,
      }))
    );
    setLastOnlineIso(readLastOnline(store));
  }, []);

  return (
    <section className="card mt-4 border-slate-200/80 p-4 dark:border-navy-700">
      <h2 className="mb-1 text-sm font-extrabold tracking-tight">Status Data per Modul</h2>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Waktu terakhir data modul ini disentuh perangkat (localStorage sisi klien). Kolom
        Sinkron = antrean offline di perangkat: modul Kas menghitung transaksi POS yang
        belum tersinkron; modul lain online-only (tanpa antrean lokal), jadi 0 antre =
        "Tersinkron" (komunikatif, bukan asersi database). Klik "Lihat" untuk membuka modulnya.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <th className="card-label py-1.5 pr-3 font-bold uppercase tracking-wider text-slate-400">
                Modul
              </th>
              <th className="card-label py-1.5 pr-3 font-bold uppercase tracking-wider text-slate-400">
                Terakhir Diperbarui
              </th>
              <th className="card-label py-1.5 pr-3 font-bold uppercase tracking-wider text-slate-400">
                Sinkron
              </th>
              <th className="card-label py-1.5 text-right font-bold uppercase tracking-wider text-slate-400">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-b border-slate-100 last:border-0 dark:border-navy-800"
              >
                <td className="py-2 pr-3 font-semibold text-slate-700 dark:text-slate-200">
                  {r.label}
                </td>
                <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                  {freshnessOf(r.iso, nowIso)}
                </td>
                <td
                  className={
                    r.pending > 0
                      ? 'py-2 pr-3 font-semibold text-amber-600 dark:text-amber-400'
                      : 'py-2 pr-3 text-slate-500 dark:text-slate-400'
                  }
                >
                  {syncOf(r.pending)}
                </td>
                <td className="py-2 text-right">
                  <Link
                    href={r.href}
                    className="font-semibold text-accent-600 dark:text-accent-300"
                  >
                    Lihat
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-navy-700 dark:text-slate-400">
        <span>
          Terakhir online:{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {lastOnlineLabel(lastOnlineIso, nowIso)}
          </span>
        </span>
        <span>
          Referensi ter-cache (per-instance, TTL 60 dtk):{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {String(cacheKeys)}
          </span>
        </span>
      </div>
    </section>
  );
}
