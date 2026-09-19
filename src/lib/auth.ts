import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { db, getSettings } from '@/db';

export type Role = 'admin' | 'pengurus' | 'kasir';

export type AppUser = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  /** pengurus = may manage everything except Pengguna & Data (admin = full). */
  manager: boolean;
  active: number;
  pw_default: number;
};

/** Normalize a stored role value; legacy 'admin' stays 'admin' (full access). */
export function normRole(v: unknown): Role {
  return v === 'admin' || v === 'pengurus' || v === 'kasir' ? v : 'kasir';
}

export function isManager(user: AppUser | null | undefined): boolean {
  return user != null && (user.role === 'admin' || user.role === 'pengurus');
}

/** admin murni (role 'admin'), tanpa pengurus — proteksi fitur sensitif
 *  (reset PIN user lain, ubah session_timeout, dll). */
export function isAdmin(user: AppUser | null | undefined): boolean {
  return user != null && user.role === 'admin';
}

export const SESSION_COOKIE = 'kopontren_session';
/**
 * Cookie pendamping (TIDAK httpOnly, terbaca middleware edge + klien) yang
 * menandai "batas hidup" sesi idle: maxAge = session_timeout. Diset saat
 * login / verify PIN / refresh. Saat cookie ini hilang/masa aktif habis,
 * middleware edge mengarahkan ke /login/pin (re-auth tanpa password).
 * Nilai = ISO timestamp batas; maxAge = sisa detik hingga batas.
 */
export const SESSION_EXP_COOKIE = 'kopontren_session_exp';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

// ── PIN (4-6 digit, scrypt; lockout setelah N kegagalan) ──
export const PIN_MAX_ATTEMPTS = 3;
export const PIN_LOCK_SECONDS = 300; // 5 menit

export function hashPassword(pw: string, salt: string): string {
  return crypto.scryptSync(pw, salt, 32).toString('hex');
}

export function randomSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Create a session row for user; returns the raw token (store in cookie). */
export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expires = new Date(now + COOKIE_MAX_AGE * 1000).toISOString();
  const d = await db();
  await d
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at, last_activity) VALUES (?, ?, ?, ?)')
    .run(sha256(token), userId, expires, nowIso);
  sessionCache.delete(sha256(token));
  return token;
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  sessionCache.delete(sha256(token));
  const d = await db();
  await d.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

/**
 * Cache sesi in-memory (30 detik) per hash token.
 * Setiap request (RSC + API) sebelumnya melakukan 1 round-trip Turso
 * (JOIN sessions×users, ±150-250 ms via HTTP) — itu penyumbang utama
 * waktu response halaman (mis. /admin/belanja ≈ 590-600 ms).
 * Dengan cache, request berikutnya (prefetch, navigasi, API) menyelesaikan
 * auth tanpa query DB sama sekali.
 * Catatan keamanan:
 * - destroySession menghapus entri cache seketika (logout di instance yang
 *   sama langsung berkekuatan).
 * - Di Vercel (multi-instance), instance lain bisa menyajikan sesi yang baru
 *   di-logout hingga TTL 30 s — batas yang aman untuk aplikasi internal.
 */
type CachedSession = { user: AppUser; at: number };
const sessionCache = new Map<string, CachedSession>();
const SESSION_CACHE_TTL_MS = 30_000;

function readSessionCache(key: string): AppUser | null | undefined {
  const entry = sessionCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at >= SESSION_CACHE_TTL_MS) {
    sessionCache.delete(key);
    return undefined;
  }
  return entry.user;
}

/** Resolve the current user from the request cookie. Returns null when no valid session. */
export async function currentUser(): Promise<AppUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const key = sha256(token);
  const hit = readSessionCache(key);
  if (hit !== undefined) return hit; // null atau user, segar < 30 dtk
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const d = await db();
  const row = (
    await d.prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.active, u.pw_default, s.expires_at, s.last_activity
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    ).get(key)
  ) as
    | (AppUser & { expires_at: string; last_activity: string | null })
    | undefined;
  if (!row || row.active !== 1 || row.expires_at < nowIso) {
    sessionCache.delete(key);
    return null;
  }
  // Idle timeout: tanpa aktivitas > session_timeout -> sesi entek.
  // Baris lama (last_activity NULL, sebelum migrasi) dianggap aktif sejak now.
  let lastTs: number;
  if (row.last_activity) {
    const p = Date.parse(row.last_activity);
    lastTs = Number.isFinite(p) ? p : now;
  } else {
    lastTs = now;
  }
  if (now - lastTs > (await getSessionTimeoutSec()) * 1000) {
    sessionCache.delete(key);
    return null; // idle entek -> perlu re-auth (PIN atau login)
  }
  // Refresh last_activity (throttle: hanya bila > 60 dtk atau masih NULL).
  if (!row.last_activity || now - lastTs > 60_000) {
    await d
      .prepare('UPDATE sessions SET last_activity = ? WHERE token_hash = ?')
      .run(nowIso, key)
      .catch(() => undefined);
  }
  const role = normRole(row.role);
  const user: AppUser = {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role,
    manager: role === 'admin' || role === 'pengurus',
    active: row.active,
    pw_default: row.pw_default,
  };
  // Eviksi sederhana: instance yang hidup lama tidak boleh menumpuk entri.
  if (sessionCache.size >= 500) sessionCache.clear();
  sessionCache.set(key, { user, at: Date.now() });
  return user;
}


