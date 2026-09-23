'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { PinDots, PinPad } from '@/components/pin-pad';
import { fetchTimeout, isAbort } from '@/lib/fetch-util';

type PUser = { username: string; display_name: string };
type Session = {
  status: 'none' | 'timeout' | 'active';
  user?: PUser;
};

export default function PinReauthPage() {
  const router = useRouter();
  // 'error' = gagal/tidak bisa cek sesi (jaringan/timeout/server 5xx) —
  // dibedakan dari 'timeout' status SESI (idle habis, perlu PIN).
  const [status, setStatus] = useState<'loading' | 'none' | 'timeout' | 'error'>('loading');
  const [user, setUser] = useState<PUser | null>(null);
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const checkSession = useCallback(async () => {
    setStatus('loading');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Tanpa timeout, fetch yang pending selamanya membuat spinner
    // "Memeriksa sesi…" nyangkut (mis. Vercel cold start + Turso lambat).
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const s: Session = await res.json();
      if (s.status === 'active') {
        done.current = true;
        router.replace('/');
        return;
      }
      if (s.status === 'timeout') {
        setUser(s.user || null);
        setStatus('timeout');
        return;
      }
      setStatus('none');
    } catch {
      // Gagal (timeout/jaringan/respon tak valid) -> jangan stuck di loading.
      if (!done.current) setStatus('error');
    } finally {
      clearTimeout(timer);
    }
  }, [router]);

  useEffect(() => {
    checkSession();
    return () => abortRef.current?.abort();
  }, [checkSession]);

  async function verify() {
    if (value.length < 4 || busy || done.current) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetchTimeout('/api/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: value }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        done.current = true;
        router.replace('/');
        return;
      }
      if (data.session_destroyed || data.needLogin) {
        // 3x salah / PIN belum ada -> sesi diakhiri, kembali full login + set PIN.
        setErr(data.error || 'Sesi diakhiri. Silakan login ulang.');
        done.current = true;
        window.location.replace('/login?reset=1');
        return;
      }
      setErr(
        data.error || 'PIN salah' + (data.remaining ? ` · Sisa ${data.remaining} percobaan` : '')
      );
      setValue('');
    } catch (e) {
      setErr(isAbort(e) ? 'Waktu koneksi habis. Silakan coba lagi.' : 'Kesalahan jaringan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grad-hero relative grid min-h-screen place-items-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl" />

      <div className="fade-up card w-full max-w-sm border-white/40 bg-white/85 p-6 backdrop-blur-xl dark:border-white/10 dark:bg-white/10 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <Image
            src="/logo-kopontren.svg"
            alt="Kopontren"
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain shadow-sm ring-1 ring-black/5"
          />
          <div>
            <h1 className="text-lg font-extrabold leading-tight tracking-tight text-accent-700 dark:text-white">
              Verifikasi PIN
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              {user ? 'Masuk lagi tanpa password' : 'Kasir & Pembukuan'}
            </p>
          </div>
        </div>

        {status === 'loading' && (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Memeriksa sesi…
          </p>
        )}

        {status === 'none' && (
          <div className="space-y-4">
            <p className="text-center text-sm text-slate-600 dark:text-slate-300">
              Sesi tidak ditemukan. Silakan login dengan username &amp; password.
            </p>
            <button
              className="btn-primary w-full shadow-md shadow-accent-500/20"
              onClick={() => (window.location.href = '/login')}
            >
              Ke Login
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <p className="text-center text-sm text-slate-600 dark:text-slate-300">
              Gagal memeriksa sesi — jaringan lambat atau server belum siap
              (timeout 10 dtk).
            </p>
            <button
              className="btn-primary w-full shadow-md shadow-accent-500/20"
              onClick={() => {
                setErr('');
                setValue('');
                checkSession();
              }}
            >
              Coba Lagi
            </button>
            <button
              className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => (window.location.href = '/login')}
            >
              Ke Login
            </button>
          </div>
        )}

        {status === 'timeout' && (
          <>
            <p className="mb-4 text-center text-sm text-slate-600 dark:text-slate-300">
              Sesi Anda telah berakhir.
              {user?.display_name ? ` Halo, ${user.display_name}!` : ''} Masukkan PIN untuk
              melanjutkan.
            </p>
            <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              PIN
            </div>
            <PinDots value={value} maxLength={6} error={!!err} />
            <PinPad
              onKey={(d) => {
                if (value.length >= 6) return;
                setErr('');
                setValue(value + d);
              }}
              onBackspace={() => {
                setErr('');
                setValue(value.slice(0, -1));
              }}
              onClear={() => {
                setErr('');
                setValue('');
              }}
              disabled={busy}
            />
            <button
              className="btn-primary mt-4 w-full shadow-md shadow-accent-500/20"
              disabled={busy || value.length < 4}
              onClick={verify}
            >
              {busy ? 'Memeriksa…' : 'Lanjutkan'}
            </button>
            {err && (
              <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
                {err}
              </p>
            )}
            <button
              className="mt-3 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => (window.location.href = '/login?reset=1')}
            >
              Lupa PIN? Login dengan password
            </button>
          </>
        )}
      </div>
    </div>
  );
}
