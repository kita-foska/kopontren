import { NextResponse } from 'next/server';
import { currentUser, isAdmin } from '@/lib/auth';
import { NOTIFY_KEYS, notify } from '@/lib/notify';

/**
 * POST /api/notifications/send — admin kirim notifikasi manual
 * (in-app + push sesuai prefensi). Body: { type?, title, message, link? }.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    type?: string;
    title?: string;
    message?: string;
    link?: string;
  };
  const title = String(b.title || '').trim();
  const message = String(b.message || '').trim();
  if (!title || !message) {
    return NextResponse.json({ error: 'title & message wajib' }, { status: 400 });
  }
  const type = b.type && NOTIFY_KEYS.includes(b.type) ? b.type : 'report_daily';
  const res = await notify({ type, title, message, link: b.link || undefined });
  return NextResponse.json({ ok: res.ok, inApp: res.inApp, push: res.push, error: res.error });
}
