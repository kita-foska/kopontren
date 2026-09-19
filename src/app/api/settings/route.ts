import { NextResponse } from 'next/server';
import { db, getSettings, saveSettings } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';

/**
 * Read-only shop settings utk widget klien (mis. target nomor WA
 * notifikasi stok di dashboard admin). Hanya field publik —
 * tidak pernah berisi kredensial. `session_timeout` (detik) di-inkludkan
 * utk UI admin; penulisan via PUT (admin-only).
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const s = await getSettings();
  const st = Number(s.session_timeout);
  return NextResponse.json({
    store_name: s.store_name,
    store_address: s.store_address,
    store_phone: s.store_phone,
    currency: s.currency,
    receipt_footer: s.receipt_footer,
    session_timeout: Number.isFinite(st) && st > 0 ? Math.round(st) : 3600,
  });
}

/** Admin ubah session_timeout (detik). Berlaku utk sesi baru + refresh berikutnya. */
export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.session_timeout === undefined) {
    return NextResponse.json({ error: 'Tindakan tidak dikenal' }, { status: 400 });
  }
  const n = Number(b.session_timeout);
  const min = 60; // 1 menit
  const max = 7 * 24 * 3600; // 7 hari
  if (!Number.isFinite(n) || n < min || n > max) {
    return NextResponse.json(
      { error: `session_timeout harus ${min}-${max} detik` },
      { status: 400 }
    );
  }
  const d = await db();
  await saveSettings(d, { session_timeout: String(Math.round(n)) }, {
    id: user.id,
    username: user.username,
  });
  return NextResponse.json({ ok: true, session_timeout: Math.round(n) });
}
