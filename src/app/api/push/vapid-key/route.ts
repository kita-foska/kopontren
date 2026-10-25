import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser } from '@/lib/auth';
import { getVapidPublicKey } from '@/lib/notify';
import { canReceiveNotif } from '@/lib/notify-scope';

/**
 * GET /api/push/vapid-key -- kunci publik VAPID (base64url) utk
 * `pushManager.subscribe({ applicationServerKey })` di klien.
 * W13 B2: semua role penerima (admin, manajer, pengurus, kasir).
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canReceiveNotif(user.role)) {
    return NextResponse.json({ error: 'Role tidak menerima notifikasi' }, { status: 403 });
  }
  const d = await db();
  const publicKey = await getVapidPublicKey(d);
  return NextResponse.json({ publicKey }, { headers: { 'Cache-Control': 'no-store' } });
}
