'use client';

import Image from 'next/image';
import { useState } from 'react';

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
      window.location.replace('/');
    } catch {
      setErr('Terjadi kesalahan jaringan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-navy-100 p-4 dark:bg-navy-900">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-3">
          <Image
            src="/icon-192.png"
            alt="Kopontren"
            width={64}
            height={64}
            priority
            className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain"
          />
          <div>
            <h1 className="text-lg font-extrabold leading-tight tracking-tight">
              Kopontren Al Ittihad
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Kasir & Pembukuan</p>
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
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {err}
            </p>
          )}
          <button type="submit" disabled={busy || !username || !password} className="btn-primary w-full">
            {busy ? 'Memproses…' : 'Masuk'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Akun dibuat oleh Pengurus. Hubungi pengurus jika belum punya username.
        </p>
      </div>
    </div>
  );
}
