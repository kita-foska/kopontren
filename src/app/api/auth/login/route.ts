import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/db';
import { SESSION_COOKIE, createSession, hashPassword } from '@/lib/auth';

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!username || !password) {
    return NextResponse.json({ error: 'Username & password wajib diisi' }, { status: 400 });
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
    return NextResponse.json(
      { error: 'Username tidak dikenal atau akun nonaktif' },
      { status: 401 }
    );
  }
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex');
  const stored = Buffer.from(user.pass_hash, 'hex');
  const ok =
    candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
  if (!ok) return NextResponse.json({ error: 'Password salah' }, { status: 401 });

  const token = await createSession(user.id);
  const res = NextResponse.json({
    ok: true,
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
  return res;
}

