'use client';

import type { ReactNode } from 'react';

/**
 * W18-A (UI/UX High Polish): EmptyState -- komposisi state-kosong
 * reusable utk tabel/list tanpa data (pengganti <p> ad-hoc
 * "Belum ada ..." / "Tidak ada transaksi ..."). Standalone: tak
 * bergantung komponen lain; token desain dari globals.css
 * (rounded-field, --space-*, --radius-*, --shadow-*).
 * A11y: role="status" (pembaca layar mengumumkan kondisi kosong
 * secara polite); ikon default = SVG inline (aturan project: ikon
 * baru inline, 0 dependency baru).
 */

/** Ikon default (inbox, SVG inline -- tak memakai library ikon). */
const DefaultIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-7 w-7"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
  </svg>
);

export function EmptyState({
  message,
  icon,
  ctaLabel,
  ctaOnClick,
  ctaHref,
  compact = true,
}: {
  /** Pesan utama (wajib); contoh: "Belum ada aliran ZIS (non-pembuka)." */
  message: string;
  /** Ikon inline SVG opsional (default: ikon inbox, h-7 w-7). */
  icon?: ReactNode;
  ctaLabel?: string;
  ctaOnClick?: () => void;
  ctaHref?: string;
  /** compact (default) = teks-xs + padding rapat (untuk panel formal);
   *  false = teks-sm (untuk halaman penuh). */
  compact?: boolean;
}) {
  const text = compact ? 'text-xs' : 'text-sm';
  const pad = compact ? 'px-3 py-3' : 'px-4 py-6';
  return (
    <div
      role="status"
      className={
        'flex flex-col items-center gap-2 rounded-field border border-slate-200/70 bg-slate-50/70 text-center dark:border-navy-700 dark:bg-navy-900/50 ' +
        pad
      }
    >
      <span className="text-slate-300 dark:text-slate-500">{icon ?? DefaultIcon}</span>
      <p className={'text-slate-600 dark:text-slate-400 ' + text}>{message}</p>
      {ctaLabel &&
        (ctaOnClick ? (
          <button
            type="button"
            onClick={ctaOnClick}
            className="rounded-field border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-accent-600 transition hover:bg-slate-100 dark:border-navy-700 dark:bg-navy-800 dark:text-accent-300 dark:hover:bg-navy-700"
          >
            {ctaLabel}
          </button>
        ) : ctaHref ? (
          <a
            href={ctaHref}
            className="text-xs font-semibold text-accent-600 underline underline-offset-2 dark:text-accent-300"
          >
            {ctaLabel}
          </a>
        ) : null)}
    </div>
  );
}