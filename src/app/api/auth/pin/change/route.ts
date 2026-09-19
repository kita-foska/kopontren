import { NextResponse } from 'next/server';
import { currentUser, changePin } from '@/lib/auth';

/** Ganti PIN sendiri (wajib tahu PIN lama). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    oldPin?: string;
    newPin?: string;
    confirm?: string;
  };
  const oldPin = String(b.oldPin || '');
  const newPin = String(b.newPin || '');
  const confirm = String(b.confirm || '');
  if (!oldPin) return NextResponse.json({ error: 'PIN lama wajib diisi' }, { status: 400 });
  if (newPin !== confirm) {
    return NextResponse.json({ error: 'Konfirmasi PIN tidak sama' }, { status: 400 });
  }
  const r = await changePin(user.id, oldPin, newPin);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
