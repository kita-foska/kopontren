'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import type { Feature, Role } from '@/lib/auth';
import { FEATURE_MATRIX, normRole } from '@/lib/features';
import { Avatar, Button, ROLE_LABEL } from './ui';
import type { ReactNode } from 'react';

// Prefetch selektif: menu utama + halaman admin yang paling sering dibuka.
// Halaman jarang (kontrakan, piutang, retur, audit, data, dsb.) tidak di-prefetch
// agar bandwidth & server tetap efisien.
const PREFETCH_PATHS = new Set([
  '/',
  '/kasir',
  '/laporan',
  '/admin/dashboard',
  '/pengurus/dashboard',
  '/admin/produk',
  '/admin/belanja',
  '/admin/kas',
  '/admin/member',
  '/admin/laporan',
  // P3d: pusat ekspor (unduh CSV + cetak formal).
  '/admin/ekspor',
  '/admin/zakat',
  '/admin/zis',
  '/admin/akad', // W3.3: modul akad syariah (OQ 2: simetris dgn zis)
  '/admin/koperasi', // W4.3: modul koperasi (simetris dgn akad/zis)
  '/tutorial',
]);

type NavItem = { href: string; label: string; icon?: ReactNode };
type NavGroup = { title: string; items: NavItem[] };

/**
 * UX-5 H1: SATU sumber menu (pengganti array role-specific lama).
 * `level` = visibilitas item - MIRROR guard halaman (sumber kebenaran
 * tetap FEATURE_MATRIX + guard; menu ini hanya display):
 *  - `Feature`  -> matriks akses (admin selalu lolos, = `canAccess`)
 *  - `'ops'`    -> isManager (guard Konsinyasi/Kas/QRIS = `isManager`)
 *  - `'admin'`  -> admin-only (guard pengaturan-member/notifications/
 *                  pengguna/data/migrate = `role === 'admin'`)
 * `roleLabel` = label khusus role (sisa kegunaan label per-role lama).
 */
type MenuLevel = Feature | 'ops' | 'admin';

interface MenuDef {
  href: string;
  label: string;
  level: MenuLevel;
  roleLabel?: Partial<Record<Role, string>>;
  /** W1.4: ikon opsional (inline SVG: viewBox, aria-hidden, currentColor, 16px). */
  icon?: ReactNode;
}

/**
 * W1.4: ikon inline SVG (tanpa emoji/unicode/ikon-font) utk item GL + Jurnal.
 * 16px, viewBox 24, stroke currentColor (mengikuti warna teks menu: putih
 * saat item aktif, slate selainnya).
 */
const IconGL = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const IconJurnal = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

// W2.7: ikon modul ZIS (uang: kotak + lingkaran -- inline SVG, 16px,
// stroke currentColor; tanpa emoji/unicode/ikon-font).
const IconZis = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

// W3.3: ikon modul akad (perjanjian: dokumen + centang -- inline SVG, 16px,
// stroke currentColor; tanpa emoji/unicode/ikon-font).
const IconAkad = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m9 15 2 2 4-4" />
  </svg>
);

// W4.3: ikon modul koperasi (tumpukan koin/simpanan -- inline SVG, 16px,
// stroke currentColor; tanpa emoji/unicode/ikon-font).
const IconKoperasi = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 11v8c0 1.7 3.6 3 8 3s8-1.3 8-3v-8" />
  </svg>
);

// UX-1: ikon Glosarium (buku terbuka -- inline SVG 16px, stroke
// currentColor; tanpa emoji/unicode/ikon-font).
const IconGlosarium = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
    <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
  </svg>
);

/**
 * Plan A (8 Okt, ruling Gus Fi via DeepSeek, Q1=A / Q2=C): SEMUA item nav
 * dapat ikon inline SVG -- 25 baru (di bawah) + 6 lama = 31/31.
 * System LOCK: render 16px (width/height "16"), viewBox 24, stroke-2,
 * currentColor, aria-hidden="true"; tanpa emoji/unicode/ikon-font;
 * geometry gaya Lucide (baca jelas di 16px). No sub-menu (Q2=C):
 * group + render TIDAK berubah.
 */
