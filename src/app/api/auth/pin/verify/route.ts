import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  findSessionUser,
  verifyPin,
  destroySession,
  touchSession,
  SESSION_COOKIE,
  SESSION_EXP_COOKIE,
} from '@/lib/auth';

/**
 * Verifikasi PIN setelah sesi idle timeout. Membaca sesi tanpa cek idle
 * (findSessionUser) agar user bisa re-auth. 3x salah -> sesi diakhiri
 * (auto-logout) + kunci PIN 5 menit; klien diminta login ulang.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { pin?: string };
  const pin = String(b.pin || '');
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  const user = await findSessionUser();
  if (!user) {
    // Tidak ada baris sesi sama sekali (logout / tidak ada cookie).
    return NextResponse.json(
      { error: 'Sesi tidak ditemukan. Silakan login.', needLogin: true },
      { status: 401 }
    );
  }

  const r = await verifyPin(user.id, pin);
  if (r.ok) {
    const t = await touchSession();
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
      },
    });
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

  if (r.sessionDestroyed) {
    // Percobaan habis (atau PIN belum diset): akhiri sesi, kunci 5 menit.
    await destroySession(token);
    const res = NextResponse.json({
      ok: false,
      error: r.error,
      needLogin: true,
      session_destroyed: true,
      locked_min: r.lockedMin,
    });
    res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    res.cookies.set(SESSION_EXP_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  if (r.lockedMin) {
    return NextResponse.json({
      ok: false,
      error: r.error,
      locked_min: r.lockedMin,
    });
  }

  return NextResponse.json({ ok: false, error: r.error, remaining: r.remaining });
}
