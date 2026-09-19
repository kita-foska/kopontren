import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';

/**
 * POST /api/push/subscribe — daftarkan push subscription admin.
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }.
 * HANYA admin yang boleh daftar (notifikasi hanya untuk admin).
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = String(b.endpoint || '').trim();
  const p256dh = String(b.keys?.p256dh || '').trim();
  const auth = String(b.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Subscription tidak valid' }, { status: 400 });
  }
  const keysJson = JSON.stringify({ p256dh, auth });
  const d = await db();
  // endpoint bisa di-subscribe ulang (device/browser baru): update bila sudah ada.
  const existing = (await d
    .prepare('SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .get(user.id, endpoint)) as { id: number } | undefined;
  if (existing) {
    await d.prepare('UPDATE push_subscriptions SET keys = ? WHERE id = ?').run(keysJson, Number(existing.id));
  } else {
    await d
      .prepare('INSERT INTO push_subscriptions (user_id, endpoint, keys) VALUES (?, ?, ?)')
      .run(user.id, endpoint, keysJson);
  }
  return NextResponse.json({ ok: true });
}
