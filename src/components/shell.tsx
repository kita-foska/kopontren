'use client';

import type { AppUser } from '@/lib/auth';
import { useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { HamburgerNav } from './sidebar';
import { BottomNav } from './bottom-nav';
import { SessionWatcher } from './session-watcher';
import { NotificationBell } from './notification-bell';
import { Avatar, ROLE_LABEL } from './ui';
import { Breadcrumb } from './breadcrumb';
import { fetchTimeout } from '@/lib/fetch-util';
import { useHotkeys } from '@/lib/useHotkeys';
import { CommandPalette } from '@/components/command-palette';

export function Shell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Bottom nav (mobile) tampil di semua halaman Shell kecuali /kasir —
  // POS punya sticky bottom bar sendiri (jangan sampai jadi dua bar).
  const showBottomNav = pathname !== '/kasir';
  // UX-5 H4: breadcrumb visual mung rute nested /admin/* /pengurus/*.
  const showBreadcrumb =
    pathname.startsWith('/admin/') || pathname.startsWith('/pengurus/');

  // UX-7B: Command Palette global — Ctrl/Cmd+K toggle, Escape tutup.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useHotkeys(
    {
      'ctrl+k': () => setPaletteOpen((v) => !v),
      escape: () => setPaletteOpen(false),
    },
    false
  );

  // Ganti tema: sinkron state class 'dark' + cookie (logika sama persis
  // dengan ThemeToggle lama agar preferensi tema tidak hilang).
  function toggleTheme() {
    const el = document.documentElement;
    const next = el.classList.contains('dark') ? 'light' : 'dark';
    el.classList.toggle('dark', next === 'dark');
    document.cookie = 'theme=' + next + '; path=/; max-age=31536000; samesite=lax';
  }

  // Logout: invalidasi sesi di server, lalu lempar ke /login.
  async function handleLogout() {
    // Timeout 10 dtk + catch: invalidasi sesi best-effort — tetap redirect
    // ke /login walau gagal (sesi server berakhir lewat idle/cookie expiry).
    try {
      await fetchTimeout('/api/auth/logout', { method: 'POST' });
    } catch {
      /* abaikan */
    }
    router.push('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-navy-700 dark:bg-navy-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <HamburgerNav
              name={user.display_name || user.username}
              role={user.role}
              onToggleTheme={toggleTheme}
              onLogout={handleLogout}
            />
            <a href="/" className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm ring-1 ring-black/5">
                <Image
                  src="/logo-kopontren.svg"
                  alt="Kopontren AL ITTIHAD"
                  width={36}
                  height={36}
                  className="h-full w-full object-contain"
                />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-extrabold tracking-tight">
                  Kopontren AL ITTIHAD
                </p>
                <p className="truncate text-1xs text-slate-500 dark:text-slate-400">
                  Kasir &amp; Pembukuan
                </p>
              </div>
            </a>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {/* UX-7B: pemicu Command Palette (discovery; Ctrl+K tetap jalan). */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Buka komando & pencarian (Ctrl K)"
              title="Pencarian & komando (Ctrl K)"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs text-slate-500 dark:border-navy-600 dark:text-slate-400"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <kbd className="hidden rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500 md:inline dark:bg-navy-800 dark:text-slate-400">
                Ctrl K
              </kbd>
            </button>
            {/* Identitas user selalu tampil (termasuk mobile): avatar + nama (sm+) + pill role. */}
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-1 pr-2 dark:border-navy-600 sm:px-2.5">
              <Avatar name={user.display_name || user.username} size="sm" />
              <span className="hidden max-w-[6rem] truncate text-xs font-semibold text-slate-700 sm:inline dark:text-slate-200">
                {user.display_name || user.username}
              </span>
              <span
                className={
                  // Pill role: admin = aksen; semua peran lain = slate.
                  'rounded px-1.5 py-px text-2xs font-bold text-white ' +
                  (user.role === 'admin' ? 'bg-accent-500' : 'bg-slate-400 dark:bg-slate-500')
                }
              >
                {ROLE_LABEL[user.role] ?? user.role.toUpperCase()}
              </span>
            </div>
            {(user.role === 'admin' || user.role === 'pengurus') && <NotificationBell />}
          </div>
        </div>
      </header>
      <main
        className={
          'mx-auto max-w-6xl px-4 py-5 ' + (showBottomNav ? 'pb-28 md:pb-16' : 'pb-16')
        }
      >
        {showBreadcrumb && <Breadcrumb path={pathname} />}
        {children}
      </main>
      {showBottomNav && <BottomNav role={user.role} />}
      <SessionWatcher />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        user={user}
        onToggleTheme={toggleTheme}
      />
    </div>
  );
}
