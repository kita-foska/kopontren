import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { cached } from '@/lib/ref-cache';
import { pruneOldNotifications } from '@/lib/notify';

/**
 * GET /api/notifications — daftar notifikasi ADMIN saat ini.
 * Cache in-memory 60 detik (ref-cache) + di-invalidate saat ada tulis.
 * Query: ?limit= (default 50, max 100) & ?unread=1 (hanya yang belum dibaca).
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const unreadOnly = url.searchParams.get('unread') === '1';
  const d = await db();
  // Rutin bersihkan data > 30 hari (throttle 1 jam/instance, aman).
  await pruneOldNotifications().catch((e) => {
    // Jangan diam-diam telan error (schema/koneksi) — catat utk diagnostik.
    console.warn('[notif] prune notifikasi lama gagal:', e);
  });
  const key = `notif:list:${user.id}:${limit}:${unreadOnly ? 'u' : 'a'}`;
  const rows = await cached(key, async () => {
    const where = ['user_id = ?'];
    const args: (string | number)[] = [user.id];
    if (unreadOnly) where.push('read = 0');
    return (await d
      .prepare(
        `SELECT id, type, title, message, link, read, created_at FROM notifications WHERE ${where.join(
          ' AND '
        )} ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(...args, limit)) as {
      id: number;
      type: string;
      title: string;
      message: string;
      link: string;
      read: number;
      created_at: string;
    }[];
  });
  return NextResponse.json(
    { notifications: rows, limit, offset: 0 },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
