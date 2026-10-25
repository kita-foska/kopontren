'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, MessageCircle } from 'lucide-react';
import { fetchTimeout, isAbort } from '@/lib/fetch-util';
import { shareWa } from '@/lib/rekap';
import { Button } from '@/components/ui';
import { roleHome } from '@/lib/features';

// W12 (v34): pesan galat alur Google OAuth (?google_err=<code>, dipasang
// oleh /api/auth/google/redirect & /callback). Nilai code tak membeber
// detail teknis; pesan ramah & komunikatif.
const GOOGLE_ERR: Record<string, string> = {
  disabled: 'Login Google belum diaktifkan di server. Hubungi admin.',
  unknown: 'Akun ini belum terdaftar. Hubungi pengurus untuk membuat akun (username = email Anda).',
  not_allowed: 'Akun ini belum diizinkan login Google oleh admin. Hubungi pengurus.',
  domain: 'Domain email Google Anda tidak diizinkan untuk sistem ini.',
  google_failed: 'Verifikasi Google gagal. Silakan ulangi dari tombol Google.',
  invalid: 'Permintaan Google tidak valid. Silakan ulangi dari tombol Google.',
  rate_limited: 'Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit.',
};


export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Eye toggle (GO CODE tashih Wave 11, 2026-10-24): show/hide password.
  const [showPw, setShowPw] = useState(false);
  // W12 (v34): pesan galat alur Google (dari ?google_err=<code>). Diisi
  // setelah hydrate (tidak dibaca saat render awal -> tanpa mismatch).
  const [googleErr, setGoogleErr] = useState('');
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('google_err');
    if (code && GOOGLE_ERR[code]) setGoogleErr(GOOGLE_ERR[code]);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      // 2026-10-19 (v31): timeout 90 detik (bukan default 10 detik
      // fetchTimeout) -- cold start pertama setelah pembaruan bisa
      // menjalankan migrasi skema Turso (fullInit + rebuild 3 tabel)
      // yang melebihi 10 detik; abort dini menampilkan "Waktu
      // koneksi habis" padahal server sedang bekerja.
      const res = await fetchTimeout(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        },
        90_000
      );
      // 5xx dari Vercel kadang BODI KOSONG (error route tak tertangkap ->
      // empty 500). res.json() yang reject dulu tampil "kesalahan jaringan"
      // (menyesatkan: galat server, bukan jaringan).
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        pin_configured?: boolean;
        user?: { role?: string };
      } | null;
      if (!res.ok) {
        if (data?.error) {
          setErr(data.error);
          return;
        }
        setErr(
          res.status >= 500
            ? 'Server sedang bermasalah (' + res.status + '). Silakan coba lagi beberapa saat.'
            : 'Gagal masuk. Periksa username & password.'
        );
        return;
      }
      if (!data) {
        setErr('Respon server tidak valid (' + res.status + '). Silakan coba lagi.');
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
      setErr(
        isAbort(e)
          ? 'Waktu koneksi habis (>90 dtk). Sesaat setelah pembaruan sistem bisa lambat -- silakan coba lagi.'
          : 'Terjadi kesalahan jaringan.'
      );
    } finally {
      setBusy(false);
    }
  }

  // Wave 11 UI/UX P1: Bantuan WA di halaman login -- deep-link wa.me
  // reuse shareWa (lib/rekap, pola low-stock alert). Nomor toko dari
  // /api/settings bila dapat; bila tak auth/offline -> fallback share
  // sheet (shareWa tanpa nomor).
  async function helpWa() {
    let phone = '';
    try {
      const r = await fetch('/api/settings');
      if (r.ok) {
        const d = (await r.json().catch(() => null)) as {
          data?: { store_phone?: string };
        };
        phone = d?.data?.store_phone || '';
      }
    } catch {
      /* offline -> share sheet */
    }
    shareWa('Assalamu\'alaikum, saya membutuhkan bantuan Kopontren.', phone);
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
            <div className="relative">
              <input
                id="p"
                className="input pr-10"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="........"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                title={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-navy-700 dark:hover:text-slate-200"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
        {/* W12 (v34): pintu Google OAuth (alur manual, zero dependensi).
            Tashih amanah: default OFF per akun (users.allow_google=0) +
            domain allowlist (GOOGLE_ALLOWED_DOMAINS); tanpa auto-create
            akun. Sesi yg dihasilkan PERSIS jalur password. */}
        <div className="mt-5">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200 dark:bg-navy-700"></div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              atau
            </span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-navy-700"></div>
          </div>
          <a
            href="/api/auth/google/redirect"
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 dark:hover:bg-navy-700"
          >
            {/* G monokrom (inline SVG, currentColor -- tak bergantung
                library ikon; brand Google tak ada di lucide). */}
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
              <path
                d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M12 12h7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
            Masuk dengan Google
          </a>
          {googleErr && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300"
            >
              {googleErr}
            </p>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
          Akun dibuat oleh Pengurus. Hubungi pengurus jika belum punya username.
        </p>
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Butuh bantuan?{' '}
          <button
            type="button"
            onClick={helpWa}
            className="inline-flex items-center gap-1 font-semibold text-accent-700 hover:text-accent-500 dark:text-accent-300 dark:hover:text-accent-200"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Hubungi via WhatsApp
          </button>
        </p>
      </div>
    </div>
  );
}
