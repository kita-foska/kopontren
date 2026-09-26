import { NextResponse } from 'next/server';
import { db, getZakatSettings, saveZakatSettings, type Db } from '@/db';
import { canAccess, currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { notifyNewZakat } from '@/lib/notify';
import { wibDayStartUtc, wibToday } from '@/lib/zakat-period';
import { normalizePaymentType } from '@/lib/zakat-payment';
import {
  type HaulAnchor,
  type ProductRow,
  type ZakatValuationMode,
  computeAccrual,
  computeHaulAnchor,
  computeValuation,
  resolveValuationMode,
} from '@/lib/zakat-valuation';
import { ttlGet, ttlSet } from '@/lib/ttl-cache';

export type ZakatGoldStandard = {
  id: number;
  karat: string;
  price_per_gram: number;
  source: string;
  price_date: string;
  decided_by: string;
};

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
  // ── P3 Step 2 (PROVISIONAL — menunggu tashih pengasuh): ──
  valuation_mode: ZakatValuationMode;
  gold_standard: ZakatGoldStandard | null; // standar terkini (log append-only)
  haul_anchor: HaulAnchor;
  days_elapsed: number;
  accrued: number;
  haul_end: string;
};

/** Standar emas terkini: baris ber-price_date terbaru (log append-only). */
async function getLatestGoldStandard(d: Db): Promise<ZakatGoldStandard | null> {
  const row = (await d
    .prepare(
      `SELECT id, karat, price_per_gram, source, price_date, decided_by
       FROM zakat_gold_standards WHERE price_per_gram > 0
       ORDER BY price_date DESC, id DESC LIMIT 1`
    )
    .get()) as ZakatGoldStandard | undefined;
  return row ?? null;
}

/**
 * Hitung zakat tijarah (perdagangan) saat ini — lihat computeZakatLive
 * utk detail formula (P3 Step 2 provisional).
 *
 * Cache server-side `zakat:calc` (ttl-cache, TTL 60 dtk): key mencakup
 * SEMUA input (tanggal + id standar terkini + 6 field settings),
 * sehingga write settings / gold-standard / pembayaran zakat otomatis
 * mengganti key -> hasil baru; entri lama mati bersama TTL-nya.
 */
async function computeZakat(): Promise<ZakatCalculation> {
  const d = await db();
  const s = await getZakatSettings();
  const std = await getLatestGoldStandard(d);
  const today = wibToday();
  const key =
    'zakat:calc:' +
    [
      today,
      std ? std.id : 0,
      s.gold_price,
      s.nishab_gram,
      s.zakat_rate,
      s.haul_start_date,
      s.last_zakat_date,
      s.valuation_mode,
    ].join('|');
  const hit = ttlGet(key);
  if (hit) {
    try {
      return JSON.parse(hit) as ZakatCalculation;
    } catch {
      /* cache korup -> hitung ulang di bawah */
    }
  }
  const calc = await computeZakatLive(d, s, std, today);
  ttlSet(key, JSON.stringify(calc), 60_000);
  return calc;
}

/**
 * Formula (P3 Step 2, PROVISIONAL — menunggu tashih pengasuh):
 *   modal   = Σ stok × harga jual base_price (mode 'market', default —
 *             V1: proxy harga pasar) ATAU Σ stok × cost_price ('hpp',
 *             fallback konservatif) — mode = setting `valuation_mode`
 *   laba    = laba kotor periode (penjualan − COGS); periode di-ANCHOR
 *             pada haul_start_date (haul tetap 1 th, P3-Q1);
 *             last_zakat_date TAK me-reset (pembayaran = ta'jil), hanya
 *             fallback anchor bila haul_start_date kosong + audit
 *   piutang = Σ remaining debts open (ditambahkan)
 *   hutang  = Σ remaining payables open (dikurangkan — utang dicicil
 *             saka harta, zakat tijarah)
 *   nishab  = nishab_gram × harga efektif: standar emas TERKINI (log
 *             zakat_gold_standards) bila ada, selain itu settings.gold
 *             _price. Emas MURNI 24K (Muktamar NU ke-35; posisi 24K
 *             provisional, menunggu tashih)
 *   wajib   bila harga emas terisi dan total >= nishab
 */
