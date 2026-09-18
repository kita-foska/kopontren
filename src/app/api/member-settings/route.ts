import { NextResponse } from 'next/server';
import { db, getMemberSettings, saveMemberSettings } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// In-memory cache singkat untuk data referensi (aturan loyalty rarely
// berubah). TTL 30 detik; instance Vercel warm membuatnya efektif.
const SETTINGS_TTL_MS = 30_000;
let settingsCache: { t: number; data: Record<string, string> } | null = null;

/** Loyalty settings: GET for any logged-in user (POS displays point info),
 *  POST admin-only. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (settingsCache && Date.now() - settingsCache.t < SETTINGS_TTL_MS) {
    return NextResponse.json(
      { settings: settingsCache.data },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  }
  const settings = await getMemberSettings();
  settingsCache = { t: Date.now(), data: settings as Record<string, string> };
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const d = await db();
  const old = await getMemberSettings();
  await saveMemberSettings(d, b as Record<string, string>);
  const next = await getMemberSettings();
  await logAudit(user, 'member:settings', 'member_settings', null, old, next);
  return NextResponse.json({ ok: true, settings: next });
}
