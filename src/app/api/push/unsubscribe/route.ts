import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser } from '@/lib/auth';
import { canReceiveNotif } from '@/lib/notify-scope';

/**
 * POST /api/push/unsubscribe -- hapus push subscription user.
 * Body: { endpoint: string }.
 * W13 B2: semua role penerima (admin, manajer, pengurus, kasir).
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canReceiveNotif(user.role)) {
    return NextResponse.json({ error: 'Role tidak menerima notifikasi' }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = String(b.endpoint || '').trim();
  if (!endpoint) return NextResponse.json({ error: 'endpoint tidak valid' }, { status: 400 });
  const d = await db();
  await d
    .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(user.id, endpoint);
  return NextResponse.json({ ok: true });
}
