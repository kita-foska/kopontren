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
  normRole,
  parseUserRoles,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { clientIp } from '@/lib/client-ip';
import { createLoginThrottle } from '@/lib/login-throttle';

// Fungsi ini bisa memicu migrasi skema Turso (v31) pada cold start:
// fullInit + rebuild 3 tabel + retry SQLITE_BUSY bisa >60 detik
// (limit default). maxDuration per-route (cara resmi Next.js App
// Router; glob vercel.json untuk fungsi App Router tak valid ->
// gagal deploy). Hobby/Pro: <= 300s. 2026-10-19: dinaikkan 60 -> 90
// (headroom utk migration + retry; klien login menunggu <=90s).
export const maxDuration = 90;

// -- Anti brute-force (W18-B: modul hermetis src/lib/login-throttle.ts) --
// Lapis L1 (existing): 10 gagal / 15 mnt / username+IP -> kunci 15 mnt.
// Lapis L2 (W18-B): 5 gagal / 15 mnt / IP (lepas username) -> kunci IP
// 15 mnt -- menutup brute-force yang gonta-ganti username dari IP sama.
// In-memory per-instansi (pertahanan bertingkat; PIN tetap lapis kedua).
// Diuji hermetis: scripts/test-login-throttle.ts.
const throttle = createLoginThrottle();

/** Cek kedua lapis (L2 per-IP duluan, lalu L1): detik sisa kunci;
 *  null = masih boleh mencoba. */
function loginLockedSec(username: string, req: Request): number | null {
  const ip = clientIp(req);
  const ipRemain = throttle.ipLockRemainingMs(ip);
  if (ipRemain > 0) return Math.ceil(ipRemain / 1000);
  const userRemain = throttle.userLockRemainingMs(username, ip);
  if (userRemain > 0) return Math.ceil(userRemain / 1000);
  return null;
}

function recordLoginFail(username: string, req: Request): void {
  throttle.recordFailure(username, clientIp(req));
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!username || !password) {
    return NextResponse.json({ error: 'Username & password wajib diisi' }, { status: 400 });
  }
  const lockSec = loginLockedSec(username, req);
  if (lockSec) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan. Coba lagi dalam ' + Math.max(1, Math.ceil(lockSec / 60)) + ' menit.' },
      { status: 429 }
    );
  }
  let d: Awaited<ReturnType<typeof db>>;
  try {
    d = await db();
  } catch (e) {
    // Kegagalan init/migrasi/Turso (global, bukan salah user): dulu bocor
    // sebagai 500 body KOSONG -> klien res.json() throw -> "kesalahan
    // jaringan". Sekarang balas JSON eksplisit + log server (Vercel).
    console.error('[api/auth/login] db() gagal:', e);
    return NextResponse.json(
      { error: 'Server sedang bermasalah (database). Silakan coba beberapa saat lagi.' },
      { status: 500 }
    );
  }
  const user = (await d.prepare('SELECT * FROM users WHERE username = ?').get(username)) as
    | {
        id: number;
        username: string;
        display_name: string;
        role: string;
        roles: string | null;
        active: number;
        salt: string;
        pass_hash: string;
      }
    | undefined;
  if (!user || user.active !== 1) {
    recordLoginFail(username, req); // hitung juga username tak dikenal (anti enumerasi)
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
    recordLoginFail(username, req);
    return NextResponse.json({ error: 'Password salah' }, { status: 401 });
  }
  throttle.recordSuccess(username, clientIp(req)); // sukses -> bersihkan pencacat L1+L2

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
  const userRole = normRole(user.role);
  const res = NextResponse.json({
    ok: true,
    pin_configured: await pinConfigured(user.id),
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: userRole,
      primary_role: userRole,
      // M1: daftar role yang dimiliki; role aktif awal = primary (keputusan M1 #3).
      roles: parseUserRoles(user.roles, userRole),
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

