import { NextResponse } from 'next/server';
import { db, getSettings, saveSettings } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { clampRate } from '@/lib/konsinyasi';

/**
 * Read-only shop settings utk widget klien (mis. target nomor WA
 * notifikasi stok di dashboard admin). Hanya field publik —
 * tidak pernah berisi kredensial. `session_timeout` (detik) &
 * `konsinyasi_commission` (FASE P4, % komisi toko utk akad ju'alah)
 * di-inkludkan utk UI admin; penulisan via PUT (admin-only).
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
    // FASE P4: komisi konsinyasi utk titipan BARU (akad ju'alah).
    konsinyasi_commission: clampRate(s.konsinyasi_commission),
  });
}

/** Admin ubah session_timeout (detik) dan/atau komisi konsinyasi (%, 0-100). */
export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, string> = {};
  if (b.session_timeout !== undefined) {
    const n = Number(b.session_timeout);
    const min = 60; // 1 menit
    const max = 7 * 24 * 3600; // 7 hari
    if (!Number.isFinite(n) || n < min || n > max) {
      return NextResponse.json(
        { error: `session_timeout harus ${min}-${max} detik` },
        { status: 400 }
      );
    }
    patch.session_timeout = String(Math.round(n));
  }
  // FASE P4: komisi konsinyasi 0-100 (% dr harga jual). Berlaku utk
  // titipan BARU (akad disepakati saat titipan); titipan berjalan
  // tetap pakai rate snapshot-nya.
  if (b.konsinyasi_commission !== undefined) {
    const c = Number(b.konsinyasi_commission);
    if (!Number.isFinite(c) || c < 0 || c > 100 || !Number.isInteger(c)) {
      return NextResponse.json(
        { error: 'konsinyasi_commission harus integer 0-100' },
        { status: 400 }
      );
    }
    patch.konsinyasi_commission = String(c);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Tindakan tidak dikenal' }, { status: 400 });
  }
  const d = await db();
  await saveSettings(d, patch, {
    id: user.id,
    username: user.username,
  });
  return NextResponse.json({ ok: true, ...patch });
}
