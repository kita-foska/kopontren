'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  HandCoins,
  Home,
  LayoutDashboard,
  Package,
  Percent,
  ScrollText,
  ShoppingCart,
  ShoppingBag,
  Timer,
  Undo2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/auth';

type BottomItem = { href: string; label: string; Icon: LucideIcon };

/**
 * Bottom nav (mobile, <lg) — maks 5 item per peran.
 * Item dikurasi mengikuti matriks permission (groupsFor, src/components/sidebar.tsx):
 * semua href di sini legal untuk peran masing-masing.
 * Halaman /kasir TIDAK memakai bottom nav (POS punya sticky bottom bar sendiri)
 * — pengecekan dilakukan di Shell, tidak di sini.
 */
const MANAJER_ITEMS: BottomItem[] = [
  { href: '/', label: 'Ringkasan', Icon: Home },
  { href: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/kasir', label: 'Kasir', Icon: ShoppingCart },
  { href: '/laporan', label: 'Laporan', Icon: BarChart3 },
  { href: '/admin/kas', label: 'Kas', Icon: Wallet },
];

const NAV: Record<Role, BottomItem[]> = {
  admin: MANAJER_ITEMS,
  manajer: MANAJER_ITEMS,
  pengurus: [
    { href: '/', label: 'Ringkasan', Icon: Home },
    { href: '/laporan', label: 'Laporan', Icon: BarChart3 },
    { href: '/admin/laporan', label: 'Lpn. Pengurus', Icon: FileText },
    { href: '/admin/zakat', label: 'Zakat', Icon: Percent },
    { href: '/admin/audit', label: 'Audit', Icon: ScrollText },
  ],
  kasir: [
    { href: '/', label: 'Ringkasan', Icon: Home },
    { href: '/kasir', label: 'Kasir', Icon: ShoppingCart },
    { href: '/admin/shift', label: 'Shift', Icon: Timer },
    { href: '/piutang', label: 'Piutang', Icon: HandCoins },
    { href: '/retur', label: 'Retur', Icon: Undo2 },
  ],
  gudang: [
    { href: '/', label: 'Ringkasan', Icon: Home },
    { href: '/admin/produk', label: 'Produk', Icon: Package },
  ],
  pembelian: [
    { href: '/', label: 'Ringkasan', Icon: Home },
    { href: '/admin/belanja', label: 'Belanja', Icon: ShoppingBag },
    { href: '/admin/hutang', label: 'Hutang', Icon: ArrowLeftRight },
  ],
  member: [{ href: '/', label: 'Ringkasan', Icon: Home }],
};

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV[role] ?? NAV.member;
  return (
    <nav
      aria-label="Navigasi bawah"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-navy-700 dark:bg-navy-900/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-around">
        {items.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                'flex min-w-16 flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-bold transition-colors ' +
                (active
                  ? 'text-accent-600 dark:text-accent-300'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200')
              }
            >
              <Icon className="h-5 w-5" />
              <span className="leading-none">{label}</span>
              <span
                aria-hidden="true"
                className={
                  'mt-0.5 h-0.5 w-8 rounded-full ' +
                  (active ? 'bg-accent-500' : 'bg-transparent')
                }
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}