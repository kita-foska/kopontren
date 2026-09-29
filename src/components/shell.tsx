'use client';

import type { AppUser, Role } from '@/lib/auth';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { HamburgerNav } from './sidebar';
import { BottomNav } from './bottom-nav';
import { SessionWatcher } from './session-watcher';
import { NotificationBell } from './notification-bell';
import { Avatar, ROLE_LABEL, api } from './ui';
import { Breadcrumb } from './breadcrumb';
import { fetchTimeout } from '@/lib/fetch-util';
import { useHotkeys } from '@/lib/useHotkeys';
import { CommandPalette } from '@/components/command-palette';
import { KeyCheatsheet } from '@/components/key-cheatsheet';

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
  // UX-7C: Cheatsheet pintasan global — ? toggle (di luar /kasir: di sana POS
  // punya "Panduan Kasir" sendiri via ? lokal, jangan dua panel sekaligus).
  const [cheatOpen, setCheatOpen] = useState(false);
  useHotkeys(
    {
      'ctrl+k': () => setPaletteOpen((v) => !v),
      escape: () => setPaletteOpen(false),
      '?': (e) => {
        if (pathname === '/kasir') return; // hotkey ? milik Panduan Kasir POS
        // '?' yang diketik di kolom input (input/textarea/select) tidak
        // boleh membuka panel — pola guard sama dengan pos-client (inTextTarget).
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setCheatOpen((v) => !v);
      },
    },
    // UX-7C: listener WAJIB aktif — argumen `false` lama (7B) membuat Ctrl+K
    // tak terdaftar sama sekali (shell hanya ter-render utk user login,
    // jadi selalu aman diaktifkan).
    true
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

  // M1-4: role switcher — POST /api/auth/switch-role, lalu router.refresh()
  // (server re-render menu sesuai role baru; tak ada state menu di client).
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchBusy, setSwitchBusy] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  async function switchRole(role: Role) {
    if (switchBusy) return;
    setSwitchBusy(true);
    try {
      const r = await api<{ ok: boolean; role: Role }>('/api/auth/switch-role', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      if (r.ok) {
        setSwitchOpen(false);
        router.refresh();
      }
      // Gagal (401 idle dth. SessionWatcher) -> dropdown tetap buka.
    } finally {
      setSwitchBusy(false);
    }
  }
  // Tutup dropdown role: klik di luar pill / Escape.
  useEffect(() => {
    if (!switchOpen) return;
    function onDown(e: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) setSwitchOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSwitchOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [switchOpen]);

  // Theme T3 (2026-09-29): terapkan brand color theme.
  // - On mount: GET /api/settings -> <html data-brand> (layer CSS T2 di
  //   globals.css menangani visual; nilai tak dikenal = maroon = default).
  // - Live: setelah admin simpan di /admin/pengguna, kartu itu dispatch
  //   event 'kopontren:theme-change' (detail = theme) -> terapkan sekarang
  //   tanpa reload.
  // meta theme-color (chrome browser mobile) ikut disinkron. Catatan:
  // manifest PWA tetap maroon (statik, tak bisa diubah runtime) —
  // konstrain desain, bukan bug.
  // SYNC POINT hex: nilai ac500 di bawah = layer CSS T2 (globals.css)
  // = swatch di pengguna-client.tsx. Ubah ketiganya bareng.
  const applyBrand = (theme: string) => {
    const BRANDS = ['maroon', 'green', 'blue', 'dark-maroon', 'slate'];
    const brand = BRANDS.includes(theme) ? theme : 'maroon';
    const root = document.documentElement;
    if (brand === 'maroon') delete root.dataset.brand;
    else root.dataset.brand = brand;
    const META: Record<string, string> = {
      maroon: '#7A1835',
      green: '#16774B',
      blue: '#1D4F91',
      'dark-maroon': '#5C1224',
      slate: '#475569',
    };
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'theme-color');
      document.head.appendChild(m);
    }
    m.setAttribute('content', META[brand]);
  };
  useEffect(() => {
    let alive = true;
    api<{ theme?: string }>('/api/settings')
      .then((r) => {
        if (alive && r.ok && r.data && typeof r.data.theme === 'string') applyBrand(r.data.theme);
      })
      .catch(() => undefined); // offline/gagal -> fallback maroon (tanpa data-brand)
    const onThemeChange = (e: Event) => {
      const t = (e as CustomEvent).detail;
      if (typeof t === 'string') applyBrand(t);
    };
    window.addEventListener('kopontren:theme-change', onThemeChange);
    return () => {
      alive = false;
      window.removeEventListener('kopontren:theme-change', onThemeChange);
    };
  }, []);

  return (
    <div className="min-h-screen">
      {/* UX-8C: skip-link (a11y): tersembunyi sampai di-focus via Tab —
          user keyboard melompat langsung dari navigasi ke konten utama. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-accent-500 focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
      >
        Lewati navigasi
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-navy-700 dark:bg-navy-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <HamburgerNav
              name={user.display_name || user.username}
              role={user.role}
              roles={user.roles}
              onSwitchRole={switchRole}
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
            {/* UX-7C: pemicu cheatsheet pintasan (discovery; ? tetap jalan).
                Disembunyikan di /kasir — di sana ? milik "Panduan Kasir" POS. */}
            {pathname !== '/kasir' && (
              <button
                type="button"
                onClick={() => setCheatOpen(true)}
                aria-label="Pintasan keyboard (?)"
                title="Pintasan keyboard (?)"
                className="hidden h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs text-slate-500 sm:flex dark:border-navy-600 dark:text-slate-400"
              >
                <kbd className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500 dark:bg-navy-800 dark:text-slate-400">
                  ?
                </kbd>
              </button>
            )}
            {/* Identitas user selalu tampil (termasuk mobile): avatar + nama (sm+) + pill role.
                M1-4: bila user punya >1 role, pill jadi dropdown switcher (Decision #5:
                1 chip, jangan numpuk N chip). Pilih -> switch-role -> router.refresh(). */}
            <div
              ref={pillRef}
              className="relative flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-1 pr-1.5 dark:border-navy-600 sm:px-2"
            >
              <Avatar name={user.display_name || user.username} size="sm" />
              <span className="hidden min-w-0 max-w-[5rem] truncate text-xs font-semibold text-slate-700 lg:inline dark:text-slate-200">
                {user.display_name || user.username}
              </span>
              {user.roles.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setSwitchOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={switchOpen}
                  className={
                    // Pill role: admin = aksen; semua peran lain = slate.
                    'shrink-0 rounded px-1.5 py-px text-2xs font-bold text-white ' +
                    (user.role === 'admin' ? 'bg-accent-500' : 'bg-slate-400 dark:bg-slate-500')
                  }
                >
                  {(ROLE_LABEL[user.role] ?? user.role.toUpperCase()) + ' \u25be'}
                </button>
              ) : (
                <span
                  className={
                    // Pill role: admin = aksen; semua peran lain = slate.
                    'shrink-0 rounded px-1.5 py-px text-2xs font-bold text-white ' +
                    (user.role === 'admin' ? 'bg-accent-500' : 'bg-slate-400 dark:bg-slate-500')
                  }
                >
                  {ROLE_LABEL[user.role] ?? user.role.toUpperCase()}
                </span>
              )}
              {user.roles.length > 1 && switchOpen && (
                <div
                  role="menu"
                  aria-label="Ganti peran"
                  className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-navy-600 dark:bg-navy-800"
                >
                  <p className="px-3 pb-1 pt-1.5 text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Ganti peran
                  </p>
                  {user.roles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="menuitemradio"
                      aria-checked={r === user.role}
                      disabled={switchBusy}
                      onClick={() => switchRole(r)}
                      className={
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold transition disabled:opacity-50 ' +
                        (r === user.role
                          ? 'text-accent-500'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-navy-700')
                      }
                    >
                      <span>{ROLE_LABEL[r] ?? r.toUpperCase()}</span>
                      {r === user.role && <span className="text-[10px] font-bold">aktif</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(user.role === 'admin' || user.role === 'pengurus') && <NotificationBell />}
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
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
      <KeyCheatsheet open={cheatOpen} onClose={() => setCheatOpen(false)} user={user} />
    </div>
  );
}
