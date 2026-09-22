'use client';

import { useEffect, useRef, useState } from 'react';

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
          <button
            onClick={onClose}
            aria-label="Tutup dialog"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
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

export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-navy-600 dark:text-slate-400">
      {text}
    </div>
  );
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

/** Fetch JSON helper with json error surfacing. */
export async function api<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const data = (await res.json()) as T & { error?: string };
    return { ok: res.ok, data: data as T, error: (data as { error?: string }).error };
  } catch {
    return { ok: false, data: undefined as T, error: 'Kesalahan jaringan.' };
  }
}