// ─────────────────────────────────────────────────────────────────────────────
// Idle-timeout sesi + re-auth PIN
// ─────────────────────────────────────────────────────────────────────────────

/** Nilai `session_timeout` (detik) dari settings, dengan cache 60 dtk. */
let _stCache: { at: number; v: number } | null = null;
const ST_CACHE_TTL_MS = 60_000;
export async function getSessionTimeoutSec(): Promise<number> {
  if (_stCache && Date.now() - _stCache.at < ST_CACHE_TTL_MS) return _stCache.v;
  let v = 3600;
  try {
    const s = await getSettings();
    const n = Number(s.session_timeout);
    if (Number.isFinite(n) && n >= 60 && n <= COOKIE_MAX_AGE) v = Math.round(n);
  } catch {
    /* pakai default */
  }
  _stCache = { at: Date.now(), v };
  return v;
}

/** Parameter cookie pendamping (batas hidup sesi idle) utk login/verify/refresh. */
export async function expCookieOptions(): Promise<{ value: string; maxAge: number }> {
  const timeout = await getSessionTimeoutSec();
  const deadline = Date.now() + timeout * 1000;
  return { value: new Date(deadline).toISOString(), maxAge: timeout };
}

async function currentToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

type UserRow = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  active: number;
  pw_default: number;
};

async function buildUser(row: UserRow): Promise<AppUser> {
  const role = normRole(row.role);
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role,
    manager: role === 'admin' || role === 'pengurus',
    active: row.active,
    pw_default: row.pw_default,
  };
}

export type SessionStatus =
  | { status: 'none' }
  | { status: 'timeout'; user: AppUser }
  | {
      status: 'active';
      user: AppUser;
      pinConfigured: boolean;
      secondsLeft: number;
      sessionTimeout: number;
    };

/** Cek status sesi (untuk /api/auth/session + watcher klien). Tanpa cache. */
export async function checkSession(): Promise<SessionStatus> {
  const token = await currentToken();
  if (!token) return { status: 'none' };
  const key = sha256(token);
  const d = await db();
  const row = (
    await d
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.role, u.active, u.pw_default, s.expires_at, s.last_activity
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(key)
  ) as (UserRow & { expires_at: string; last_activity: string | null }) | undefined;
  if (!row || row.active !== 1 || row.expires_at < new Date().toISOString()) {
    return { status: 'none' };
  }
  const now = Date.now();
  let lastTs: number;
  if (row.last_activity) {
    const p = Date.parse(row.last_activity);
    lastTs = Number.isFinite(p) ? p : now;
  } else {
    lastTs = now;
  }
  const timeout = await getSessionTimeoutSec();
  if (now - lastTs > timeout * 1000) {
    return { status: 'timeout', user: await buildUser(row) };
  }
  return {
    status: 'active',
    user: await buildUser(row),
    pinConfigured: await pinConfigured(row.id),
    secondsLeft: Math.max(0, Math.floor((lastTs + timeout * 1000 - now) / 1000)),
    sessionTimeout: timeout,
  };
}

/** User dari session cookie tanpa cek idle (untuk re-auth PIN saat sesi entek). */
export async function findSessionUser(): Promise<AppUser | null> {
  const token = await currentToken();
  if (!token) return null;
  const d = await db();
  const row = (
    await d
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.role, u.active, u.pw_default
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(sha256(token))
  ) as UserRow | undefined;
  if (!row || row.active !== 1) return null;
  return buildUser(row);
}

/** Refresh last_activity (dipanggil tiap aktivitas/request); invalidasi cache. */
export async function touchSession(): Promise<{ ok: boolean; exp?: { value: string; maxAge: number } }> {
  const token = await currentToken();
  if (!token) return { ok: false };
  const key = sha256(token);
  const d = await db();
  const r = await d
    .prepare('UPDATE sessions SET last_activity = ? WHERE token_hash = ?')
    .run(new Date().toISOString(), key);
  if (r.changes === 0) return { ok: false };
  sessionCache.delete(key);
  const exp = await expCookieOptions();
  return { ok: true, exp };
}

// ── PIN ──
type PinRow = {
  id: number;
  user_id: number;
  pin_hash: string;
  salt: string;
  failed_attempts: number;
  locked_until: string | null;
};

/** PIN di-hash scrypt, sama persis seperti password. */
export function hashPin(pin: string, salt: string): string {
  return hashPassword(pin, salt);
}

export async function pinConfigured(userId: number): Promise<boolean> {
  const d = await db();
  const row = await d.prepare('SELECT id FROM user_pins WHERE user_id = ?').get(userId);
  return row != null;
}

