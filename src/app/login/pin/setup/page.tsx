'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { PinDots, PinPad } from '@/components/pin-pad';

/**
 * Halaman setup / reset PIN (ditempuh setelah login — `?reset`/belum ada PIN).
 * Dua langkah: ketik PIN, lalu ulangi untuk konfirmasi. Aturan "PIN ≠ password"
 * berlaku bila password tersedia (di-simpan sementara oleh halaman login).
 */
export default function PinSetupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false); // sesi valid (aktif/timeout)
  const [step, setStep] = useState<'pin' | 'confirm'>('pin');
  const [value, setValue] = useState('');
  const [pinDraft, setPinDraft] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const pwRef = useRef('');

  useEffect(() => {
    pwRef.current = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('__kop_pw') || '' : '';
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const s = await res.json();
        if (s.status === 'active' || s.status === 'timeout') setReady(true);
      } catch {
        /* tetap tampilkan UI; POST akan menolak bila sesi hilang */
      }
    })();
  }, []);

  function submit() {
    if (busy || done.current) return;
    setBusy(true);
    setErr('');
    const body: Record<string, string> = { pin: pinDraft, confirm: pinDraft };
    if (pwRef.current) body.password = pwRef.current;
    fetch('/api/auth/pin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('__kop_pw');
          done.current = true;
          router.replace('/');
        } else {
          setErr(d.error || 'Gagal menyimpan PIN.');
          setValue('');
          setStep('pin');
          setPinDraft('');
        }
      })
      .catch(() => setErr('Kesalahan jaringan.'))
      .finally(() => setBusy(false));
  }

  function keypress(d: string) {
    if (value.length >= 6) return;
    setErr('');
    setValue(value + d);
  }

  function keypressAuto() {
    if (busy) return;
    if (step === 'pin') {
      if (value.length < 4) return;
      setPinDraft(value);
      setValue('');
      setErr('');
      setStep('confirm');
    } else {
      if (value.length < 4) return;
      if (value === pinDraft) submit();
      else {
        setErr('PIN tidak sama. Silakan ulang dari awal.');
        setValue('');
        setStep('pin');
        setPinDraft('');
      }
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
              {step === 'pin' ? 'Atur PIN Anda' : 'Konfirmasi PIN'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              4–6 digit, untuk masuk cepat setelah sesi entek
            </p>
          </div>
        </div>

        {!ready && (
          <div className="space-y-4">
            <p className="text-center text-sm text-slate-600 dark:text-slate-300">
              Memeriksa sesi… bila tidak dilanjutkan, silakan login.
            </p>
            <button
              className="btn-ghost w-full"
              onClick={() => (window.location.href = '/login?reset=1')}
            >
              Ke Login
            </button>
          </div>
        )}

        {ready && (
          <>
            <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              {step === 'pin' ? 'PIN' : 'Ulangi PIN'}
            </div>
            <PinDots value={value} maxLength={6} error={!!err} />
            <PinPad
              onKey={keypress}
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
              onClick={() => keypressAuto()}
            >
              {busy ? 'Menyimpan…' : step === 'pin' ? 'Lanjut' : 'Simpan'}
            </button>
            {err && (
              <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
                {err}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
