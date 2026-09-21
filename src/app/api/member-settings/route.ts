import { NextResponse } from 'next/server';
import { db, getMemberSettings, saveMemberSettings } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { memberSettingWarnings, parsePerkConfig } from '@/lib/perks';
import { cached, invalidate } from '@/lib/ref-cache';

/** Loyalty settings: GET for any logged-in user (POS displays point info),
 *  POST admin-only. Data jarang berubah -> cache in-memory 60 dtk
 *  (ref-cache) agar request POS berulang tidak menembus Turso;
 *  POST mem-invalidasi cache sehingga simpan langsung terbaca segar. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const settings = await cached('settings:member', () => getMemberSettings());
  return NextResponse.json(
    { settings: settings as Record<string, string> },
    { headers: { 'Cache-Control': 'public, max-age=60' } }
  );
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
  invalidate('settings:member');
  const next = await getMemberSettings();
  await logAudit(user, 'member:settings', 'member_settings', null, old, next);
  // Validasi lunak: setting selalu DITERIMA; bila berisiko menggerus
  // margin, daftar peringatan dikembalikan utk UI admin (penjaga margin
  // di /api/sales yang memangkas perk otomatis bila perlu).
  const warnings = memberSettingWarnings(parsePerkConfig(next));
  return NextResponse.json({ ok: true, settings: next, warnings });
}
