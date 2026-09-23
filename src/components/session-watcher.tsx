'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchTimeout } from '@/lib/fetch-util';

/**
 * Penjaga sesi di sisi klien (dikomponen Shell / halaman yang butuh login):
 *  - Polling /api/auth/session tiap 30 dtk; kalau idle timeout -> redirect
 *    ke /login/pin (re-auth PIN); kalau sesi hilang total -> /login.
 *  - Deteksi aktivitas (klik/ketik/scroll) lalu POST /api/auth/refresh
 *    (throttle 60 dtk) supaya sesi idle + cookie batas-hidup diperpanjang.
 */
export function SessionWatcher() {
  const router = useRouter();
  const [notice, setNotice] = useState('');
  const lastRefresh = useRef(0);
  const redirected = useRef(false);

  async function poll() {
    if (redirected.current) return;
    try {
      // Timeout 10 dtk: polling tidak boleh menggantung (cold start);
      // error/abort tetap diabaikan — polling berikutnya 30 dtk lagi.
      const res = await fetchTimeout('/api/auth/session', { cache: 'no-store' });
      if (!res.ok) return;
      const s = await res.json();
      if (redirected.current) return;
      if (s.status === 'timeout') {
        redirected.current = true;
        setNotice('Sesi Anda telah berakhir. Mengalihkan ke PIN…');
        setTimeout(() => router.replace('/login/pin'), 400);
      } else if (s.status === 'none') {
        redirected.current = true;
        router.replace('/login');
      }
    } catch {
      /* abaikan error jaringan saat polling */
    }
  }

  function onActivity() {
    if (redirected.current) return;
    const now = Date.now();
    if (now - lastRefresh.current < 60_000) return;
    lastRefresh.current = now;
    fetchTimeout('/api/auth/refresh', { method: 'POST' }).catch(() => undefined);
  }

  useEffect(() => {
    poll();
    const timer = setInterval(poll, 30_000);
    const events: (keyof WindowEventMap)[] = ['click', 'keydown', 'scroll'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!notice) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl bg-amber-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">
      {notice}
    </div>
  );
}
