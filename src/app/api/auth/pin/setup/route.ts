import { NextResponse } from 'next/server';
import {
  currentUser,
  setupPin,
  touchSession,
  SESSION_EXP_COOKIE,
} from '@/lib/auth';

/**
 * Setup / set ulang PIN setelah login. `password` (opsional) dikirim halaman
 * setup utk aturan "PIN tidak boleh sama dengan password".
 * Berhasil: session di-refresh (last_activity + cookie pendamping).
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    pin?: string;
    confirm?: string;
    password?: string;
  };
  const pin = String(b.pin || '');
  const confirm = String(b.confirm || '');
  if (pin !== confirm) {
    return NextResponse.json({ error: 'Konfirmasi PIN tidak sama' }, { status: 400 });
  }
  const r = await setupPin(user.id, pin, b.password ? String(b.password) : undefined);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const t = await touchSession();
  const res = NextResponse.json({ ok: true });
  if (t.exp) {
    res.cookies.set(SESSION_EXP_COOKIE, t.exp.value, {
      path: '/',
      maxAge: t.exp.maxAge,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return res;
}