const IconGauge = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 19a9 9 0 1 1 14 0" />
    <path d="M12 13l3.5-3.5" />
    <circle cx="12" cy="13" r="1.5" />
  </svg>
);
const IconChart = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 20v-5" />
    <path d="M12 20V7" />
    <path d="M19 20v-8" />
  </svg>
);
const IconGlobe = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14.5 14.5 0 0 1 0 18a14.5 14.5 0 0 1 0-18" />
  </svg>
);
const IconCart = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M2 3h3l2.5 12.5h11l2-8.5H6.6" />
  </svg>
);
const IconFileChart = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 2h9l5 5v15H6z" />
    <path d="M15 2v5h5" />
    <path d="M9.5 17v-3.5" />
    <path d="M14.5 17v-6" />
  </svg>
);
const IconBox = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3.3 7L12 12l8.7-5L12 2 3.3 7z" />
    <path d="M3.3 7v10L12 22V12" />
    <path d="M20.7 7v10L12 22" />
  </svg>
);
const IconBag = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5.5 8h13l-1.3 13H6.8z" />
    <path d="M8.5 8a3.5 3.5 0 0 1 7 0" />
  </svg>
);
const IconSwap = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7.5 4.5L3 9l4.5 4.5" />
    <path d="M3 9h18" />
    <path d="M16.5 19.5L21 15l-4.5-4.5" />
    <path d="M21 15H3" />
  </svg>
);
const IconClock = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);
const IconUndo = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8.5 4.5L3.5 9.5l5 5" />
    <path d="M3.5 9.5H15a6 6 0 0 1 0 12h-3" />
  </svg>
);
const IconWallet = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H4" />
    <path d="M17.5 13.5h3" />
  </svg>
);
const IconQr = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <path d="M14 14h3v3h-3z" />
    <path d="M21 14v7h-4" />
  </svg>
);
const IconStar = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 2.5l2.85 5.85 6.45 0.95-4.7 4.55 1.1 6.4L12 17.15l-5.7 3.05 1.1-6.4L2.7 9.3l6.45-0.95z" />
  </svg>
);
const IconHandCoins = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="17.5" cy="6.5" r="2.5" />
    <circle cx="10.5" cy="9" r="2.5" />
    <path d="M3.5 21h12.5l2.5-2.5c1.2-1.2 1.2-3.3 0-4.5l-2-2" />
    <path d="M3.5 14l4.5 4.5" />
  </svg>
);
const IconCap = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3.5L2 8.5l10 5 10-5z" />
    <path d="M6.5 11v5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-5" />
    <path d="M22 8.5v5.5" />
  </svg>
);
const IconGift = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="8" width="18" height="4" />
    <path d="M5 12v8.5h14V12" />
    <path d="M12 8v12.5" />
    <path d="M12 8a3 3 0 1 1 0-6 3 3 0 1 1 0 6" />
  </svg>
);
const IconPercent = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 5L5 19" />
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="17" r="2.5" />
  </svg>
);
const IconUsers = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4" />
    <path d="M17.5 14.4A6.5 6.5 0 0 1 21.5 20" />
  </svg>
);
const IconClipboard = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <rect x="9" y="2.5" width="6" height="3" />
    <path d="M9 11h6" />
    <path d="M9 15h6" />
  </svg>
);
const IconBell = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 9a6 6 0 1 1 12 0c0 5 2 7 2 7H4s2-2 2-7" />
    <path d="M10 19.5a2 2 0 0 0 4 0" />
  </svg>
);
const IconShield = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 2.5l7.5 3v6c0 5-3.2 8.4-7.5 10-4.3-1.6-7.5-5-7.5-10v-6z" />
    <path d="M8.8 12l2.2 2.2 4.2-4.2" />
  </svg>
);
const IconScale = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3.5v17" />
    <path d="M8.5 20.5h7" />
    <path d="M5 6.5h14" />
    <path d="M5 6.5L2.5 12.5h5z" />
    <path d="M19 6.5l-2.5 6h5z" />
  </svg>
);
const IconUserCog = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 21a6.5 6.5 0 0 1 13 0" />
    <circle cx="18.5" cy="18" r="2.5" />
    <path d="M22.5 18h-2" />
    <path d="M18.5 22v-2" />
  </svg>
);
const IconDatabase = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
  </svg>
);
// P2/Q62: ikon alur persetujuan (clip + centang -- inline SVG, 16px,
// stroke currentColor; tanpa emoji/unicode/ikon-font).
const IconApprovals = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <rect x="9" y="2.5" width="6" height="3" />
    <path d="m9 13.5 2 2 4-4" />
  </svg>
);
const IconUpload = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 15V3.5" />
    <path d="M7.5 8L12 3.5 16.5 8" />
    <path d="M4.5 15v5.5h15V15" />
  </svg>
);