async function computeZakatLive(
  d: Db,
  s: Record<string, string>,
  std: ZakatGoldStandard | null,
  today: string
): Promise<ZakatCalculation> {
  const nishab_gram = Number(s.nishab_gram) || 0;
  const zakat_rate = Number(s.zakat_rate) || 0;
  const valuation_mode = resolveValuationMode(s.valuation_mode);

  // Anchor periode laba + status haul (P3-Q1, provisional):
  // haul_start_date -> last_zakat_date -> awal bulan WIB berjalan.
  // Boundary 00:00 WIB -> 17:00 UTC hari sebelumnya (wibDayStartUtc)
  // agar leksikografis terhadap created_at ISO-UTC benar.
  const anchor = computeHaulAnchor(s.haul_start_date, s.last_zakat_date, today);
  const period_start_utc = wibDayStartUtc(anchor.anchor);

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
  const hutang = Number(
    (
      (await d
        .prepare(`SELECT COALESCE(SUM(remaining), 0) v FROM payables WHERE status = 'open'`)
        .get()) as { v: number }
    ).v
  );

  // P3 Step 2 (provisional): penilaian modal per `valuation_mode`
  // (market = default, V1 proxy harga pasar; hpp = fallback).
  const products = (await d
    .prepare(`SELECT stock, base_price, cost_price FROM products WHERE active = 1 AND stock > 0`)
    .all()) as ProductRow[];
  const v = computeValuation(valuation_mode, products, laba, piutang, hutang);
  const total_assets = v.total_assets;

  // Harga efektif: standar emas terkini (log append-only) bila ada,
  // selain itu settings.gold_price. Harga 0 -> nishab tak terdefinisi.
  const gold_price = std ? Number(std.price_per_gram) : Number(s.gold_price) || 0;
  const nishab = Math.round(nishab_gram * gold_price);
  const status: 'wajib' | 'belum' =
    gold_price > 0 && total_assets >= nishab ? 'wajib' : 'belum';
  const zakat_amount = status === 'wajib' ? Math.round(total_assets * (zakat_rate / 100)) : 0;
  // Akumulasi proporsional hari haul (penuh saat haul_end); 0 selama
  // belum wajib. PROVISIONAL — menunggu tashih.
  const accrued =
    zakat_amount > 0 ? computeAccrual(total_assets, zakat_rate, anchor.days_elapsed) : 0;

  return {
    total_assets,
    modal: v.modal,
    laba,
    piutang,
    hutang,
    nishab,
    status,
    zakat_amount,
    gold_price,
    nishab_gram,
    zakat_rate,
    period_start: anchor.anchor,
    haul_start_date: s.haul_start_date,
    last_zakat_date: s.last_zakat_date,
    valuation_mode,
    gold_standard: std,
    haul_anchor: anchor,
    days_elapsed: anchor.days_elapsed,
    accrued,
    haul_end: anchor.haul_end,
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'zakat'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });
  const calc = await computeZakat();
  // is_admin di luar cache computeZakat (per-user, bukan input formula).
  return NextResponse.json(
    { ...calc, is_admin: user.role === 'admin' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Simpan perhitungan ke riwayat zakat (admin-only). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { note?: string; payment_type?: string };
  const note = String(b.note || '').trim().slice(0, 300);
  const payment_type = normalizePaymentType(b.payment_type);

  const d = await db();
  const calc = await computeZakat();
  const wibTodayStr = wibToday();

  const info = await d
    .prepare(
      `INSERT INTO zakat_history (total_assets, nishab, status, payment_type, zakat_amount, paid_at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(calc.total_assets, calc.nishab, calc.status, payment_type, calc.zakat_amount, new Date().toISOString(), note);
  const id = Number(info.lastInsertRowid);

  // P3 Step 2 (PROVISIONAL — menunggu tashih): last_zakat_date kini
  // = AUDIT ("zakat terakhir dibayar") + fallback anchor periode hanya
  // bila haul_start_date KOSONG (lihat computeHaulAnchor). Pembayaran
  // = ta'jil: tidak me-reset haul_start_date yang sudah di-anchor.
  // Catatan status 'belum' tetap tidak menggeser siklus.
  const cycle_advanced = calc.status === 'wajib';
  if (cycle_advanced) {
    await saveZakatSettings(d, { last_zakat_date: wibTodayStr }, { id: user.id, username: user.username });
  }
  await logAudit(user, 'zakat:record', 'zakat_history', id, undefined, {
    total_assets: calc.total_assets,
    nishab: calc.nishab,
    status: calc.status,
    payment_type: payment_type,
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
