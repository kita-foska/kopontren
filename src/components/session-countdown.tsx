'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const WARN_MS = 5 * 60 * 1000; // < 5 menit -> kuning
const CRIT_MS = 1 * 60 * 1000; // < 1 menit -> merah
const SYNC_MS = 15_000; // sinkron server tiap 15 dtk

/**
 * Sisa cookie pendamping (non-httpOnly) berisi ISO batas sesi idle.
 * Diperbarui server setiap login / verify PIN / refresh (aktivitas),
 * jadi bisa dipakai utk mengisi celah antar polling API.
 */
function expCookieDeadline(): number | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)kopontren_session_exp=([^;]+)/);
  if (!m) return null;
  const ts = Date.parse(m[1]);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Countdown sisa waktu sesi idle di header.
 *  - Sumber utama: /api/auth/session (status + seconds_left) tiap 15 dtk.
 *  - Antar sinkron: interpolate detik demi detik; cookie exp jadi plafon
 *    konservatif supaya angka tidak pernah "loncat maju" setelah refresh.
 *  - < 5 menit: kuning; < 1 menit: merah + berkedip saat habis.
 *  - Sisa 0: label "Sesi berakhir" lalu redirect /login/pin (re-auth PIN);
 *    bila sesi tak ditemukan (status none) redirect /login.
 *  Note: SessionWatcher tetap jadi pengaman (poll 30 dtk) — di sini
 *  redirectnya lebih cepat (per detik) & sesuai spesifikasi.
 */
export function SessionCountdown() {
  const router = useRouter();
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const redirected = useRef(false);
  const firstSync = useRef(true);

  useEffect(() => {
    let stop = false;

    async function sync() {
      if (stop) return;
      setNow(Date.now());
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const s = await res.json();
        if (stop) return;
        if (s.status === 'active') {
          // Plafon konservatif: jangan pernah tunjukkan sisa lebih besar
          // dari cookie exp (refresh aktivitas memperbarui cookie & last_activity).
          const serverDeadline = Date.now() + s.seconds_left * 1000;
          const cookie = expCookieDeadline();
          setDeadline(cookie != null ? Math.min(serverDeadline, cookie) : serverDeadline);
        } else {
          // timeout / none: langsung anggap habis -> redirect (efek di bawah).
          setDeadline(Date.now());
        }
      } catch {
        // Jaringan mati: tetap hitung mundur dari cookie bila ada.
        const cookie = expCookieDeadline();
        if (cookie != null) setDeadline(cookie);
      } finally {
        if (!stop) firstSync.current = false;
      }
    }

    sync();
    const syncTimer = setInterval(sync, SYNC_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      stop = true;
      clearInterval(syncTimer);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sisa 0 -> redirect (setelah label "Sesi berakhir" sempat tampil).
  useEffect(() => {
    if (deadline == null || redirected.current) return;
    if (deadline - Date.now() > 0) return;
    redirected.current = true;
    const t = setTimeout(async () => {
      let target = '/login/pin';
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (res.ok) {
          const s = await res.json();
          if (s.status === 'none') target = '/login';
        }
      } catch {
        /* pakai target default */
      }
      router.replace(target);
    }, 800);
    return () => clearTimeout(t);
  }, [deadline, router]);

  if (deadline == null || firstSync.current) return null;

  const leftMs = Math.max(0, deadline - now);
  const label =
    leftMs === 0
      ? 'Sesi berakhir'
      : leftMs < 60_000
        ? `Sesi: ${Math.ceil(leftMs / 1000)} detik`
        : `Sesi: ${Math.ceil(leftMs / 60_000)} menit`;

  const cls =
    leftMs === 0
      ? 'border-rose-300 bg-rose-50 text-rose-700 animate-pulse dark:border-rose-500/50 dark:bg-rose-500/15 dark:text-rose-300'
      : leftMs < CRIT_MS
        ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/15 dark:text-rose-300'
        : leftMs < WARN_MS
          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300'
          : 'border-slate-200 text-slate-600 dark:border-navy-600 dark:text-slate-300';

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${cls}`}
      title="Sisa waktu sesi idle. Aktivitas memperpanjang sesi; habis -> verifikasi PIN."
    >
      {label}
    </span>
  );
}
