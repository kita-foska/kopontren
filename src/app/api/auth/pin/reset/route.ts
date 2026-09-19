import { NextResponse } from 'next/server';
import { currentUser, resetPin, isAdmin } from '@/lib/auth';

/**
 * Reset PIN. Admin bisa reset PIN user lain (via user_id); user reset
 * PIN-nya sendiri (setelah login). `password` opsional utk aturan
 * "PIN tidak boleh sama dengan password".
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    newPin?: string;
    confirm?: string;
    user_id?: number;
    password?: string;
  };
  const newPin = String(b.newPin || '');
  const confirm = String(b.confirm || '');
  const targetId = Number(b.user_id || user.id);
  if (targetId !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: 'Hanya admin yang bisa reset PIN user lain' }, { status: 403 });
  }
  if (newPin !== confirm) {
    return NextResponse.json({ error: 'Konfirmasi PIN tidak sama' }, { status: 400 });
  }
  const r = await resetPin(targetId, newPin, b.password ? String(b.password) : undefined);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
