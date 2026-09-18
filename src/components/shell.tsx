import type { AppUser, Role } from '@/lib/auth';
import Image from 'next/image';
import { NavPills } from './navpills';
import { ThemeToggle } from './themetoggle';
import { LogoutButton } from './logout';

function itemsFor(role: Role) {
  const base = [
    { href: '/', label: 'Ringkasan' },
    { href: '/kasir', label: 'Kasir' },
    { href: '/laporan', label: 'Laporan & Rekap' },
  ];
  if (role === 'admin' || role === 'pengurus') {
    base.push(
      { href: '/admin/produk', label: 'Produk' },
      { href: '/admin/belanja', label: 'Belanja' },
      { href: '/admin/konsinyasi', label: 'Konsinyasi' },
      { href: '/admin/kas', label: 'Kas' },
      { href: '/admin/member', label: 'Member' },
      { href: '/admin/laporan', label: 'Laporan Pengurus' }
    );
  }
  if (role === 'admin') {
    base.push(
      { href: '/admin/pengguna', label: 'Pengguna' },
      { href: '/admin/data', label: 'Data & Backup' },
      { href: '/admin/migrate', label: 'Import CSV' }
    );
  }
  return base;
}

export function Shell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-navy-700 dark:bg-navy-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-kopontren.svg"
              alt="Kopontren"
              width={36}
              height={36}
              className="h-9 w-auto"
            />
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight">Kopontren Al Ittihad</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Kasir & Pembukuan
              </p>
            </div>
          </a>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 sm:flex dark:border-navy-600 dark:text-slate-300">
              {user.display_name || user.username}
              <span
                className={
                  user.role === 'kasir'
                    ? 'rounded bg-slate-400 px-1.5 py-px text-[10px] font-bold text-white'
                    : 'rounded bg-accent-500 px-1.5 py-px text-[10px] font-bold text-white'
                }
              >
                {user.role.toUpperCase()}
              </span>
            </span>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2">
          <NavPills items={itemsFor(user.role)} />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
