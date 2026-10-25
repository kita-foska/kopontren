import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser } from '@/lib/auth';
import { canReceiveNotif } from '@/lib/notify-scope';

/**
 * POST /api/push/subscribe -- daftarkan push subscription user.
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }.
 * W13 B2: semua role penerima (admin, manajer, pengurus, kasir) boleh
 * mendaftar (notifikasi kini untuk semua role operasional).
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canReceiveNotif(user.role)) {
    return NextResponse.json({ error: 'Role tidak menerima notifikasi' }, { status: 403 });
  }
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
