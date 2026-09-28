'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// alias agar tidak men-shadow type KeyboardEvent global (DOM) yang
// dipakai handler ESC Modal di bawah.
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CircleHelp, Loader2, X } from 'lucide-react';
import { fetchTimeout, fetchRetry, isAbort } from '@/lib/fetch-util';

const tones: Record<string, string> = {
  blue: 'bg-accent-500/15 text-accent-600 dark:text-accent-300',
  // P3 audit: light text-amber-700 (dulu -600 ≈3:1 di bg terang, gagal AA).
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  red: 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  gray: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  // UX-3: maroon = warna identitas (token burgundy #7A1835),
  // gold = highlight/special. Kontras AA 4.5:1 di kedua tema.
  maroon: 'bg-accent-500/15 text-accent-700 dark:text-accent-300',
  gold: 'bg-amber-400/25 text-amber-800 dark:text-amber-200',
};

export function Badge({
  tone = 'gray',
  children,
}: {
  tone?: 'blue' | 'amber' | 'green' | 'red' | 'gray' | 'maroon' | 'gold';
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ' + tones[tone]
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

/* ── UX-4 FASE B (B1): primitive Button — inti UX-4
   7 varian × 3 ukuran; a11y: min touch target 44px (kecuali variant link),
   iconOnly wajib aria-label, loading = spinner + aria-busy, active =
   aria-pressed (toggle/filter chip), focus-visible ring, type default
   'button' (aman form). Fase B.2–B.4: migrasi 208 <button> + 13 <a>
   ad-hoc/`btn-*` → <Button>; 5 rules CSS .btn* dihapus di D0 (FASE D;
   catatan lama menuliskan B.4, padahal belum pernah terjadi). */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'amber'
  | 'gold'
  | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-field font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const BTN_SIZE: Record<ButtonSize, string> = {
  // Target sentuh a11y: md = 44px (standar); sm = 36px utk area padat.
  sm: 'min-h-[36px] px-2.5 py-1 text-xs',
  md: 'min-h-11 px-3.5 py-2 text-sm',
  lg: 'min-h-[52px] px-5 py-3 text-base',
};

const BTN_ICON: Record<ButtonSize, string> = {
  // Kotak persegi (width = height) untuk tombol ikon.
  sm: 'h-9 w-9 p-0',
  md: 'h-11 w-11 p-0',
  lg: 'h-[52px] w-[52px] p-0',
};

const BTN_VARIANT: Record<ButtonVariant, string> = {
  // Maroon brand = token accent-500 (burgundy #7a1835, UX-3).
  primary: 'bg-accent-500 text-white hover:bg-accent-600',
  // Netral terisi (bedanya dg ghost: ghost transparan).
  secondary:
    'border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700',
  // Transparan + border netral (padanan .btn-ghost legacy; rules CSS-nya
  // sudah dihapus D0 FASE D).
  ghost:
    'border border-slate-300 bg-transparent text-slate-700 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-200 dark:hover:bg-navy-700',
  // Semantik risk = rose-600 (tone risk UX-4).
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  // Semantik attention = amber-500.
  amber: 'bg-amber-500 text-slate-900 hover:bg-amber-400',
  // Highlight premium (token gold #fbbf24) — khusus tier/badge, bukan aksi umum.
  gold: 'bg-amber-400 text-slate-900 hover:bg-amber-300',
  // Teks-only: tanpa min-height (44px hanya utk tombol sejati).
  // Teks-only: tanpa min-height/padding (ukuran di-skip utk link → inherit).
  link: 'text-accent-600 underline-offset-2 hover:underline dark:text-accent-300',
};

// active=true → chip/toggle terpilih (fill accent, override bg varian).
const BTN_ACTIVE = 'border-accent-500 bg-accent-500 text-white hover:bg-accent-500';

type ButtonBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'className'
> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  /** Ikon depan (lucide, sizing kelas h/w oleh pemanggil). */
  icon?: React.ReactNode;
  /** Persegi (sm 36 / md 44 / lg 52 px); wajib aria-label. */
  iconOnly?: boolean;
  /** Spinner Loader2 + disabled + aria-busy (tombol tidak bisa diklik). */
  loading?: boolean;
  /** Label pengganti children saat loading (mis. 'Memproses…'). Opsional. */
  loadingLabel?: React.ReactNode;
  /** Keadaan terpilih (filter chip/toggle) → fill accent + aria-pressed. */
  active?: boolean;
  /** Lebar penuh (mengganti utilitas w-full ad-hoc). */
  full?: boolean;
  /** Override/merge terakhir — tetap bisa utk kasus khusus (kartu/tile). */
  className?: string;
};

/** Branch <button> (default): `href` dilarang agar tersamaran <a> tak sengaja. */
type ButtonAsButton = ButtonBaseProps & { as?: 'button'; href?: never };
/** Branch <a>: `href` WAJIB. Bila as='a' tanpa href saat runtime →
    fallback render <button> + console.warn (jaringan pengaman). */
type ButtonAsLink = Omit<ButtonBaseProps, 'type' | 'disabled' | 'focusable'> & {
  as: 'a';
  href: string;
  // Unduhan aset (mis. PNG QRIS) — diteruskan ke <a> lewat linkRest.
  download?: string;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  // 2.5: destructure eksplisit key kustom → `...rest` hanya sisakan atribut
  // HTML (self-documenting; tak ada key kustom bocor ke DOM).
  const {
    variant: variantProp = 'primary',
    size = 'md',
    icon,
    iconOnly,
    loading,
    active,
    full,
    className,
    as,
    loadingLabel,
    ...rest
  } = props;
  // Atribut HTML sisa utk bacaan runtime (menghindari indeksasi tipe union).
  const attrs = rest as Record<string, unknown>;
  const type = (attrs['type'] as 'button' | 'submit' | 'reset' | undefined) ?? 'button';

  // 2.2: kombinasi iconOnly + variant="link" tak didukung → dev-warn +
  // fallback ke "ghost" agar tetap ada frame persegi.
  const variant: ButtonVariant =
    iconOnly && variantProp === 'link'
      ? ((typeof console !== 'undefined') &&
          console.warn('[Button] iconOnly + variant="link" tak didukung; fallback ke "ghost".'),
        'ghost')
      : variantProp;

  const cls = [
    BTN_BASE,
    // 2.1: link = teks-only → skip metrik ukuran (min-height/padding) agar tak
    // ada konflik kelas min-h-* antar-size & variant.
    variant === 'link' ? '' : BTN_SIZE[size],
    iconOnly ? BTN_ICON[size] : '',
    BTN_VARIANT[variant],
    active ? BTN_ACTIVE : '',
    full ? 'w-full' : '',
    loading ? 'pointer-events-none' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  // Ikon depan / spinner: loading → Loader2 muter; iconOnly → tanpa teks.
  const lead = loading ? (
    <Loader2
      aria-hidden="true"
      className={'h-' + (size === 'sm' ? '4' : '5') + ' w-' + (size === 'sm' ? '4' : '5') + ' animate-spin'}
    />
  ) : (
    icon
  );
  // 2.3: bila loadingLabel diberikan, ia menggantikan children saat loading.
  const content =
    loading && loadingLabel != null ? loadingLabel : (attrs['children'] as React.ReactNode);

  // 2.6: iconOnly tanpa teks & tanpa aria-label → dev-warn (Boolean check).
  if (
    iconOnly &&
    !attrs['aria-label'] &&
    attrs['children'] == null &&
    typeof console !== 'undefined'
  )
    console.warn('[Button] iconOnly: tambahkan aria-label (a11y tanpa teks).');

  // Branch <a>: as='a' + href wajib.
  if (as === 'a' && attrs['href']) {
    // 2.4: <a> tak memakai aria-pressed (bukan role button); state aktif
    // memakai aria-current. Buang atribut <button>-only.
    const linkRest = { ...attrs };
    delete linkRest['disabled'];
    delete linkRest['focusable'];
    delete linkRest['type'];
    delete linkRest['children'];
    return (
      <a
        {...(linkRest as object)}
        href={attrs['href'] as string}
        className={cls}
        aria-busy={loading || undefined}
        aria-current={active ? 'true' : undefined}
      >
        {lead}
        {iconOnly ? null : content}
      </a>
    );
  }

  // Fallback: as='a' tanpa href → render <button> (jaringan pengaman runtime).
  if (as === 'a' && typeof console !== 'undefined')
    console.warn('[Button] as="a" tanpa href — fallback ke <button>.');

  const btnRest = { ...attrs };
  delete btnRest['children'];
  return (
    <button
      {...(btnRest as object)}
      type={type}
      disabled={Boolean(attrs['disabled']) || loading}
      aria-busy={loading || undefined}
      aria-pressed={active ?? undefined}
      className={cls}
    >
      {lead}
      {iconOnly ? null : content}
    </button>
  );
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

/** FASE G1: token lebar modal (sm=320 / md=512 default / lg=672). */
const MODAL_WIDTH: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'max-w-xs',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  panelClassName,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** FASE G1: sm=max-w-xs (320, label/simpel) · md=max-w-lg (512, default =
      zero-delta untuk modal existing) · lg=max-w-2xl (672, form lebar). */
  size?: 'sm' | 'md' | 'lg';
  /** FASE G1: kelas tambahan untuk panel (mis. "dark:bg-white" pratinjau label). */
  panelClassName?: string;
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
        className={
          'card-dialog w-full ' +
          MODAL_WIDTH[size] +
          ' rounded-b-none p-4' +
          (panelClassName ? ' ' + panelClassName : '')
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{title}</h3>
          {/* min 44px: target sentuh a11y (B1: Button iconOnly md = persegi 44px) */}
          <Button
            variant="ghost"
            size="md"
            iconOnly
            aria-label="Tutup dialog"
            onClick={onClose}
            icon={<X className="h-5 w-5" />}
            className="hover:bg-slate-100 dark:hover:bg-navy-700"
          />
        </div>
        <div>{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export type ToastTone = 'info' | 'success' | 'error' | 'warning' | 'critical';

/**
 * UX-6 I-2: slot aksi di dalam toast (mis. "Urungkan") — primitif:
 * tombol saja; logika undo/dampaknya milik situs pemanggil.
 * Klik tombol = run() lalu toast ditutup (onClose).
 */
export type ToastAction = { label: string; run: () => void };

const TOAST_TONE_CLASS: Record<ToastTone, string> = {
  // info = kelas lama persis (zero-delta); tone lain warna solid (baca baik
  // di light & dark mode karena teks putih di emerald/rose/amber).
  info: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
  warning: 'bg-amber-500 text-white',
  critical: 'bg-rose-500 text-white',
};

export function Toast({
  msg,
  tone = 'info',
  onClose,
  action,
}: {
  msg: string;
  tone?: ToastTone;
  onClose: () => void;
  /** null = tanpa aksi (state 5-tuple `useToast`) — aman, render-guard
   *  pakai `action && msg`. */
  action?: ToastAction | null;
}) {
  useEffect(() => {
    if (!msg) return;
    // UX-6 I-2: critical & warning = 90 dtk (waktu baca + kesempatan undo);
    // close manual tetap tersedia (onClose dari host).
    const ms =
      tone === 'critical' || tone === 'warning' ? 90000 : tone === 'error' ? 6000 : 4000;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [msg, tone]);
  // Live region harus PERSISTEN di DOM agar screen reader mengumumkan
  // perubahan pesan — saat kosong dirender sr-only, bukan di-unmount.
  // tone error/critical: role=alert + assertive (pengguna HARUS tahu, a11y).
  return (
    <div
      role={tone === 'error' || tone === 'critical' ? 'alert' : 'status'}
      aria-live={tone === 'error' || tone === 'critical' ? 'assertive' : 'polite'}
      className={
        msg
          ? 'fixed bottom-4 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ' +
            TOAST_TONE_CLASS[tone]
          : 'sr-only'
      }
    >
      <span className="block">{msg}</span>
      {action && msg && (
        <button
          type="button"
          onClick={() => {
            action.run();
            onClose();
          }}
          className="mt-2 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/30"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * useToast — tuple [msg, showToast, clearToast, tone, action].
 * Backward-compatible: destructure 2–4 elemen lama tetap valid
 * (elemen ke-4 = tone terakhir, default 'info'; elemen ke-5 = aksi
 * terakhir atau null).
 * showToast(msg, tone?, action?) — tone/aksi opsional; tanpa arg = info
 * tanpa aksi (zero-delta). UX-6 I-2.
 */
export function useToast(): [
  string,
  (m: string, tone?: ToastTone, action?: ToastAction) => void,
  () => void,
  ToastTone,
  ToastAction | null,
] {
  const [msg, setMsg] = useState('');
  const [tone, setTone] = useState<ToastTone>('info');
  const [action, setAction] = useState<ToastAction | null>(null);
  // Identitas STABIL (useCallback, deps kosong — setMsg/setTone memang
  // stabil): beberapa komponen meletakkan showToast di deps array
  // useEffect; perilaku lama (elemen ke-2 = setMsg, selalu stabil)
  // dipertahankan agar tidak ada re-run effect per-render.
  const showToast = useCallback(
    (m: string, t: ToastTone = 'info', a?: ToastAction) => {
      setMsg(m);
      setTone(t);
      setAction(a ?? null);
    },
    []
  );
  const clearToast = useCallback(() => {
    setMsg('');
    setTone('info');
    setAction(null);
  }, []);
  return [msg, showToast, clearToast, tone, action];
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
  /**
   * UX-6 I-6: param `risk` eksplisit menggantikan heuristic lama
   * `confirmLabel==='Hapus'`:
   *   L1 = tanpa modal (proceed langsung)
   *   L2 = confirm biasa (default — 15 situs lama tak berubah)
   *   L3 = tombol merah + ringkasan dampak (impact[])
   *   L4 = L3 + input alasan (wajib; tombol disabled sampai diisi;
   *        V1: alasan hanya gate sisi klien — BELUM dikirim ke server;
   *        wire V2 = catatan MEMORY § UX-6 I-6)
   *   L5 = L3 + ketik frasa konfirmasi persis (typeToConfirm)
   */
  type Risk = 1 | 2 | 3 | 4 | 5;
  type Req = {
    title: string;
    message: string;
    confirmLabel: string;
    risk: Risk;
    impact?: string[];
    reasonPlaceholder?: string;
    typeToConfirm?: string;
    proceed: (info?: { reason?: string }) => void | Promise<void>;
  };
  const [req, setReq] = useState<Req | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');

  function ask(o: {
    title?: string;
    message: string;
    confirmLabel?: string;
    risk?: Risk;
    impact?: string[];
    reasonPlaceholder?: string;
    typeToConfirm?: string;
    proceed: (info?: { reason?: string }) => void | Promise<void>;
  }) {
    const risk = o.risk ?? 2;
    if (risk === 1) {
      // L1: aksi tanpa konfirmasi — proceed langsung.
      void o.proceed();
      return;
    }
    setReason('');
    setTyped('');
    setReq({
      title: o.title ?? 'Konfirmasi',
      message: o.message,
      confirmLabel: o.confirmLabel ?? 'Lanjutkan',
      risk,
      impact: o.impact,
      reasonPlaceholder: o.reasonPlaceholder,
      typeToConfirm: o.typeToConfirm,
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
      // L4: alasan diteruskan ke proceed (V1: situs boleh mengabaikan;
      // param alasan server-side = V2 — liha MEMORY § UX-6 I-6).
      await req.proceed(req.risk === 4 ? { reason: reason.trim() } : undefined);
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
          <Button variant="ghost" onClick={cancel} disabled={busy}>
            Batal
          </Button>
          <Button
            variant={req.risk >= 3 ? 'danger' : 'primary'}
            loading={busy}
            disabled={
              (req.risk === 4 && reason.trim() === '') ||
              (req.risk === 5 && typed !== req.typeToConfirm)
            }
            onClick={onConfirm}
          >
            {busy ? 'Memproses…' : req.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{req.message}</p>
      {req.risk >= 3 && req.impact && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <p className="mb-1 font-bold">Dampak:</p>
          <ul className="list-disc pl-4">
            {req.impact.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}
      {req.risk === 4 && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={req.reasonPlaceholder ?? 'Alasan tindakan ini (wajib)'}
          className="mt-3 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-navy-500"
        />
      )}
      {req.risk === 5 && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-600 dark:text-slate-300">
            Ketik <b>{req.typeToConfirm}</b> persis untuk melanjutkan:
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={req.typeToConfirm}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-navy-500"
          />
        </div>
      )}
    </Modal>
  ) : null;

  return { ask, host };
}

export function Empty({
  text,
  action,
  icon,
  ctaLabel,
  ctaHref,
  ctaOnClick,
  ctaVariant = 'ghost',
  compact,
}: {
  text: string;
  action?: React.ReactNode;
  /** Ikon opsional di atas teks (mis. Lucide, ukuran h-7 w-7). */
  icon?: React.ReactNode;
  /** CTA siap pakai: render tombol/link (B1: via Button, target sentuh
      44px pada md; ctaVariant kini ButtonVariant — superset nilai lama).
      ctaHref = link antar-halaman; ctaOnClick = aksi di halaman (buka form
      / scroll ke form). Default ghost (halaman admin padat); primary utk
      halaman aksi (dashboard kasir / laporan). */
  ctaLabel?: string;
  ctaHref?: string;
  ctaOnClick?: () => void;
  ctaVariant?: ButtonVariant;
  /** Padding kecil utk konteks padat (sel tabel, box sub-list). */
  compact?: boolean;
}) {
  // UX-2: CTA opsional di empty state — kosong bukan dead-end, tapi arah.
  // B1: render via <Button>; ctaVariant kini ButtonVariant (superset — nilai
  // lama 'primary'/'ghost' tetap valid).
  const ctaCls = compact ? 'text-xs' : '';
  const cta = ctaLabel ? (
    ctaHref ? (
      <Button as="a" href={ctaHref} variant={ctaVariant} className={ctaCls}>
        {ctaLabel}
      </Button>
    ) : (
      <Button variant={ctaVariant} className={ctaCls} onClick={ctaOnClick}>
        {ctaLabel}
      </Button>
    )
  ) : null;
  return (
    <div
      className={
        'rounded-2xl border border-dashed border-slate-300 text-center text-slate-500 dark:border-navy-600 dark:text-slate-400 ' +
        (compact ? 'px-3 py-4 text-xs' : 'px-4 py-8 text-sm')
      }
    >
      {icon && <div className="mb-2 flex justify-center text-slate-300 dark:text-slate-600">{icon}</div>}
      {text}
      {(cta || action) && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {cta}
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * UX-6 I-5: primitive error state — pesan manusia (dari helper, jangan
 * raw) + tombol "Muat ulang" (opsional) + detail teknis collapsible
 * (<details>) utk support/debug: endpoint + pesan, tersembunyi default.
 * F1: <pre> pakai text-1xs (perbaikan ACC — bukan text-[11px]).
 */
export function ErrorState({
  text,
  onRetry,
  tech,
}: {
  text: string;
  onRetry?: () => void;
  tech?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{text}</p>
      {onRetry && (
        <Button variant="ghost" className="mt-2" onClick={onRetry}>
          Muat ulang
        </Button>
      )}
      {tech && (
        <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer select-none font-medium">Detail teknis</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-1xs leading-relaxed text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            {tech}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Badge status terpadu (design system): mapping status -> tone + label
 * baku, supaya semua halaman menampilkan status dengan warna yang sama.
 * Status tak dikenal: tone gray, label = nilai mentah (aman).
 * `tone`/`label` = override eksplisit (mis. jumlah dinamis di atas status
 * baku, atau warna khusus tak termasuk map).
 */
const STATUS_MAP: Record<
  string,
  { tone: 'blue' | 'amber' | 'green' | 'red' | 'gray' | 'maroon' | 'gold'; label: string }
> = {
  reported: { tone: 'green', label: 'Sudah Dilaporkan' },
  unreported: { tone: 'amber', label: 'Belum Dilaporkan' },
  // Piutang / Hutang
  open: { tone: 'amber', label: 'Belum Lunas' },
  settled: { tone: 'green', label: 'Lunas' },
  overdue: { tone: 'red', label: 'Tunggak' },
  // Konsinyasi
  active: { tone: 'green', label: 'Aktif' },
  done: { tone: 'gray', label: 'Selesai' },
  // Produk stok
  habis: { tone: 'red', label: 'Habis' },
  tipis: { tone: 'amber', label: 'Tipis' },
  aman: { tone: 'green', label: 'Aman' },
  // Zakat
  wajib: { tone: 'amber', label: 'Wajib' },
  belum: { tone: 'gray', label: 'Belum Wajib' },
  provisional: { tone: 'blue', label: 'Provisional' },
  // Shift
  running: { tone: 'green', label: 'Buka' },
  closed: { tone: 'gray', label: 'Tutup' },
};

type BadgeTone = 'blue' | 'amber' | 'green' | 'red' | 'gray' | 'maroon' | 'gold';

export function StatusBadge({
  status,
  tone,
  label,
}: {
  status: string;
  tone?: BadgeTone;
  label?: string;
}) {
  const m = STATUS_MAP[status] ?? { tone: 'gray' as BadgeTone, label: status };
  return <Badge tone={tone ?? m.tone}>{label ?? m.label}</Badge>;
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
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Memuat data…</p>
    </div>
  );
}

/**
 * TermTip (UX-3): tooltip penjelasan istilah teknis/istilah keislaman
 * (HPP, Nisab, Haul, Ujrah, dll.) di samping label. Hover = buka,
 * klik/tap = pin (mobile); ESC / klik luar = tutup. Posisi otomatis:
 * elemen di separuh kanan layar → anchor `right` (tooltip ke kiri),
 * separuh kiri → anchor `left` (tooltip ke kanan). Deteksi via
 * getBoundingClientRect saat buka (sekali, murah).
 */
export function TermTip({
  term,
  tip,
  children,
}: {
  term?: string;
  tip: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Pinned (klik/tap) vs hover: tooltip harus tetap terbuka setelah
  // kursor keluar dari area trigger bila mode pinned.
  const [pinned, setPinned] = useState(false);
  // anchor: 'left' = tooltip di kanan elemen; 'right' = di kiri elemen.
  const [anchor, setAnchor] = useState<'left' | 'right'>('left');
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) {
      setPinned(false);
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openNow = () => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      // Elemen di separuh kanan viewport → tooltip merapat ke kanan
      // (anchor right) agar tak meluber keluar layar.
      setAnchor(r.left > window.innerWidth / 2 ? 'right' : 'left');
    }
    setOpen(true);
  };

  return (
    <span className="relative inline-block align-baseline" ref={ref}>
      {children ?? <span className="font-semibold">{term}</span>}
      <Button
        variant="link"
        icon={<CircleHelp className="h-3.5 w-3.5" />}
        aria-label={term ? `Jelaskan: ${term}` : 'Jelaskan istilah'}
        onClick={() => {
          setOpen(true);
          setPinned((v) => !v);
        }}
        onMouseEnter={openNow}
        onMouseLeave={() => {
          if (!pinned) setOpen(false);
        }}
        className="ml-1 align-middle text-slate-400 hover:text-accent-500 dark:hover:text-accent-300"
      />
      {open && (
        <span
          role="tooltip"
          className={
            'absolute top-full z-50 mt-1 max-w-[220px] rounded-lg bg-white p-2 text-xs font-normal shadow-lg ring-1 ring-slate-200 dark:bg-navy-800 dark:ring-navy-600 ' +
            (anchor === 'right' ? 'right-0' : 'left-0')
          }
        >
          {tip}
        </span>
      )}
    </span>
  );
}

/**
 * Inti api() — fetch JSON + envelope {ok, data, error}. Galat
 * di-differentiate: fetch gagal total (offline/CORS/DNS) = "Kesalahan
 * jaringan."; respons dgn badan non-JSON (mis. halaman 5xx HTML saat
 * query Turso meledak) = "Server sedang bermasalah (HTTP X)."
 * Parameter `doFetch` menentukan transport (fetchTimeout | fetchRetry).
 */
async function apiCall<T>(
  url: string,
  init: RequestInit | undefined,
  doFetch: (u: string, i: RequestInit) => Promise<Response>
): Promise<{ ok: boolean; data: T; error?: string }> {
  let res: Response;
  try {
    res = await doFetch(url, {
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

/**
 * Fetch JSON helper dengan timeout abort 10 detik (fetchTimeout) agar
 * request yang pending tidak membuat spinner nyangkut selamanya.
 * Menutup semua caller klien yang memakai api().
 */
export async function api<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T; error?: string }> {
  return apiCall(url, init, (u, i) => fetchTimeout(u, i));
}

/**
 * Varian api() dengan resilience GET (fetchRetry): 1 retry otomatis
 * (backoff 800ms) bila percobaan pertama kena jaringan putus / timeout
 * / 5xx / 429 — khas cold start Vercel + query agregat berat saat
 * dashboard/laporan pertama dibuka. Envelope & galat identik dengan
 * api(). PERUNTUKAN: pemanggil GET read-only (load awal / refresh data).
 * Jangan pakai utk aksi tombol (PATCH/DELETE/non-GET) — fetchRetry
 * memang tidak mengulang method selain GET.
 */
export async function apiRetry<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T; error?: string }> {
  return apiCall(url, init, (u, i) => fetchRetry(u, i));
}

/* ── UX-4 FASE D (D1): primitive Tabel — Table/Th/Td/Trow/TEmpty ──
   Kelas legacy .th/.td/.table-row (globals.css) dibake di sini sebagai
   Tailwind agar rules CSS-nya bisa dihapus setelah migrasi D2a/D2b.
   `Table` hanya render <table> — wrapper div (card/overflow/hidden sm:block)
   & mobile-card sm:hidden tetap milik pemanggil (sudah Tailwind murni).
   Trow menyebarkan atribut tr mentah (key, aria-hidden, style) → spacer
   row sticky-scroll (member-client) tetap bisa. Varian border:
   'top' (default, slate-100/navy-700), 'bottom' (slate-100/navy-800,
   utk zakat), 'none' (warna border custom via className, mis. panel
   rose migrate). */

const TH_CLS =
  'px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const TD_CLS = 'px-3 py-2.5 text-sm';
const TROW_BORDER: Record<'top' | 'bottom' | 'none', string> = {
  top: 'border-t border-slate-100 dark:border-navy-700',
  bottom: 'border-b border-slate-100 dark:border-navy-800',
  none: '',
};

/** Tabel dasar: `w-full` + minW (utilitas lebar, mis. 'min-w-[36rem]')
 *  + stickyHead utk tabel import (migrate-client). */
export function Table({
  minW,
  stickyHead,
  className,
  children,
}: {
  minW?: string;
  stickyHead?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = [
    'w-full',
    minW ?? '',
    stickyHead
      ? '[&_thead]:sticky [&_thead]:top-0 [&_thead]:bg-slate-100 dark:[&_thead]:bg-navy-800'
      : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return <table className={cls}>{children}</table>;
}

/** Sel header — padanan rule .th. className merge (mis. 'text-right', 'w-8'). */
export function Th({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return <th className={[TH_CLS, className ?? ''].filter(Boolean).join(' ')}>{children}</th>;
}

/** Sel isi — padanan rule .td. colSpan utk sel gabungan. */
export function Td({
  className,
  colSpan,
  children,
}: {
  className?: string;
  colSpan?: number;
  children?: React.ReactNode;
}) {
  return (
    <td colSpan={colSpan} className={[TD_CLS, className ?? ''].filter(Boolean).join(' ')}>
      {children}
    </td>
  );
}

/** Baris isi — padanan rule .table-row; hover utk tabel interaktif;
 *  border utk varian arah/warna. Sisa atribut tr (aria-hidden, style,
 *  dll) disebarkan ke <tr>. */
export function Trow({
  hover,
  border = 'top',
  className,
  children,
  ...rest
}: {
  hover?: boolean;
  border?: 'top' | 'bottom' | 'none';
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  const cls = [
    TROW_BORDER[border],
    hover ? 'hover:bg-slate-50/50 dark:hover:bg-navy-800/50' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <tr {...rest} className={cls}>
      {children}
    </tr>
  );
}

/** Baris kondisi-kosong: colSpan penuh + teks tengah. Children bebas
 *  (teks polos maupun <Empty compact/> dari produk-client). */
export function TEmpty({
  colSpan,
  className,
  children,
}: {
  colSpan: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={'py-6 text-center text-sm text-slate-500 dark:text-slate-400 ' + (className ?? '')}
      >
        {children}
      </td>
    </tr>
  );
}

/* ── UX-4 FASE E (E1): primitive pill — FilterPill + TogglePill
   Chip/toggle seragam (additive; migrasi E3 memakai komponen ini):
   - FilterPill: chip rounded-full utk filter/tab (periode laporan,
     kategori POS). Inactive = border + hover bg (versi lengkap,
     termasuk dark:hover — menstandarkan micro-drift tab POS).
   - TogglePill: 2 mode — 'tinted' (toggle status produk: soft-tint
     emerald/slate, rounded-full) + 'segmented' (metode pembayaran
     POS: rounded-lg + ikon + badge nomor; accent = 'accent'|'amber').
   a11y: type default 'button' + aria-pressed; atribut button lainnya
   disebarkan (role/aria-selected utk tablist POS, title, disabled). */

type PillHTMLProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;

/** Chip filter/segmen (rounded-full). `active` = terpilih: fill accent
 *  (+ border senada utk tinggi stabil) + shadow-sm + aria-pressed. */
export function FilterPill({
  active,
  children,
  className,
  ...rest
}: PillHTMLProps & {
  active: boolean;
  children?: React.ReactNode;
}) {
  const cls = [
    'shrink-0 rounded-full px-3 py-1 text-xs font-bold transition',
    active
      ? 'border border-accent-500 bg-accent-500 text-white shadow-sm'
      : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" aria-pressed={active} {...rest} className={cls}>
      {children}
    </button>
  );
}

/** Toggle segmen/status. `mode` 'tinted' = chip status (Aktif/Nonaktif
 *  produk, rounded-full soft-tint); `mode` 'segmented' = tombol segmen
 *  (metode bayar POS, rounded-lg + ikon + badge nomor opsional).
 *  `accent` = warna fill saat aktif (segmented; 'amber' utk "Campur"). */
export function TogglePill({
  active,
  mode = 'segmented',
  accent = 'accent',
  icon,
  badge,
  children,
  className,
  ...rest
}: PillHTMLProps & {
  active: boolean;
  mode?: 'tinted' | 'segmented';
  accent?: 'accent' | 'amber';
  /** Ikon depan (lucide; kelas sizing oleh pemanggil, mis. h-3.5 w-3.5). */
  icon?: React.ReactNode;
  /** Badge kecil di kanan (segmented; mis. nomor hotkey 1-4). */
  badge?: React.ReactNode;
}) {
  const base =
    mode === 'tinted'
      ? 'rounded-full px-2.5 py-0.5 text-xs font-bold transition'
      : 'flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition';
  const state =
    mode === 'tinted'
      ? active
        ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400'
        : 'bg-slate-500/15 text-slate-500 hover:bg-slate-500/25'
      : active
        ? accent === 'amber'
          ? 'bg-amber-500 text-white shadow-sm'
          : 'bg-accent-500 text-white shadow-sm'
        : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800';
  const cls = [base, state, className ?? ''].filter(Boolean).join(' ');
  return (
    <button type="button" aria-pressed={active} {...rest} className={cls}>
      {icon}
      {children && <span className="min-w-0 truncate">{children}</span>}
      {badge != null && (
        <span className="ml-auto shrink-0 text-2xs font-extrabold opacity-60">{badge}</span>
      )}
    </button>
  );
}

