import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';

/** GET /api/notifications/count — jumlah notifikasi belum dibaca (admin). */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const d = await db();
  const row = (await d
    .prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0')
    .get(user.id)) as { c: number };
  return NextResponse.json({ count: Number(row.c) }, { headers: { 'Cache-Control': 'no-store' } });
}