// P3d -- pusat ekspor: kotak + panah keluar (unduh/export data).
const IconExport = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 3h5v5" />
    <path d="M10 14L21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

export function levelOk(role: Role, lv: MenuLevel): boolean {
  if (role === 'admin') return true; // mirror canAccess: admin selalu lolos
  if (lv === 'ops') return role === 'manajer'; // mirror isManager
  if (lv === 'admin') return false; // mirror guard admin-only
  return FEATURE_MATRIX[lv].includes(role);
}

export const MENU_ITEMS: MenuDef[] = [
  { href: '/', label: 'Ringkasan', icon: IconGauge, level: 'personal' },
  { href: '/admin/dashboard', label: 'Dashboard', icon: IconChart, level: 'laporan' },
  { href: '/pengurus/dashboard', label: 'Dashboard Global', icon: IconGlobe, level: 'laporan' },
  { href: '/kasir', label: 'Kasir', icon: IconCart, level: 'pos' },
  { href: '/laporan', label: 'Laporan & Rekap', icon: IconFileChart, level: 'laporan' },
  { href: '/admin/produk', label: 'Produk', icon: IconBox, roleLabel: { gudang: 'Produk & Stok (Opname)' }, level: 'stock' },
  { href: '/admin/belanja', label: 'Belanja', icon: IconBag, level: 'supplier' },
  { href: '/admin/konsinyasi', label: 'Konsinyasi', icon: IconSwap, level: 'ops' },
  { href: '/admin/shift', label: 'Shift & Kasir', icon: IconClock, level: 'shift' },
  { href: '/retur', label: 'Retur', icon: IconUndo, level: 'pos' },
  { href: '/admin/kas', label: 'Kas', icon: IconWallet, level: 'ops' },
  { href: '/admin/qris', label: 'QRIS', icon: IconQr, level: 'ops' },
  { href: '/piutang', label: 'Poin & Piutang', icon: IconStar, level: 'piutang' },
  { href: '/admin/hutang', label: 'Hutang', icon: IconHandCoins, roleLabel: { pembelian: 'Hutang Supplier' }, level: 'supplier' },
  { href: '/tutorial', label: 'Tutorial', icon: IconCap, level: 'personal' },
  // UX-1: Glosarium (E37/E39) -- daftar istilah bahasa awam, semua role.
  { href: '/admin/glosarium', label: 'Glosarium', icon: IconGlosarium, level: 'personal' },
  { href: '/admin/zakat', label: 'Zakat', icon: IconGift, level: 'zakat' },
  // W2.7: modul ZIS (skema v22; tier zis = admin + manajer, D2).
  { href: '/admin/zis', label: 'ZIS', icon: IconZis, level: 'zis' },
  // W3.3: modul akad syariah (skema v23; tulis = tier akad admin/manajer;
  // pengurus = read-only via tier laporan, Q3/OQ4 -- pola zis item 7).
  { href: '/admin/akad', label: 'Akad', icon: IconAkad, level: 'laporan' },
  // W4.3: modul koperasi (skema v24, Sek.7.1/7.3; tulis = tier koperasi
  // admin/manajer; pengurus = read-only via tier laporan -- pola Q3 akad).
  { href: '/admin/koperasi', label: 'Koperasi', icon: IconKoperasi, level: 'laporan' },
  { href: '/admin/pengaturan-member', label: 'Keuntungan Member', icon: IconPercent, level: 'admin' },
  { href: '/admin/member', label: 'Member', icon: IconUsers, level: 'member' },
  { href: '/admin/laporan', label: 'Laporan Pengurus', icon: IconClipboard, level: 'laporan' },
  { href: '/admin/notifications', label: 'Notifikasi', icon: IconBell, level: 'admin' }, // H5: buka untuk pengurus (read-only)
  { href: '/admin/audit', label: 'Audit', icon: IconShield, level: 'audit' },
  { href: '/admin/rekonsiliasi', label: 'Rekonsiliasi', icon: IconScale, level: 'laporan' },
  // W1.4: GL (read-only, tier laporan) + Jurnal GL (tulis, tier admin).
  { href: '/admin/gl', label: 'GL', icon: IconGL, level: 'laporan' },
  { href: '/admin/jurnal', label: 'Jurnal GL', icon: IconJurnal, level: 'admin' },
  { href: '/admin/pengguna', label: 'Pengguna', icon: IconUserCog, level: 'admin' },
  // P2/Q62: alur persetujuan (antrean 5 aksi besar; tier admin, matriks).
  { href: '/admin/persetujuan', label: 'Persetujuan', icon: IconApprovals, level: 'approvals' },
  { href: '/admin/data', label: 'Data & Backup', icon: IconDatabase, level: 'admin' },
  { href: '/admin/migrate', label: 'Import CSV', icon: IconUpload, level: 'admin' },
  // P3d: pusat ekspor admin (unduh CSV + cetak formal; level 'admin').
  { href: '/admin/ekspor', label: 'Ekspor', icon: IconExport, level: 'admin' },
];

