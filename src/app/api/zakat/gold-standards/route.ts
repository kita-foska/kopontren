import { NextResponse } from 'next/server';
import { db, saveZakatSettings } from '@/db';
import { canAccess, currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { wibToday } from '@/lib/zakat-period';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GoldStandardRow = {
  id: number;
  karat: string;
  price_per_gram: number;
  source: string;
  price_date: string;
  decided_by: string;
  created_at: string;
};

/**
 * Log verifikasi standar harga emas (P3 Step 2, PROVISIONAL — menunggu
 * tashih pengasuh; subject to correction).
 *
 * APPEND-ONLY: tidak ada PUT/DELETE — koreksi harga = entri BARU
 * (baris lebih baru jadi standar terkini; baris lama tetap jejak
 * audit). Standar terkini = baris ber-price_date terbaru.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });
  const d = await db();
  const rows = (await d
    .prepare(
      `SELECT id, karat, price_per_gram, source, price_date, decided_by, created_at
       FROM zakat_gold_standards ORDER BY price_date DESC, id DESC LIMIT 50`
    )
    .all()) as GoldStandardRow[];
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Catat entri verifikasi harga emas baru (admin-only).
 * `decided_by` diisi server dari sesi (username user), BUKAN dari
 * client — audit tak boleh bisa dipalsukan. Opsi `apply: true`:
 * sinkronkan settings.gold_price (nilai legacy/fallback) — perhitungan
 * /api/zakat sudah memakai standar terkini secara otomatis.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const karat = String(b.karat ?? '').trim().slice(0, 20) || '24K';
  const price = Math.round(Number(b.price_per_gram));
  if (!Number.isFinite(price) || price <= 0)
    return NextResponse.json({ error: 'Harga per gram harus > 0' }, { status: 400 });
  const source = String(b.source ?? '').trim().slice(0, 200);
  const price_date = String(b.price_date ?? '').trim() || wibToday();
  if (!DATE_RE.test(price_date))
    return NextResponse.json({ error: 'Tanggal harga harus format YYYY-MM-DD' }, { status: 400 });
  const apply = b.apply === true;

  const d = await db();
  const info = await d
    .prepare(
      `INSERT INTO zakat_gold_standards (karat, price_per_gram, source, price_date, decided_by)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(karat, price, source, price_date, user.username);
  const id = Number(info.lastInsertRowid);

  if (apply) {
    await saveZakatSettings(d, { gold_price: String(price) }, { id: user.id, username: user.username });
  }
  await logAudit(user, 'zakat:gold_standard', 'zakat_gold_standards', id, undefined, {
    karat,
    price_per_gram: price,
    source: source || undefined,
    price_date,
    applied_to_settings: apply || undefined,
  });
  return NextResponse.json({ ok: true, id, applied_to_settings: apply });
}