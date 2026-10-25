import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import {
  SESSION_COOKIE,
  SESSION_EXP_COOKIE,
  createSession,
  expCookieOptions,
  normRole,
  pinConfigured,
} from '@/lib/auth';
import { roleHome } from '@/lib/features';
import { logAudit } from '@/lib/audit';
import { clientIp } from '@/lib/client-ip';
import {
  OAUTH_STATE_COOKIE,
  callbackUri,
  consumeOnce,
  emailDomainAllowed,
  exchangeCodeForToken,
  fetchGoogleUser,
  googleAuthEnabled,
} from '@/lib/oauth-google';

/**
 * W12 (v34): langkah terakhir Google OAuth (alur manual, zero dependensi).
 *
 * Pintu masuk, BUKAN sumber kredensial -- tashih amanah (ruling Gus Fi via
 * DeepSeek):
 *  1. state (nonce anti-CSRF) wajib cocok dgn cookie httpOnly; pasangan
 *     (state, code) satu-kali-pakai (anti-replay, in-memory per instance
 *     + validasi single-use code oleh Google).
 *  2. Domain email wajib masuk allowlist GOOGLE_ALLOWED_DOMAINS
 *     (fail-closed: tanpa allowlist tak ada yang lolos).
 *  3. Username = email (keputusan audit). Akun HARUS sudah dibuat oleh
 *     Admin (tanpa auto-create) DAN users.allow_google = 1 (gate amanah;
 *     OFF default).
 *
 * Setelah lolos semua gate: SESI SAMA PERSIS jalur password (createSession
 * + 2 cookie session + idle exp + audit) -> PIN idle re-auth, role guard,
 * session cache & middleware tak tersentuh. Redirect tujuan mengikuti
 * PIN-nya (belum set -> /login/pin/setup). Throttle per-IP 10x/15m
 * (pola api/auth/login).
 */

// Throttle per-IP: 10 kegagalan dlm 15 mnt -> kunci 15 mnt (sama dgn
// api/auth/login; lapisan anti brute-force utk pintu Google).
const googleFails = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60_000;

function googleThrottleCheck(ip: string): 'ok' | 'locked' {
  const fails = googleFails.get(ip);
  if (!fails) return 'ok';
  const now = Date.now();
  const recent = fails.filter((t) => now - t < WINDOW_MS);
  const lockedUntil = recent.length >= MAX_FAILS ? now - WINDOW_MS + LOCK_MS : 0;
  if (recent.length >= MAX_FAILS && now < lockedUntil) return 'locked';
  if (recent.length !== fails.length) googleFails.set(ip, recent);
  return 'ok';
}

function googleThrottleRecordFail(ip: string) {
  const fails = googleFails.get(ip) ?? [];
  fails.push(Date.now());
  googleFails.set(ip, fails.slice(-100));
}

function errRedirect(req: Request, code: string): NextResponse {
  return NextResponse.redirect(new URL('/login?google_err=' + code, req.url));
}

export async function GET(req: Request) {
  if (!googleAuthEnabled()) return errRedirect(req, 'disabled');

  const url = new URL(req.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';

  // (a) state wajib ada + cocok dgn cookie (anti-CSRF).
  if (!state || !code) return errRedirect(req, 'invalid');
  const jar = await cookies();
  const stateCookie = jar.get(OAUTH_STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== state) return errRedirect(req, 'invalid');

  // (b) Anti-replay: pasangan (state, code) hanya boleh dipakai sekali.
  const replayKey = crypto.createHash('sha256').update('g|' + state + '|' + code).digest('hex');
  if (!consumeOnce(replayKey)) return errRedirect(req, 'invalid');

  // Throttle per-IP (fail fast sebelum round-trip Google).
  const ip = clientIp(req);
  if (googleThrottleCheck(ip) === 'locked') return errRedirect(req, 'rate_limited');

  // (c) Tukar code -> token, lalu profil Google.
  const redirectUri = callbackUri(req);
  const token = await exchangeCodeForToken({
    code,
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri,
  });
  if (!token) {
    googleThrottleRecordFail(ip);
    return errRedirect(req, 'google_failed');
  }
  const gu = await fetchGoogleUser(token);
  if (!gu || !gu.email) {
    googleThrottleRecordFail(ip);
    return errRedirect(req, 'google_failed');
  }

  // (d) Domain allowlist (fail-closed).
  if (!emailDomainAllowed(gu.email)) {
    googleThrottleRecordFail(ip);
    return errRedirect(req, 'domain');
  }

  // (e) Cari akun lokal: username = email (tanpa auto-create).
  const d = await db();
  const user = (await d
    .prepare(
      `SELECT id, username, role, active, allow_google, oauth_sub
       FROM users WHERE username = ?`
    )
    .get(gu.email)) as
    | {
        id: number;
        username: string;
        role: string;
        active: number;
        allow_google: number;
        oauth_sub: string | null;
      }
    | undefined;
  if (!user || user.active !== 1) {
    googleThrottleRecordFail(ip);
    return errRedirect(req, 'unknown');
  }

  // (f) Gate amanah: admin harus mengizinkan akun ini utk login Google.
  if (user.allow_google !== 1) {
    googleThrottleRecordFail(ip);
    return errRedirect(req, 'not_allowed');
  }

  // (g) Rekam identitas Google (last-login) + bersihkan throttle.
  await d.prepare('UPDATE users SET oauth_sub = ? WHERE id = ?').run(gu.sub, user.id);
  googleFails.delete(ip);

  const session = await createSession(user.id);
  await logAudit({
    userId: user.id,
    userName: user.username,
    userRole: normRole(user.role),
    action: 'auth:google-login',
    entity: 'auth',
    entityId: null,
    fieldChanges: { oauth_sub: { before: user.oauth_sub ?? null, after: gu.sub } },
    req,
  });

  // (h) SESI PERSIS jalur password -> arsitektur session tak berubah.
  const userRole = normRole(user.role);
  const redirectUrl = (await pinConfigured(user.id)) ? roleHome(userRole) : '/login/pin/setup';
  const res = NextResponse.redirect(new URL(redirectUrl, req.url));
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
  const exp = await expCookieOptions();
  res.cookies.set(SESSION_EXP_COOKIE, exp.value, {
    path: '/',
    maxAge: exp.maxAge,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.cookies.set(OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return res;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 30;