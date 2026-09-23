'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import type { Role } from '@/lib/auth';
import { Avatar, ROLE_LABEL } from './ui';

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
  '/admin/zakat',
]);

type NavItem = { href: string; label: string };
type NavGroup = { title: string; items: NavItem[] };

const ADMIN_GROUPS: NavGroup[] = [
  {
    title: 'Utama',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard' },
      { href: '/pengurus/dashboard', label: 'Dashboard Global' },
      { href: '/', label: 'Ringkasan' },
      { href: '/kasir', label: 'Kasir' },
      { href: '/laporan', label: 'Laporan & Rekap' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/admin/produk', label: 'Produk' },
      { href: '/admin/belanja', label: 'Belanja' },
      { href: '/admin/konsinyasi', label: 'Konsinyasi' },
      { href: '/piutang', label: 'Piutang' },
      { href: '/admin/hutang', label: 'Hutang' },
      { href: '/retur', label: 'Retur' },
      { href: '/admin/kas', label: 'Kas' },
      { href: '/admin/shift', label: 'Shift & Kasir' },
      { href: '/admin/zakat', label: 'Zakat' },
    ],
  },
  {
    title: 'Loyalty',
    items: [
      { href: '/admin/pengaturan-member', label: 'Keuntungan Member' },
      { href: '/admin/member', label: 'Member' },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { href: '/admin/notifications', label: 'Notifikasi' },
      { href: '/admin/audit', label: 'Audit' },
      { href: '/admin/laporan', label: 'Laporan Pengurus' },
      { href: '/admin/pengguna', label: 'Pengguna' },
      { href: '/admin/data', label: 'Data & Backup' },
      { href: '/admin/migrate', label: 'Import CSV' },
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
  open,
  onClose,
  onToggleTheme,
  onLogout,
}: {
  name: string;
  role: Role;
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
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
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {ROLE_LABEL[role] ?? role.toUpperCase()}
            </p>
          </div>
          <button type="button"
            onClick={onClose}
            aria-label="Tutup menu"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-2 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                          'block rounded-lg px-3 py-2 text-sm font-bold transition ' +
                          (active
                            ? 'bg-accent-500 text-white shadow'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700')
                        }
                      >
                        {it.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        {/* Aksi panel (dipindah dari header): ganti tema + keluar.
            Ikon dinamis: dark → Sun (klik = ke light), light → Moon (klik = ke dark). */}
        <div className="mt-2 space-y-1 border-t border-slate-200 px-2 pb-2 pt-2 dark:border-navy-600">
          <button
            type="button"
            onClick={() => {
              onToggleTheme();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700"
          >
            <Sun className="hidden h-5 w-5 text-amber-400 dark:block" />
            <Moon className="h-5 w-5 text-slate-400 dark:hidden" />
            Ganti Tema
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              void onLogout();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-navy-700/60"
          >
            <LogOut className="h-5 w-5" />
            Keluar
          </button>
        </div>
      </aside>
    </>,
    document.body
  );
}

/**
 * Menu per role sesuai matriks permission (src/lib/auth.ts — FEATURE_MATRIX).
 * Guard API & halaman tetap berlaku; menu ini hanya display.
 */
function groupsFor(role: Role): NavGroup[] {
  if (role === 'admin') return ADMIN_GROUPS;
  if (role === 'manajer') {
    // Manajer = operasional + laporan + produk/member (tanpa menu Sistem).
    return ADMIN_GROUPS.filter((g) => g.title !== 'Sistem');
  }
  if (role === 'pengurus') {
    // Pengurus = pengawas: laporan + audit + zakat (read-only).
    return [
      {
        title: 'Laporan & Pengawasan',
        items: [
          { href: '/laporan', label: 'Laporan & Rekap' },
          { href: '/admin/laporan', label: 'Laporan Pengurus' },
          { href: '/pengurus/dashboard', label: 'Dashboard Global' },
          { href: '/admin/zakat', label: 'Zakat' },
          { href: '/admin/audit', label: 'Audit' },
        ],
      },
      { title: 'Utama', items: [{ href: '/', label: 'Ringkasan' }] },
    ];
  }
  if (role === 'kasir') {
    return [
      {
        title: 'Utama',
        items: [
          { href: '/', label: 'Ringkasan' },
          { href: '/kasir', label: 'Kasir' },
          { href: '/admin/shift', label: 'Shift & Kasir' },
          { href: '/piutang', label: 'Piutang' },
          { href: '/retur', label: 'Retur' },
        ],
      },
    ];
  }
  if (role === 'gudang') {
    return [
      {
        title: 'Gudang',
        items: [
          { href: '/', label: 'Ringkasan' },
          { href: '/admin/produk', label: 'Produk & Stok (Opname)' },
        ],
      },
    ];
  }
  if (role === 'pembelian') {
    return [
      {
        title: 'Pembelian',
        items: [
          { href: '/', label: 'Ringkasan' },
          { href: '/admin/belanja', label: 'Belanja' },
          { href: '/admin/hutang', label: 'Hutang Supplier' },
        ],
      },
    ];
  }
  // member (default): dashboard pribadi saja.
  return [{ title: 'Pribadi', items: [{ href: '/', label: 'Ringkasan' }] }];
}

/**
 * Uncontrolled wrapper: tombol trigger ikon menu + Sidebar (state owned here).
 * Place the button in the header; the drawer renders fixed over the page.
 */
export function HamburgerNav({
  name,
  role,
  onToggleTheme,
  onLogout,
}: {
  name: string;
  role: Role;
  onToggleTheme: () => void;
  onLogout: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu navigasi"
        aria-expanded={open}
        title="Menu"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-200 dark:hover:bg-navy-700"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Sidebar
        name={name}
        role={role}
        open={open}
        onClose={() => setOpen(false)}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
      />
    </>
  );
}
