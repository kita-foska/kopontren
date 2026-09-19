import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { getNotificationSettings, saveNotificationSettings } from '@/lib/notify';

/**
 * GET  /api/notification-settings — konfigurasi notifikasi admin (20 jenis,
 *      hasil merge default: in_app ON, push OFF bila belum diset).
 * POST /api/notification-settings — simpan konfigurasi.
 *      Body: { settings: [{ type, in_app, push }] }.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const d = await db();
  const settings = await getNotificationSettings(d, user.id);
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    settings?: { type: string; in_app?: boolean; push?: boolean }[];
  };
  const patch = (b.settings || []).map((s) => ({
    type: s.type,
    enabled_in_app: s.in_app ? 1 : 0,
    enabled_push: s.push ? 1 : 0,
  }));
  if (!patch.length) {
    return NextResponse.json({ error: 'settings tidak valid' }, { status: 400 });
  }
  const d = await db();
  await saveNotificationSettings(d, user.id, patch);
  return NextResponse.json({ ok: true });
}
