'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// alias agar tidak men-shadow type KeyboardEvent global (DOM) yang
// dipakai handler ESC Modal di bawah.
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { fetchTimeout, isAbort } from '@/lib/fetch-util';

const tones: Record<string, string> = {
  blue: 'bg-accent-500/15 text-accent-600 dark:text-accent-300',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  red: 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  gray: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
};

export function Badge({
  tone = 'gray',
  children,
}: {
  tone?: 'blue' | 'amber' | 'green' | 'red' | 'gray';
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ' + tones[tone]
      }
    >
      {children}
    </span>
  );
}

/** Inisial maksimal 2 huruf dari nama — dipakai avatar di header + drawer. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Navigasi keyboard tablist (WCAG 16.20 / pola APG "tabs", aktivasi
 * otomatis): ArrowRight/ArrowLeft memindahkan fokus (wrap), Home/End
 * lompat ke tab pertama/terakhir. Saat pindah fokus, tab langsung
 * diaktifkan (click() pada tombol — handler onClick yang sama yang
 * dipakai mouse juga jalan). Cara pakai:
 *
 *   const { onTabKeyDown } = useTablistNav(getKey, setKey);
 *   <div role="tablist" onKeyDown={onTabKeyDown}>…
 *
 * getKey(index) → key tab di index i; setKey(k) → aktifkan tab k.
 */
export function useTablistNav<T extends string>(
  getKey: (index: number) => T,
  setKey: (k: T) => void
) {
  const onTabKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const tabs = Array.from(
        e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')
      );
      if (tabs.length === 0) return;
      const current = tabs.indexOf(document.activeElement as HTMLElement);
      let next = -1;
      switch (e.key) {
        case 'ArrowRight':
          next = current === -1 ? 0 : (current + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          next = current === -1 ? tabs.length - 1 : (current - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      tabs[next].focus();
      // aktivasi otomatis (pola APG): focus langsung memicu onClick tab
      // tsb; setKey eksplisit jadi pengaman bila onClick tidak identik.
      tabs[next].click();
      setKey(getKey(next));
    },
    [getKey, setKey]
  );
  return { onTabKeyDown };
}

/**
 * Avatar lingkaran berisi inisial nama — identitas user di header + drawer.
 * `sm` = 28px (header), `md` = 36px (kartu profil drawer).
 */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  return (
    <span
      aria-hidden="true"
      className={
        'flex shrink-0 select-none items-center justify-center rounded-full bg-accent-500 font-extrabold text-white ' +
        dim
      }
    >
      {initials(name)}
    </span>
  );
}

/** Label role ramah (tampilan profil/identitas). Default = role.toUpperCase(). */
export const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  manajer: 'Manajer',
  pengurus: 'Pengurus',
  kasir: 'Kasir',
  gudang: 'Gudang',
  pembelian: 'Pembelian',
  member: 'Member',
};

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Tutup dengan ESC (tambahan di atas handler ESC page-specific).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Saat buka: pindahkan fokus ke elemen pertama di panel; saat tutup:
  // kembalikan fokus ke elemen sebelumnya (a11y dialog).
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    prevFocusRef.current = (document.activeElement as HTMLElement | null) || null;
    const first = panel.querySelector<HTMLElement>('button, [href], input, select, textarea');
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) prevFocusRef.current?.focus?.();
  }, [open]);

  // Focus-trap sederhana: Tab / Shift+Tab berputar di dalam panel.
  function trapFocus(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled'));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={trapFocus}
        className="card w-full max-w-lg rounded-b-none bg-white p-4 sm:rounded-xl dark:bg-navy-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{title}</h3>
          {/* min 44px: target sentuh a11y di layar kecil */}
          <button type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [msg]);
  // Live region harus PERSISTEN di DOM agar screen reader mengumumkan
  // perubahan pesan — saat kosong dirender sr-only, bukan di-unmount.
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        msg
          ? 'fixed bottom-4 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg dark:bg-slate-100 dark:text-slate-900'
          : 'sr-only'
      }
    >
      {msg}
    </div>
  );
}

export function useToast(): [string, (m: string) => void, () => void] {
  const [msg, setMsg] = useState('');
  return [msg, setMsg, () => setMsg('')];
}

/**
 * useConfirm — pengganti window.confirm() native dengan Modal design system
 * (focus-trap, ESC, bottom-sheet di mobile). Dipakai untuk aksi destruktif.
 *
 * Dipakai di komponen client:
 *   const { ask, host } = useConfirm();
 *   ...
 *   ask({
 *     title: 'Hapus produk',
 *     message: 'Hapus "X"? Jika ada riwayat transaksi, produk dinonaktifkan aman.',
 *     confirmLabel: 'Hapus',
 *     proceed: async () => { ...hapus...; },
 *   });
 *   // render {host} di dekat <Toast/>
 */
