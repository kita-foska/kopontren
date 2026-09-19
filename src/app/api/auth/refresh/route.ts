import { NextResponse } from 'next/server';
import { currentUser, touchSession, SESSION_EXP_COOKIE } from '@/lib/auth';

/**
 * Perpanjang sesi idle: update last_activity + set ulang cookie pendamping
 * (batas hidup). Hanya utk sesi yang masih aktif (currentUser tidak null).
 */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const r = await touchSession();
  const res = NextResponse.json({ ok: r.ok });
  if (r.exp) {
    res.cookies.set(SESSION_EXP_COOKIE, r.exp.value, {
      path: '/',
      maxAge: r.exp.maxAge,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return res;
}
