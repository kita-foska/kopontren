'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg rounded-b-none bg-white p-4 sm:rounded-xl dark:bg-navy-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
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
  if (!msg) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
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
