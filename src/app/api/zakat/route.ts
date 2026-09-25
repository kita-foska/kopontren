import { NextResponse } from 'next/server';
import { db, getZakatSettings, saveZakatSettings } from '@/db';
import { canAccess, currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { notifyNewZakat } from '@/lib/notify';
import { currentWibMonthDate, wibDayStartUtc, wibToday } from '@/lib/zakat-period';

export type ZakatCalculation = {
  total_assets: number;
  modal: number;
  laba: number;
  piutang: number;
  hutang: number;
  nishab: number;
  status: 'wajib' | 'belum';
  zakat_amount: number;
  gold_price: number;
  nishab_gram: number;
  zakat_rate: number;
  period_start: string;
  haul_start_date: string;
  last_zakat_date: string;
};

/**
 * Hitung zakat tijarah (perdagangan) saat ini:
 *   modal   = Σ stok × HPP produk aktif
 *   laba    = laba kotor periode (penjualan − COGS), formula sama dengan
 *             /api/reports: periode mulai dari zakat terakhir / tanggal
 *             mulai haul; bila keduanya kosong, awal bulan WIB berjalan.
 *   piutang = Σ remaining hutang customer (debts status open)
 *   hutang  = Σ remaining kewajiban dagang (payables status open)
 *   nishab  = nishab_gram × gold_price (gold_price = harga emas MURNI
 *             24 karat per gram — Muktamar NU ke-35: emas 14/18 karat
 *             TIDAK boleh jadi dasar nisab; Syafi'i: nisab = 85 g
 *             emas murni)
 *   wajib   bila harga emas terisi dan total >= nishab.
 */
async function computeZakat(): Promise<ZakatCalculation> {
  const d = await db();
  const s = await getZakatSettings();
  const gold_price = Number(s.gold_price) || 0;
  const nishab_gram = Number(s.nishab_gram) || 0;
  const zakat_rate = Number(s.zakat_rate) || 0;

  const modal = Number(
    (
      (await d
        .prepare(
          `SELECT COALESCE(SUM(stock * cost_price), 0) v FROM products WHERE active = 1 AND stock > 0`
        )
        .get()) as { v: number }
    ).v
  );

  // Periode laba kotor: dari last_zakat_date (siklus berjalan) atau
  // haul_start_date (tanggal WIB); fallback awal bulan WIB berjalan.
  // Boundary dikonversi 00:00 WIB -> 17:00 UTC hari sebelumnya
  // (wibDayStartUtc) sehingga periode benar-benar mulai 00:00 WIB,
  // bukan 07:00 WIB (perbandingan leksikografis 'YYYY-MM-DD' terhadap
  // created_at ISO-UTC bergeser +7 jam).
  const period_start = s.last_zakat_date || s.haul_start_date || currentWibMonthDate();
  const period_start_utc = wibDayStartUtc(period_start);

  const salesTotal = Number(
    (
      (await d
        .prepare(`SELECT COALESCE(SUM(total), 0) v FROM sales WHERE created_at >= ?`)
        .get(period_start_utc)) as { v: number }
    ).v
  );
  const cogs = Number(
    (
      (await d
        .prepare(
          `SELECT COALESCE(SUM(si.qty * COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0)), 0) v
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           LEFT JOIN products p ON p.id = si.product_id
           WHERE s.created_at >= ?`
        )
        .get(period_start_utc)) as { v: number }
    ).v
  );
  const laba = salesTotal - cogs;

  const piutang = Number(
    (
      (await d
        .prepare(`SELECT COALESCE(SUM(remaining), 0) v FROM debts WHERE status = 'open'`)
        .get()) as { v: number }
    ).v
  );
  // Hutang dagang ke supplier (payables open) dikurangkan dari harta bersih —
  // konsisten fiqh zakat tijarah (utang dicicil saka harta).
  const hutang = Number(
    (
      (await d
        .prepare(`SELECT COALESCE(SUM(remaining), 0) v FROM payables WHERE status = 'open'`)
        .get()) as { v: number }
    ).v
  );

  const total_assets = modal + laba + piutang - hutang;
  const nishab = Math.round(nishab_gram * gold_price);
  // Harga emas belum diisi (0) -> nishab tidak terdefinisi, status 'belum'.
  const status: 'wajib' | 'belum' =
    gold_price > 0 && total_assets >= nishab ? 'wajib' : 'belum';
  const zakat_amount = status === 'wajib' ? Math.round(total_assets * (zakat_rate / 100)) : 0;

  return {
    total_assets,
    modal,
    laba,
    piutang,
    hutang,
    nishab,
    status,
    zakat_amount,
    gold_price,
    nishab_gram,
    zakat_rate,
    period_start,
    haul_start_date: s.haul_start_date,
    last_zakat_date: s.last_zakat_date,
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'zakat'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });
  const calc = await computeZakat();
  return NextResponse.json(calc, { headers: { 'Cache-Control': 'no-store' } });
}

/** Simpan perhitungan ke riwayat zakat (admin-only). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { note?: string };
  const note = String(b.note || '').trim().slice(0, 300);

  const d = await db();
  const calc = await computeZakat();
  const wibTodayStr = wibToday();

  const info = await d
    .prepare(
      `INSERT INTO zakat_history (total_assets, nishab, status, zakat_amount, paid_at, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(calc.total_assets, calc.nishab, calc.status, calc.zakat_amount, new Date().toISOString(), note);
  const id = Number(info.lastInsertRowid);

  // Siklus baru HANYA bila zakat benar-benar dibayar (status 'wajib'):
  // last_zakat_date = "zakat terakhir dibayar". Catatan status 'belum'
  // tidak me-reset siklus, agar periode laba tetap terakumulasi sejak
  // pembayaran terakhir (kalau dicatat ulang tiap bulan, laba hanya
  // terhitung sejak hari sebelum -> zakat terhitung terlalu kecil).
  const cycle_advanced = calc.status === 'wajib';
  if (cycle_advanced) {
    await saveZakatSettings(d, { last_zakat_date: wibTodayStr }, { id: user.id, username: user.username });
  }
  await logAudit(user, 'zakat:record', 'zakat_history', id, undefined, {
    total_assets: calc.total_assets,
    nishab: calc.nishab,
    status: calc.status,
    zakat_amount: calc.zakat_amount,
    cycle_advanced,
    note: note || undefined,
  });
  // Notifikasi admin (best-effort): zakat baru tercatat.
  try {
    await notifyNewZakat(calc.zakat_amount, calc.status, calc.total_assets);
  } catch (e) {
    console.warn('[notify] pemicu zakat gagal:', e);
  }

  return NextResponse.json({ ok: true, id, cycle_advanced, ...calc });
}
