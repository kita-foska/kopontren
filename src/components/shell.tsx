import Image from 'next/image';
import type { AppUser } from '@/lib/auth';
import { HamburgerNav } from './sidebar';
import { ThemeToggle } from './themetoggle';
import { LogoutButton } from './logout';

/**
 * 3-level access (sidebar groups per role):
 *  - admin    : all groups — Utama, Admin, Loyalty, Sistem.
 *  - pengurus : read-only rekap -> Ringkasan, Laporan & Rekap,
 *               + Laporan Pengurus.
 *  - kasir    : Ringkasan, Kasir (POS), Laporan & Rekap.
 *
 * Nav is a left slide-in drawer (hamburger in header) so the header
 * never needs horizontal scrolling, including on narrow phones.
 */
export function Shell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-navy-700 dark:bg-navy-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <HamburgerNav role={user.role} />
            <a href="/" className="flex min-w-0 items-center gap-2.5">
              <Image
                src="/logo-kopontren.png"
                alt=""
                width={23}
                height={36}
                priority
                className="h-9 w-auto shrink-0"
              />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-extrabold tracking-tight">Kopontren Al Ittihad</p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  Kasir & Pembukuan
                </p>
              </div>
            </a>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
