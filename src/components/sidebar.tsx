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
  '/admin/zakat',
  '/admin/zis',
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

export function levelOk(role: Role, lv: MenuLevel): boolean {
  if (role === 'admin') return true; // mirror canAccess: admin selalu lolos
  if (lv === 'ops') return role === 'manajer'; // mirror isManager
  if (lv === 'admin') return false; // mirror guard admin-only
  return FEATURE_MATRIX[lv].includes(role);
}

export const MENU_ITEMS: MenuDef[] = [
  { href: '/', label: 'Ringkasan', level: 'personal' },
  { href: '/admin/dashboard', label: 'Dashboard', level: 'laporan' },
  { href: '/pengurus/dashboard', label: 'Dashboard Global', level: 'laporan' },
  { href: '/kasir', label: 'Kasir', level: 'pos' },
  { href: '/laporan', label: 'Laporan & Rekap', level: 'laporan' },
  { href: '/admin/produk', label: 'Produk', roleLabel: { gudang: 'Produk & Stok (Opname)' }, level: 'stock' },
  { href: '/admin/belanja', label: 'Belanja', level: 'supplier' },
  { href: '/admin/konsinyasi', label: 'Konsinyasi', level: 'ops' },
  { href: '/admin/shift', label: 'Shift & Kasir', level: 'shift' },
  { href: '/retur', label: 'Retur', level: 'pos' },
  { href: '/admin/kas', label: 'Kas', level: 'ops' },
  { href: '/admin/qris', label: 'QRIS', level: 'ops' },
  { href: '/piutang', label: 'Poin & Piutang', level: 'piutang' },
  { href: '/admin/hutang', label: 'Hutang', roleLabel: { pembelian: 'Hutang Supplier' }, level: 'supplier' },
  { href: '/tutorial', label: 'Tutorial', level: 'personal' },
  { href: '/admin/zakat', label: 'Zakat', level: 'zakat' },
  // W2.7: modul ZIS (skema v22; tier zis = admin + manajer, D2).
  { href: '/admin/zis', label: 'ZIS', icon: IconZis, level: 'zis' },
  { href: '/admin/pengaturan-member', label: 'Keuntungan Member', level: 'admin' },
  { href: '/admin/member', label: 'Member', level: 'member' },
  { href: '/admin/laporan', label: 'Laporan Pengurus', level: 'laporan' },
  { href: '/admin/notifications', label: 'Notifikasi', level: 'admin' }, // H5: buka untuk pengurus (read-only)
  { href: '/admin/audit', label: 'Audit', level: 'audit' },
  { href: '/admin/rekonsiliasi', label: 'Rekonsiliasi', level: 'laporan' },
  // W1.4: GL (read-only, tier laporan) + Jurnal GL (tulis, tier admin).
  { href: '/admin/gl', label: 'GL', icon: IconGL, level: 'laporan' },
  { href: '/admin/jurnal', label: 'Jurnal GL', icon: IconJurnal, level: 'admin' },
  { href: '/admin/pengguna', label: 'Pengguna', level: 'admin' },
  { href: '/admin/data', label: 'Data & Backup', level: 'admin' },
  { href: '/admin/migrate', label: 'Import CSV', level: 'admin' },
];

/** 4 grup (Q1 27 Sep: Loyalty fold ke OPERASIONAL - 4 grup, bukan 5). */
const ADMIN_GROUP_DEFS: { title: string; hrefs: string[] }[] = [
  { title: 'Utama', hrefs: ['/', '/admin/dashboard', '/pengurus/dashboard', '/tutorial'] },
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
      '/admin/data',
      '/admin/migrate',
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
