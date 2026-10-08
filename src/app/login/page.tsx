'use client';

import { useState } from 'react';
import Image from 'next/image';
import { fetchTimeout, isAbort } from '@/lib/fetch-util';
import { Button } from '@/components/ui';
import { roleHome } from '@/lib/features';


export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await fetchTimeout('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Gagal masuk. Periksa username & password.');
        return;
      }
      // Arahkan ke setup PIN bila belum punya PIN, atau diminta reset (?reset=1).
      // Password di-simpan sementara (sessionStorage) utk aturan "PIN ≠ password",
      // lalu dihapus halaman setup setelah dipakai.
      const reset = new URLSearchParams(window.location.search).get('reset') === '1';
      if (!data.pin_configured || reset) {
        sessionStorage.setItem('__kop_pw', password);
        window.location.replace('/login/pin/setup');
      } else {
        // H2: redirect role-aware — /api/auth/login membalas user.role;
        // roleHome menormalkan (member -> /member; role internal -> /).
        window.location.replace(roleHome(data.user?.role));
      }
    } catch (e) {
      setErr(isAbort(e) ? 'Waktu koneksi habis. Silakan coba lagi.' : 'Terjadi kesalahan jaringan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-bg relative grid min-h-screen place-items-center overflow-hidden p-4">
      {/* Soft radial glow layers for depth */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl" />

      <div className="fade-up card w-full max-w-sm border-white/60 bg-white/95 p-6 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-navy-900/90 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <Image
            src="/logo-kopontren.svg"
            alt="Kopontren"
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain shadow-md ring-1 ring-black/5"
          />
          <div>
            <h1 className="text-xl font-extrabold leading-tight tracking-tight text-accent-600 dark:text-accent-300">
              Kopontren AL ITTIHAD
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Kasir &amp; Pembukuan</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label" htmlFor="u">
              Username
            </label>
            <input
              id="u"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="mis. kasir1"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="p">
              Password
            </label>
            <input
              id="p"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          {err && (
            <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
              {err}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || !username || !password}
            variant="primary"
            className="w-full shadow-lg shadow-accent-500/25"
          >
            {busy ? 'Memproses…' : 'Masuk'}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
          Akun dibuat oleh Pengurus. Hubungi pengurus jika belum punya username.
        </p>
      </div>
    </div>
  );
}