/** 4 grup (Q1 27 Sep: Loyalty fold ke OPERASIONAL - 4 grup, bukan 5). */
const ADMIN_GROUP_DEFS: { title: string; hrefs: string[] }[] = [
  { title: 'Utama', hrefs: ['/', '/admin/dashboard', '/pengurus/dashboard', '/tutorial', '/admin/glosarium'] },
  {
    title: 'Operasional',
    hrefs: [
      '/kasir',
      '/admin/produk',
      '/admin/belanja',
      '/admin/konsinyasi',
      '/admin/shift',
      '/retur',
      '/admin/member',
      '/admin/pengaturan-member',
    ],
  },
  {
    title: 'Keuangan',
    hrefs: [
      '/admin/kas',
      '/admin/qris',
      '/piutang',
      '/admin/hutang',
      '/admin/zakat',
      '/admin/zis',
      '/admin/akad', // W3.3: modul akad syariah (skema v23; pengurus = read-only, Q3)
      '/admin/koperasi', // W4.3: modul koperasi (skema v24; pengurus = read-only, pola Q3)
      '/laporan',
    ],
  },
  {
    title: 'Sistem',
    hrefs: [
      '/admin/laporan',
      '/admin/notifications',
      '/admin/audit',
      '/admin/rekonsiliasi',
      '/admin/gl',
      '/admin/jurnal',
      '/admin/pengguna',
      '/admin/persetujuan', // P2/Q62: alur persetujuan (tier admin)
      '/admin/data',
      '/admin/migrate',
      // P3d: pusat ekspor (unduh CSV + cetak formal).
      '/admin/ekspor',
    ],
  },
];

/**
 * Slide-in drawer (from the left) with grouped nav menus.
 * - Dark overlay behind; panel closes on overlay click, Escape, or menu click.
 * - Active page highlighted with accent background.
 */
