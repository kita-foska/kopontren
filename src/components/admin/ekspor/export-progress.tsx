'use client';

/**
 * P3d -- Indikator progress unduhan CSV per modul (sukses/gagal/dalam
 * proses). Ikon inline SVG 16px stroke-2 currentColor (tanpa pustaka
 * ikon), a11y via role/aria + aria-live.
 */
import type { ReactNode } from 'react';
import type { ExportProgress, ExportStatus } from '@/lib/admin/export-download';

/** Item view-model: status + label modul (untuk teks baris). */
export type ExportProgressItem = ExportProgress & { label: string };

/** Kerangka SVG inline 16px stroke-2 (seluruh ikon memakainya). */
function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Ikon status: idle (lingkaran), running (spinner), ok (check), fail (X). */
function StatusIcon({ status }: { status: ExportStatus }) {
  switch (status) {
    case 'ok':
      return (
        <Svg className="text-emerald-600 dark:text-emerald-400">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 12.5l2.5 2.5 4.5-5" />
        </Svg>
      );
    case 'fail':
      return (
        <Svg className="text-rose-600 dark:text-rose-400">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6" />
          <path d="M15 9l-6 6" />
        </Svg>
      );
    case 'running':
      return (
        <Svg className="animate-spin text-accent-500">
          <path d="M12 3a9 9 0 1 0 9 9" />
        </Svg>
      );
    default:
      return (
        <Svg className="text-slate-300 dark:text-slate-600">
          <circle cx="12" cy="12" r="8" />
        </Svg>
      );
  }
}

/** Rincian teks per status (nama file / pesan galat / status). */
function statusText(it: ExportProgressItem): { text: string; cls: string } {
  if (it.status === 'ok')
    return {
      text: 'sukses' + (it.filename ? ' - ' + it.filename : ''),
      cls: 'text-emerald-600 dark:text-emerald-400',
    };
  if (it.status === 'fail')
    return {
      text: 'gagal' + (it.error ? ' - ' + it.error : ''),
      cls: 'text-rose-600 dark:text-rose-400',
    };
  if (it.status === 'running')
    return { text: 'mengunduh...', cls: 'text-accent-500' };
  return { text: 'siap', cls: 'text-slate-400 dark:text-slate-500' };
}

export function ExportProgressList({
  items,
  busy,
  onCancel,
}: {
  items: ExportProgressItem[];
  busy: boolean;
  onCancel?: () => void;
}) {
  const anyActivity = items.some((i) => i.status !== 'idle');
  if (!anyActivity) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Belum ada unduhan. Pilih periode lalu tekan Unduh per modul atau Unduh semua.
      </p>
    );
  }

  const okCount = items.filter((i) => i.status === 'ok').length;
  const failCount = items.filter((i) => i.status === 'fail').length;

  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <ul className="divide-y divide-slate-100 dark:divide-navy-700">
        {items.map((it) => {
          const st = statusText(it);
          return (
            <li key={it.taskId} className="flex items-center gap-3 py-2">
              <StatusIcon status={it.status} />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {it.label}
              </span>
              <span className={'ml-auto text-xs ' + st.cls}>{st.text}</span>
            </li>
          );
        })}
      </ul>
      {okCount > 0 || failCount > 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Selesai: {okCount} sukses{failCount > 0 ? ', ' + failCount + ' gagal' : ''}.
        </p>
      ) : null}
      {busy && onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-rose-600 underline dark:text-rose-400"
        >
          Batalkan unduhan
        </button>
      ) : null}
    </div>
  );
}