/** Validasi format PIN: 4-6 digit, bukan berurutan/semua sama, tidak sama password. */
export function validatePin(pin: string, password?: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'PIN harus 4-6 digit angka';
  if (/^(\d)\1+$/.test(pin)) return 'PIN tidak boleh semua digit sama (mis. 1111, 2222)';
  const seq = (step: number) => {
    for (let i = 1; i < pin.length; i++) if (Number(pin[i]) - Number(pin[i - 1]) !== step) return false;
    return true;
  };
  if (seq(1) || seq(-1)) return 'PIN tidak boleh berurutan (mis. 1234, 4321)';
  if (password && pin === password) return 'PIN tidak boleh sama dengan password';
  return null;
}

/** Setup / reset PIN (overwrite). Dipakai first-setup, reset, dan ganti PIN. */
export async function setupPin(
  userId: number,
  pin: string,
  password?: string
): Promise<{ ok: boolean; error?: string }> {
  const err = validatePin(pin, password);
  if (err) return { ok: false, error: err };
  const salt = randomSalt();
  const nowIso = new Date().toISOString();
  const d = await db();
  await d
    .prepare(
      `INSERT INTO user_pins (user_id, pin_hash, salt, failed_attempts, locked_until, created_at, updated_at)
       VALUES (?, ?, ?, 0, NULL, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         pin_hash = excluded.pin_hash,
         salt = excluded.salt,
         failed_attempts = 0,
         locked_until = NULL,
         updated_at = excluded.updated_at`
    )
    .run(userId, hashPin(pin, salt), salt, nowIso, nowIso);
  return { ok: true };
}

/** Verifikasi PIN dengan lockout: PIN_MAX_ATTEMPTS salah -> kunci PIN_LOCK_SECONDS. */
export async function verifyPin(
  userId: number,
  pin: string
): Promise<{
  ok: boolean;
  error?: string;
  remaining?: number;
  lockedMin?: number;
  sessionDestroyed?: boolean;
}> {
  const d = await db();
  const row = (await d.prepare('SELECT * FROM user_pins WHERE user_id = ?').get(userId)) as
    | PinRow
    | undefined;
  if (!row) return { ok: false, error: 'PIN belum diset. Silakan login ulang.', sessionDestroyed: true };
  const now = Date.now();
  if (row.locked_until && Date.parse(row.locked_until) > now) {
    const mins = Math.max(1, Math.ceil((Date.parse(row.locked_until) - now) / 60000));
    return { ok: false, error: 'PIN terkunci sementara', lockedMin: mins };
  }
  const candidate = Buffer.from(hashPin(pin, row.salt), 'hex');
  const stored = Buffer.from(row.pin_hash, 'hex');
  const ok = candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
  if (ok) {
    await d
      .prepare('UPDATE user_pins SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?')
      .run(new Date().toISOString(), userId);
    return { ok: true };
  }
  const attempts = row.failed_attempts + 1;
  if (attempts >= PIN_MAX_ATTEMPTS) {
    const lockedUntil = new Date(now + PIN_LOCK_SECONDS * 1000).toISOString();
    await d
      .prepare('UPDATE user_pins SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE user_id = ?')
      .run(attempts, lockedUntil, new Date().toISOString(), userId);
    return {
      ok: false,
      error: 'PIN salah. Percobaan habis — sesi diakhiri.',
      remaining: 0,
      sessionDestroyed: true,
      lockedMin: Math.round(PIN_LOCK_SECONDS / 60),
    };
  }
  await d
    .prepare('UPDATE user_pins SET failed_attempts = ?, updated_at = ? WHERE user_id = ?')
    .run(attempts, new Date().toISOString(), userId);
  return { ok: false, error: 'PIN salah', remaining: PIN_MAX_ATTEMPTS - attempts };
}

/** Ganti PIN (wajib tahu PIN lama). */
export async function changePin(
  userId: number,
  oldPin: string,
  newPin: string
): Promise<{ ok: boolean; error?: string }> {
  const d = await db();
  const row = (await d
    .prepare('SELECT pin_hash, salt, failed_attempts, locked_until FROM user_pins WHERE user_id = ?')
    .get(userId)) as
    | { pin_hash: string; salt: string; failed_attempts: number; locked_until: string | null }
    | undefined;
  if (!row) return { ok: false, error: 'PIN lama belum diset. Gunakan reset PIN.' };
  const now = Date.now();
  if (row.locked_until && Date.parse(row.locked_until) > now) {
    const mins = Math.max(1, Math.ceil((Date.parse(row.locked_until) - now) / 60000));
    return { ok: false, error: 'PIN terkunci. Coba lagi dalam ' + mins + ' menit.' };
  }
  const cand = Buffer.from(hashPin(oldPin, row.salt), 'hex');
  const stored = Buffer.from(row.pin_hash, 'hex');
  if (cand.length !== stored.length || !crypto.timingSafeEqual(cand, stored)) {
    return { ok: false, error: 'PIN lama salah' };
  }
  return setupPin(userId, newPin);
}

/** Reset PIN (admin utk user lain / user utk diri sendiri setelah login). */
export async function resetPin(
  userId: number,
  newPin: string,
  password?: string
): Promise<{ ok: boolean; error?: string }> {
  return setupPin(userId, newPin, password);
}
