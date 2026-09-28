'use client';
// UX-7B: Command Palette global (Ctrl+K / Cmd+K) — navigasi role-filtered
// + aksi cepat + live-search lintas-entitas (GET /api/search, 7A).
// Dipasang di Shell (seluruh halaman ter-shell) sehingga terbuka di mana
// saja. Keyboard: ArrowUp/Down navigasi, Enter eksekusi, Escape tutup.
// Live-search: debounce 300ms + abort request basi (maks 15 baris/3 query
// di server, target Turso Rows Read).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { levelOk, MENU_ITEMS } from '@/components/sidebar';
import type { AppUser } from '@/lib/auth';
import { canAccess, isManager } from '@/lib/features';

type SearchResults = {
  products: { id: number; name: string; category: string; unit: string; base_price: number; stock: number; barcode: string }[];
  members: { id: number; name: string; phone: string; points: number; tier: string }[];
  sales: { id: number; customer: string; total: number; status: string; created_at: string }[];
};

type PaletteItem = { kind: 'nav' | 'action' | 'result'; label: string; sub: string; run: () => void };
type PaletteSection = { title: string; items: PaletteItem[] };

const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

export function CommandPalette({
  open,
  onClose,
  user,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  user: AppUser | null;
  onToggleTheme: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  // Reset state + focus input setiap kali palette dibuka.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setResults(null);
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Live-search: debounce 300ms; q < 2 karakter = tidak fetch (aturan 7A).
  useEffect(() => {
    const qq = q.trim();
    if (qq.length < 2) {
      setResults(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(qq), { signal: ctl.signal });
        if (!res.ok) return;
        setResults((await res.json()) as SearchResults);
      } catch {
        // Abort (input berubah cepat) / network — biarkan hasil lama.
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  // Section builder: mode idle = Navigasi + Aksi; mode cari = hasil 7A.
  const sections = useMemo<PaletteSection[]>(() => {
    const s: PaletteSection[] = [];
    if (q.trim().length < 2) {
      // Navigasi: SATU sumber menu = MENU_ITEMS (sidebar), visibilitas mirror
      // levelOk (FEATURE_MATRIX/isManager/admin-only) — sddp menu sidebar.
      const nav: PaletteItem[] = user
        ? MENU_ITEMS.filter((m) => levelOk(user.role, m.level)).map((m) => ({
            kind: 'nav',
            label: m.roleLabel?.[user.role] ?? m.label,
            sub: m.href,
            run: () => go(m.href),
          }))
        : [];
      s.push({ title: 'Pintar · Navigasi', items: nav });
      const actions: PaletteItem[] = [
        { kind: 'action', label: 'Ganti tema (light/dark)', sub: 'Pref lokal', run: onToggleTheme },
      ];
      // H5 (I-3): notifikasi dibuka untuk pengurus (read-only) — same check
      // with NotificationBell (admin + pengurus).
      if (user && (user.role === 'admin' || user.role === 'pengurus'))
        actions.push({ kind: 'action', label: 'Lihat notifikasi', sub: '/admin/notifikasi', run: () => go('/admin/notifikasi') });
      if (isManager(user))
        actions.push({ kind: 'action', label: 'Backup & restore SQLite', sub: '/admin/backup', run: () => go('/admin/backup') });
      s.push({ title: 'Pintar · Aksi', items: actions });
    }
    if (results) {
      if (results.products.length)
        s.push({
          title: 'Pintar · Produk (' + results.products.length + ')',
          items: results.products.map((p) => ({
            kind: 'result',
            label: p.name,
            sub: rupiah(p.base_price) + ' / ' + p.unit + ' · stok ' + p.stock,
            run: () => go('/admin/produk'),
          })),
        });
      if (results.members.length)
        s.push({
          title: 'Pintar · Member (' + results.members.length + ')',
          items: results.members.map((m) => ({
            kind: 'result',
            label: m.name,
            sub: 'poin ' + m.points + ' · ' + m.phone + (m.tier ? ' · ' + m.tier : ''),
            run: () => go('/admin/member'),
          })),
        });
      if (results.sales.length)
        s.push({
          title: 'Pintar · Transaksi (' + results.sales.length + ')',
          items: results.sales.map((x) => ({
            kind: 'result',
            label: '#' + x.id + (x.customer ? ' · ' + x.customer : ''),
            sub: rupiah(x.total) + ' · ' + x.status + ' · ' + x.created_at.slice(0, 10),
            run: () => go('/laporan'),
          })),
        });
      if (!results.products.length && !results.members.length && !results.sales.length)
        s.push({ title: 'Pintar · Hasil', items: [{ kind: 'result', label: 'Tidak ditemukan', sub: 'Percobaan kata lain', run: () => {} }] });
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, results, user]);

  const flat = useMemo(() => sections.flatMap((x) => x.items), [sections]);

  useEffect(() => {
    setActive(0);
  }, [q, results]);
  useEffect(() => {
    const el = listRef.current?.querySelectorAll('[data-palette-item]')[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[active];
      if (!item) return;
      item.run();
      if (item.kind !== 'result') onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let idx = -1;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pintar komando"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
    >
      <div className="w-full max-w-xl rounded-xl border border-stroke bg-white shadow-xl dark:bg-[#101216]">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          aria-label="Cari produk, member, transaksi, atau navigasi"
          placeholder="Pintar cari produk / member / transaksi, atau ketik komando…"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="palette-listbox"
          aria-expanded={true}
          aria-activedescendant={
            flat.length ? 'palette-opt-' + active : undefined
          }
          className="w-full border-0 bg-transparent px-4 py-3.5 text-[15px] outline-none dark:bg-transparent"
        />
        {q.trim().length >= 2 && !results && (
          <p className="border-t border-stroke px-4 py-2 text-xs text-soft">Pintar mencari…</p>
        )}
        <div ref={listRef} id="palette-listbox" role="listbox" aria-label="Pilihan komando" className="max-h-[46vh] overflow-auto border-t border-stroke">
          {sections.map((sec) => (
            <div key={sec.title}>
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-soft">{sec.title}</p>
              {sec.items.map((item) => {
                idx += 1;
                const i = idx;
                const on = i === active;
                return (
                  <button
                    key={sec.title + i}
                    data-palette-item
                    id={'palette-opt-' + i}
                    role="option"
                    aria-selected={on}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => item.run()}
                    className={
                      'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] ' +
                      (on ? 'bg-cash-100 text-cash-700 dark:bg-cash-500/15 dark:text-cash-300' : 'text-ink dark:text-[#e8eaf1]')
                    }
                  >
                    <span className="truncate font-medium">{item.label}</span>
                    <span className="shrink-0 text-[11px] text-soft">{item.sub}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!sections.length && (
            <p className="px-4 py-3 text-xs text-soft">Tidak ada komando untuk role ini.</p>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-stroke px-4 py-2 text-[10px] text-soft">
          <span><b className="font-semibold">↑↓</b> navigasi</span>
          <span><b className="font-semibold">Enter</b> pilih</span>
          <span><b className="font-semibold">Esc</b> tutup</span>
          <span className="ml-auto">{canAccess(user, 'pos') ? 'Pintar live-search aktif' : 'Pintar hanya navigasi/aksi'}</span>
        </div>
      </div>
    </div>
  );
}
