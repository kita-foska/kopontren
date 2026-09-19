import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/ref-cache';

/**
 * POST /api/notifications/read — tandai notifikasi admin sudah dibaca.
 * Body: { ids: number[] } (pilih) atau { all: true } (semua belum dibaca).
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { ids?: number[]; all?: boolean };
  const d = await db();
  if (b.all) {
    await d
      .prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0')
      .run(user.id);
  } else if (Array.isArray(b.ids) && b.ids.length) {
    const ids = b.ids.map((n) => Number(n)).filter(Boolean);
    const ph = ids.map(() => '?').join(', ');
    await d
      .prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0 AND id IN (${ph})`)
      .run(user.id, ...ids);
  } else {
    return NextResponse.json({ error: 'ids atau all diperlukan' }, { status: 400 });
  }
  invalidate('notif:');
  return NextResponse.json({ ok: true });
}
