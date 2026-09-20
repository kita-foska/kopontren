import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/db';
import {
  SESSION_COOKIE,
  SESSION_EXP_COOKIE,
  createSession,
  hashPassword,
  pinConfigured,
  expCookieOptions,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// ── Anti brute-force (per-instansi) ─────────────────────────────────────────
// Pembatasan percobaan login per username+IP: 10 kegagalan dalam 15 menit
// -> kunci 15 menit. In-memory (tidak shared antar instance Vercel) —
// pertahanan bertingkat; PIN tetap jadi lapis kedua setelah login.
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
type LoginAttempt = { fails: number[]; lockedUntil: number };
const loginThrottle = new Map<string, LoginAttempt>();

function throttleKey(username: string, req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return username.toLowerCase() + '|' + fwd;
}

/** Kembalikan sisa detik kunci, atau null bila masih boleh mencoba. */
function loginLocked(key: string): number | null {
  const rec = loginThrottle.get(key);
  if (rec && rec.lockedUntil > Date.now()) return Math.ceil((rec.lockedUntil - Date.now()) / 1000);
  return null;
}

function recordLoginFail(key: string): void {
  const now = Date.now();
  const rec = loginThrottle.get(key) ?? { fails: [], lockedUntil: 0 };
  rec.fails = rec.fails.filter((t) => now - t < LOGIN_WINDOW_MS);
  rec.fails.push(now);
  if (rec.fails.length >= LOGIN_MAX_FAILS) {
    rec.lockedUntil = now + LOGIN_LOCK_MS;
    rec.fails = [];
  }
  loginThrottle.set(key, rec);
  // Batasi ukuran Map agar tidak tak berujung (key = username+IP unik).
  if (loginThrottle.size > 500) {
    const oldest = loginThrottle.keys().next().value;
    if (oldest !== undefined) loginThrottle.delete(oldest);
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!username || !password) {
    return NextResponse.json({ error: 'Username & password wajib diisi' }, { status: 400 });
  }
  const key = throttleKey(username, req);
  const lockSec = loginLocked(key);
  if (lockSec) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan. Coba lagi dalam ' + Math.ceil(lockSec / 60) + ' menit.' },
      { status: 429 }
    );
  }
  const d = await db();
  const user = (await d.prepare('SELECT * FROM users WHERE username = ?').get(username)) as
    | {
        id: number;
        username: string;
        display_name: string;
        role: string;
        active: number;
        salt: string;
        pass_hash: string;
      }
    | undefined;
  if (!user || user.active !== 1) {
    recordLoginFail(key); // hitung juga username tak dikenal (anti enumerasi)
    return NextResponse.json(
      { error: 'Username tidak dikenal atau akun nonaktif' },
      { status: 401 }
    );
  }
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex');
  const stored = Buffer.from(user.pass_hash, 'hex');
  const ok =
    candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
  if (!ok) {
    recordLoginFail(key);
    return NextResponse.json({ error: 'Password salah' }, { status: 401 });
  }
  loginThrottle.delete(key); // sukses -> bersihkan pencacat

  const token = await createSession(user.id);
  // Audit trail: SIAPA login (per-user + IP + user-agent). Best-effort.
  await logAudit({
    userId: user.id,
    userName: user.display_name,
    userRole: user.role,
    action: 'auth:login',
    entity: 'auth',
    entityId: null,
    req,
  });
  const res = NextResponse.json({
    ok: true,
    pin_configured: await pinConfigured(user.id),
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
    secure: process.env.NODE_ENV === 'production',
  });
  // Cookie pendamping batas hidup sesi idle (dibaca middleware utk redirect /login/pin).
  const exp = await expCookieOptions();
  res.cookies.set(SESSION_EXP_COOKIE, exp.value, {
    path: '/',
    maxAge: exp.maxAge,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

