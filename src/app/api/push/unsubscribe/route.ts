import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';

/**
 * POST /api/push/unsubscribe — hapus push subscription admin.
 * Body: { endpoint: string }.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = String(b.endpoint || '').trim();
  if (!endpoint) return NextResponse.json({ error: 'endpoint tidak valid' }, { status: 400 });
  const d = await db();
  await d
    .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(user.id, endpoint);
  return NextResponse.json({ ok: true });
}