export function Sidebar({
  name,
  role,
  roles,
  open,
  onClose,
  onToggleTheme,
  onLogout,
  onSwitchRole,
}: {
  name: string;
  role: Role;
  /** M1-4: semua role user (dropdown switcher tampil bila >1). */
  roles?: Role[];
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  /** M1-4: dipanggil saat user memilih peran di drawer (mobile). */
  onSwitchRole?: (r: Role) => void | Promise<void>;
}) {
  const pathname = usePathname();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const groups = groupsFor(role);

  function isActive(href: string) {
    return href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(href + '/');
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {/* Dark overlay */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={
          'fixed inset-0 z-40 bg-navy-900/60 transition-opacity duration-300 ' +
          (open ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
      />
      {/* Drawer panel (slide-in from left) */}
      <aside
        role="dialog"
        aria-label="Menu navigasi"
        className={
          'fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 ease-in-out md:w-[260px] dark:border-navy-700 dark:bg-navy-900 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        {/* Kartu profil user (profil kepala): avatar + nama + role menggantikan judul polos "Menu". */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-navy-700">
          <Avatar name={name} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
              {name}
            </p>
            <p className="text-1xs font-semibold text-slate-500 dark:text-slate-400">
              {ROLE_LABEL[role] ?? role.toUpperCase()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X className="h-4 w-4" />}
            aria-label="Tutup menu"
            className="shrink-0"
            onClick={onClose}
          />
        </div>
        {/* M1-4: switcher peran (versi hamburger) - tampil hanya bila user punya
            >1 role; pilih -> onSwitchRole + drawer ditutup. */}
        {roles && roles.length > 1 && onSwitchRole && (
          <div className="shrink-0 border-b border-slate-200 px-3 pb-2 dark:border-navy-700">
            <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Ganti peran
            </p>
            <ul className="space-y-0.5">
              {roles.map((r) => (
                <li key={r}>
                  <button
                    type="button"
                    onClick={() => {
                      void onSwitchRole(r);
                      onClose();
                    }}
                    className={
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ' +
                      (r === role
                        ? 'bg-accent-500 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700')
                    }
                  >
                    <span>{ROLE_LABEL[r] ?? r.toUpperCase()}</span>
                    {r === role && <span className="text-[10px] font-bold">aktif</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-2 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {g.title}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((it) => {
                  const active = isActive(it.href);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        prefetch={PREFETCH_PATHS.has(it.href)}
                        onClick={onClose}
                        className={
                          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold transition ' +
                          (active
                            ? 'bg-accent-500 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700')
                        }
                      >
                        {it.icon && (
                          <span aria-hidden="true" className="shrink-0">
                            {it.icon}
                          </span>
                        )}
                        <span>{it.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        {/* Aksi panel (dipindah dari header): ganti tema + keluar.
            Ikon dinamis: dark -> Sun (klik = ke light), light -> Moon (klik = ke dark). */}
        <div className="mt-2 space-y-1 border-t border-slate-200 px-2 pb-2 pt-2 dark:border-navy-600">
          <Button
            variant="ghost"
            full
            icon={
              <>
                <Sun className="hidden h-5 w-5 text-amber-400 dark:block" />
                <Moon className="h-5 w-5 text-slate-500 dark:hidden" />
              </>
            }
            className="justify-start gap-3"
            onClick={() => {
              onToggleTheme();
              onClose();
            }}
          >
            Ganti Tema
          </Button>
          <Button
            variant="ghost"
            full
            icon={<LogOut className="h-5 w-5" />}
            className="justify-start gap-3 text-rose-600 dark:text-rose-400"
            onClick={() => {
              onClose();
              void onLogout();
            }}
          >
            Keluar
          </Button>
        </div>
      </aside>
    </>,
    document.body
  );
}

/**
 * Menu per role sesuai matriks permission (src/lib/auth.ts - FEATURE_MATRIX).
 * Guard API & halaman tetap berlaku; menu ini hanya display.
 */
function groupsFor(role: Role): NavGroup[] {
  const r = normRole(role); // 'owner' -> 'admin' (sama dgn guard halaman)
  const byHref = new Map(MENU_ITEMS.map((m) => [m.href, m]));
  const groups: NavGroup[] = ADMIN_GROUP_DEFS.map((g) => ({
    title: g.title,
    items: g.hrefs
      .map((href) => byHref.get(href))
      .filter((m): m is MenuDef => Boolean(m) && levelOk(r, m!.level))
      .map((m) => ({
        href: m.href,
        label: m.roleLabel?.[r] ?? m.label,
        icon: m.icon,
      })),
  })).filter((g) => g.items.length > 0);
  // member: dashboard pribadi saja (label grp "Pribadi", perilaku lama).
  // UX-5 H3: + item "Kartu Saya" -> /member (dashboard pribadi read-only, fix I-4).
  if (r === 'member')
    return [
      {
        title: 'Pribadi',
        items: [
          { href: '/', label: 'Ringkasan' },
          { href: '/member', label: 'Kartu Saya' },
          { href: '/tutorial', label: 'Tutorial' }, // T2: level personal = semua role
          { href: '/admin/glosarium', label: 'Glosarium' }, // UX-1: semua role
        ],
      },
    ];
  return groups;
}

/**
 * Uncontrolled wrapper: tombol trigger ikon menu + Sidebar (state owned here).
 * Place the button in the header; the drawer renders fixed over the page.
 */
export function HamburgerNav({
  name,
  role,
  roles,
  onToggleTheme,
  onLogout,
  onSwitchRole,
}: {
  name: string;
  role: Role;
  roles?: Role[];
  onToggleTheme: () => void;
  onLogout: () => void | Promise<void>;
  onSwitchRole?: (r: Role) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon={<Menu className="h-5 w-5" />}
        aria-label="Buka menu navigasi"
        aria-expanded={open}
        title="Menu"
        className="shrink-0"
        onClick={() => setOpen(true)}
      />
      <Sidebar
        name={name}
        role={role}
        roles={roles}
        open={open}
        onClose={() => setOpen(false)}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        onSwitchRole={onSwitchRole}
      />
    </>
  );
}
