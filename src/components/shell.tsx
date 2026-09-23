'use client';

import type { AppUser } from '@/lib/auth';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { HamburgerNav } from './sidebar';
import { BottomNav } from './bottom-nav';
import { SessionWatcher } from './session-watcher';
import { NotificationBell } from './notification-bell';
import { Avatar, ROLE_LABEL } from './ui';
import { fetchTimeout } from '@/lib/fetch-util';

export function Shell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Bottom nav (mobile) tampil di semua halaman Shell kecuali /kasir —
  // POS punya sticky bottom bar sendiri (jangan sampai jadi dua bar).
  const showBottomNav = pathname !== '/kasir';

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
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  Kasir &amp; Pembukuan
                </p>
              </div>
            </a>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {/* Identitas user selalu tampil (termasuk mobile): avatar + nama (sm+) + pill role. */}
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-1 pr-2 dark:border-navy-600 sm:px-2.5">
              <Avatar name={user.display_name || user.username} size="sm" />
              <span className="hidden max-w-[6rem] truncate text-xs font-semibold text-slate-700 sm:inline dark:text-slate-200">
                {user.display_name || user.username}
              </span>
              <span
                className={
                  // Pill role: admin = aksen; semua peran lain = slate.
                  'rounded px-1.5 py-px text-[10px] font-bold text-white ' +
                  (user.role === 'admin' ? 'bg-accent-500' : 'bg-slate-400 dark:bg-slate-500')
                }
              >
                {ROLE_LABEL[user.role] ?? user.role.toUpperCase()}
              </span>
            </div>
            {user.role === 'admin' && <NotificationBell />}
          </div>
        </div>
      </header>
      <main
        className={
          'mx-auto max-w-6xl px-4 py-5 ' + (showBottomNav ? 'pb-28 md:pb-16' : 'pb-16')
        }
      >
        {children}
      </main>
      {showBottomNav && <BottomNav role={user.role} />}
      <SessionWatcher />
    </div>
  );
}
