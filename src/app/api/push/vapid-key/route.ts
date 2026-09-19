import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { getVapidPublicKey } from '@/lib/notify';

/**
 * GET /api/push/vapid-key — kunci publik VAPID (base64url) utk
 * `pushManager.subscribe({ applicationServerKey })` di klien.
 * HANYA admin (yang boleh menerima push).
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const d = await db();
  const publicKey = await getVapidPublicKey(d);
  return NextResponse.json({ publicKey }, { headers: { 'Cache-Control': 'no-store' } });
}