export function useConfirm() {
  type Req = {
    title: string;
    message: string;
    confirmLabel: string;
    proceed: () => void | Promise<void>;
  };
  const [req, setReq] = useState<Req | null>(null);
  const [busy, setBusy] = useState(false);

  function ask(o: { title?: string; message: string; confirmLabel?: string; proceed: () => void | Promise<void> }) {
    setReq({
      title: o.title ?? 'Konfirmasi',
      message: o.message,
      confirmLabel: o.confirmLabel ?? 'Lanjutkan',
      proceed: o.proceed,
    });
  }

  function cancel() {
    if (!busy) setReq(null);
  }

  async function onConfirm() {
    if (!req || busy) return;
    setBusy(true);
    try {
      await req.proceed();
    } finally {
      setBusy(false);
      setReq(null);
    }
  }

  const host = req ? (
    <Modal
      open
      title={req.title}
      onClose={cancel}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={cancel} disabled={busy}>
            Batal
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Memproses…' : req.confirmLabel}
          </button>
        </>
      }
    >
      <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{req.message}</p>
    </Modal>
  ) : null;

  return { ask, host };
}

export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-navy-600 dark:text-slate-400">
      {text}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Badge status terpadu (design system): mapping status -> tone + label
 * baku, supaya semua halaman menampilkan status dengan warna yang sama.
 * Status tak dikenal: tone gray, label = nilai mentah (aman).
 */
const STATUS_MAP: Record<string, { tone: 'green' | 'amber' | 'gray'; label: string }> = {
  reported: { tone: 'green', label: 'Sudah Dilaporkan' },
  unreported: { tone: 'amber', label: 'Belum Dilaporkan' },
};

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_MAP[status] ?? { tone: 'gray' as const, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/**
 * Skeleton loading: placeholder shimmer untuk halaman berat yang dimuat
 * lazily (fallback next/dynamic) — user melihat struktur halaman, bukan
 * layar kosong, sementara JS chunk diunduh.
 * Kontras dinaikkan (a11y): baris bg-slate-300 / dark:bg-navy-500 agar
 * terlihat jelas di kedua tema tanpa bergantung animasi.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card animate-pulse p-4">
            <div className="mb-2 h-3 w-16 rounded bg-slate-300 dark:bg-navy-500" />
            <div className="h-6 w-24 rounded bg-slate-300 dark:bg-navy-500" />
          </div>
        ))}
      </div>
      <div className="card animate-pulse p-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="mb-2 h-4 rounded bg-slate-300 dark:bg-navy-500"
            style={{ width: `${90 - i * 12}%` }}
          />
        ))}
      </div>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Memuat data…</p>
    </div>
  );
}

/**
 * Fetch JSON helper with json error surfacing + timeout abort 10 detik
 * (fetchTimeout) agar request yang pending tidak membuat spinner nyangkut
 * selamanya. Menutup semua caller klien yang memakai api().
 * Galat di-differentiate: fetch gagal total (offline/CORS/DNS) =
 * "Kesalahan jaringan."; respons server dgn badan non-JSON (mis. halaman
 * 5xx HTML saat query Turso meledak) = "Server sedang bermasalah (HTTP
 * X)" — bukan lagi mislabel "Kesalahan jaringan." (perbaikan 24 Sep,
 * laporan "Kesalahan jaringan" di tab Neraca).
 */
export async function api<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T; error?: string }> {
  let res: Response;
  try {
    res = await fetchTimeout(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch (e) {
    // Fetch itu sendiri gagal (koneksi putus, offline, CORS, DNS) →
    // benar-benar kesalahan jaringan.
    return {
      ok: false,
      data: undefined as T,
      error: isAbort(e) ? 'Waktu koneksi habis. Silakan coba lagi.' : 'Kesalahan jaringan.',
    };
  }
  let data: T & { error?: string };
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    // Terima respons tapi badan bukan JSON (halaman error 5xx dari
    // platform / exception tak tertangani di route) → tampilkan status
    // HTTP agar bisa dibedakan dari gangguan jaringan murni.
    return {
      ok: false,
      data: undefined as T,
      error: 'Server sedang bermasalah (HTTP ' + res.status + '). Silakan coba lagi.',
    };
  }
  return { ok: res.ok, data: data as T, error: data.error };
}
