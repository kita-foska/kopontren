'use client';

import { useState } from 'react';
import Image from 'next/image';

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
      const res = await fetch('/api/auth/login', {
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
        window.location.replace('/');
      }
    } catch {
      setErr('Terjadi kesalahan jaringan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grad-hero relative grid min-h-screen place-items-center overflow-hidden p-4">
      {/* Soft radial glow layers for depth */}
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
              Kopontren Al Ittihad
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-300">Kasir &amp; Pembukuan</p>
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
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !username || !password}
            className="btn-primary w-full shadow-md shadow-accent-500/20"
          >
            {busy ? 'Memproses…' : 'Masuk'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-300">
          Akun dibuat oleh Pengurus. Hubungi pengurus jika belum punya username.
        </p>
      </div>
    </div>
  );
}
