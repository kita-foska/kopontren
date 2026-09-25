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
    // QRIS (2026-09-25): konfigurasi encoder (src/lib/qris.ts) utk
    // /admin/qris. Nama merchant memakai store_name (di atas).
    qris_nmid: s.qris_nmid,
    qris_nmid2: s.qris_nmid2,
    qris_mcc: s.qris_mcc,
    qris_city: s.qris_city,
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
  // QRIS (2026-09-25): NMID/NMID2 (1-32 char bebas), MCC (4 digit atau
  // kosong), kota (<=30 char). saveSettings hanya menulis key yang ada di
  // SHOP_SETTING_DEFAULTS + log audit otomatis (db.ts).
  const qrisText = (v: unknown, max: number) => String(v ?? '').trim();
  if (b.qris_nmid !== undefined) {
    const v = qrisText(b.qris_nmid, 32);
    if (v.length > 32) return NextResponse.json({ error: 'qris_nmid maks 32 karakter' }, { status: 400 });
    patch.qris_nmid = v;
  }
  if (b.qris_nmid2 !== undefined) {
    const v = qrisText(b.qris_nmid2, 32);
    if (v.length > 32) return NextResponse.json({ error: 'qris_nmid2 maks 32 karakter' }, { status: 400 });
    patch.qris_nmid2 = v;
  }
  if (b.qris_mcc !== undefined) {
    const v = qrisText(b.qris_mcc, 4);
    if (v !== '' && !/^\d{4}$/.test(v)) {
      return NextResponse.json({ error: 'qris_mcc harus 4 digit (atau kosong)' }, { status: 400 });
    }
    patch.qris_mcc = v;
  }
  if (b.qris_city !== undefined) {
    const v = qrisText(b.qris_city, 30);
    if (v.length > 30) return NextResponse.json({ error: 'qris_city maks 30 karakter' }, { status: 400 });
    patch.qris_city = v;
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
