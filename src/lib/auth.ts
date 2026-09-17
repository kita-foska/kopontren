import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/db';

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

export const SESSION_COOKIE = 'kopontren_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

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
  const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toISOString();
  const d = await db();
  await d
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, expires);
  return token;
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  const d = await db();
  await d.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

/** Resolve the current user from the request cookie. Returns null when no valid session. */
export async function currentUser(): Promise<AppUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const now = new Date().toISOString();
  const d = await db();
  const row = (
    await d.prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.active, u.pw_default, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    ).get(sha256(token))
  ) as (AppUser & { expires_at: string }) | undefined;
  if (!row || row.active !== 1 || row.expires_at < now) return null;
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

export function isAdmin(user: AppUser | null): boolean {
  return user?.role === 'admin';
}
