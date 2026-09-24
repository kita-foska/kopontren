/**
 * KOPONTREN — perhitungan perk member (loyalty), modul MURNI (tanpa DB/IO/Next).
 *
 * Satu-satunya sumber rumus perk. Dipakai bersama oleh:
 *  - POST /api/sales  (otoritatif, server-side, + penjaga margin anti rugi),
 *  - POS client (components/pos-client.tsx) untuk preview sebelum submit,
 *  - scripts/test-margin.ts (unit test — dijalankan langsung oleh `node`).
 *
 * 100% deterministik & tanpa dependensi proyek, sehingga server & klien
 * memakai rumus SAMA PERSIS. JANGAN tambahkan import proyek di sini —
 * modul ini harus tetap bisa dieksekusi oleh Node (type-stripping).
 *
 * ── PIPELINE PERK (urutan) ─────────────────────────────────────────────────
 *  1. memberDiscount — % dari subtotal SETELAH diskon manual; saat hari
 *     ulang tahun member (match MM-DD, Asia/Jakarta) & birthday_active,
 *     berlaku MAKS(birthday_discount, member_discount). Cap 90% agar
 *     total tetap > 0.
 *  2. redeem — nominal potongan dari poin member (1 poin = point_value Rp,
 *     poin dipakai dulu) lalu sisa dari saldo cashback_balance; cap di
 *     total setelah diskon.
 *  3. cashback — % dari total SETELAH diskon & redeem, DIKREDIT ke saldo
 *     cashback member (liabilitas tertunda — TIDAK mengurangi total saat ini).
 *  4. points — total / points_every (minimum Rp 1.000 per poin).
 *  5. tier — silver/gold dari akumulasi total_spent (badge/status saja).
 *
 * ── PENJAGA MARGIN (anti rugi) ────────────────────────────────────────────
 *  Total keluaran perk OTOMATIS (1+2+3) dibatasi oleh margin kotor produk:
 *      margin kotor   = subtotal − Σ(cost_price × qty)
 *      cap perk       = max(0, margin kotor − diskon manual)
 *  Jika keluaran mentah melebihi cap, dipangkas berurutan:
 *      cashback dulu → redeem → diskon  (diskon paling "keras" bagi pembeli
 *      sehingga dipertahankan paling akhir).
 *  Diskon manual TIDAK dipangkas: bila diskon manual saja sudah menembus
 *  margin, hal itu hanya ditandai (manualOverMargin) untuk log/notifikasi,
 *  bukan memblokir penjualan (keputusan "soft").
 */

// ── Konfigurasi & parsing ──────────────────────────────────────────────────

/** Konfigurasi perk (hasil parse dari pengaturan member, sudah dinormalisasi). */
export interface PerkConfig {
  /** Rp per 1 poin loyalti yang didapat (normalisasi: minimum 1000). */
  pointsEvery: number;
  /** Nilai tukar 1 poin (Rp) saat member menebus. */
  pointValue: number;
  /** Diskon member base (%). */
  memberDiscountPct: number;
  /** Cashback (%) yang dikredit ke saldo member. */
  cashbackPct: number;
  /** Apakah promo ulang tahun aktif. */
  birthdayActive: boolean;
  /** Diskon khusus ulang tahun (%). */
  birthdayDiscountPct: number;
  /** Ambang total_spent untuk tier silver (Rp; 0 = nonaktif). */
  tierSilver: number;
  /** Ambang total_spent untuk tier gold (Rp; 0 = nonaktif). */
  tierGold: number;
}

/**
 * Ubah `Record<string,string>` pengaturan member (dari /api/member-settings,
 * atau null sebelum load) menjadi PerkConfig yang dinormalisasi.
 * Semua nilai di-floor & dipaksa non-negatif; persentase tidak di-cap di sini
 * (cap 90% untuk diskon diberlakukan di computePerks, bukan saat parse).
 */
export function parsePerkConfig(s?: Record<string, string> | null): PerkConfig {
  const num = (k: string): number => {
    const v = Math.floor(Number(s?.[k]));
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  return {
    // points_every: default Rp 10.000, cap minimum Rp 1.000 (hindari div0 &
    // inflasi poin) — identik dengan rumus server lama.
    pointsEvery: Math.max(1000, Math.floor(Number(s?.points_every) || 10000)),
    pointValue: num('point_value'),
    memberDiscountPct: num('member_discount'),
    cashbackPct: num('cashback'),
    birthdayActive: s?.birthday_active === '1',
    birthdayDiscountPct: num('birthday_discount'),
    tierSilver: num('tier_silver'),
    tierGold: num('tier_gold'),
  };
}

// ── Input / output ─────────────────────────────────────────────────────────

export interface PerkInput {
  /** Subtotal SEBELUM diskon manual = Σ price × qty. */
  subtotal: number;
  /** Total HPP = Σ cost_price × qty. Jika 0/tidak diketahui, penjaga margin
   *  tetap jalan tapi margin kotor dianggap = subtotal (guard tidak akan
   *  memotong perk — aman bila HPP belum terisi). */
  totalCost: number;
  /** Diskon manual per-baris (Σ), hanya manager. */
  lineDisc: number;
  /** Diskon manual tingkat transaksi, hanya manager. */
  txDisc: number;
  /** true bila member berulang tahun hari ini (match MM-DD, zona Jakarta). */
  isBday: boolean;
  /** Sisa poin member saat ini. */
  memberPoints: number;
  /** Saldo cashback member saat ini. */
  memberCashbackBalance: number;
  /** Akumulasi total_spent sebelum transaksi ini. */
  memberTotalSpent: number;
  /** Nominal redeem yang diminta (0 = tidak redeem). */
  redeemRequested: number;
}

/** Diagnostik penjaga margin (dipakai semua penjualan, member & non-member). */
export interface MarginGuard {
  /** Margin kotor produk = subtotal − totalCost (bisa negatif utk rugi). */
  grossMargin: number;
  /** Keluaran diskon manual = lineDisc + txDisc. */
  manualOutflow: number;
  /** Batas maksimum total keluaran perk otomatis = max(0, margin − manual). */
  cap: number;
  /** true bila diskon manual SAJA sudah menembus/menimpa margin kotor. */
  manualOverMargin: boolean;
}

/** Perhitungan penjaga margin murni — panggil utk semua penjualan. */
export function marginGuard(
  subtotal: number,
  totalCost: number,
  lineDisc: number,
  txDisc: number
): MarginGuard {
  const grossMargin = Math.max(0, Math.floor(subtotal || 0)) - Math.max(0, Math.floor(totalCost || 0));
  const manualOutflow = Math.max(0, Math.floor(lineDisc || 0)) + Math.max(0, Math.floor(txDisc || 0));
  const cap = Math.max(0, grossMargin - manualOutflow);
  return {
    grossMargin,
    manualOutflow,
    cap,
    manualOverMargin: cap <= 0 && manualOutflow > 0,
  };
}

export interface PerkResult extends MarginGuard {
  /** Subtotal setelah diskon manual, sebelum perk. */
  prePerk: number;
  /** Diskon member final (SUDAH di-clamp penjaga margin). */
  memberDiscount: number;
  /** Total redeem final (Rp). */
  redeem: number;
  /** Bagian redeem dari poin (poin dipakai dulu). */
  redeemPoints: number;
  /** Bagian redeem dari saldo cashback. */
  redeemCash: number;
  /** Nilai poin yang ditebus (Rp) = redeemPoints × pointValue. */
  redeemPtsValue: number;
  /** Cashback final (Rp, setelah clamp) — dikredit ke saldo member. */
  cashback: number;
  /** Total akhir yang dibayar pembeli = prePerk − memberDiscount − redeem. */
  total: number;
  /** Poin loyalti yang didapat dari transaksi ini. */
  points: number;
  /** Tier hasil ('' | 'silver' | 'gold'). */
  tier: string;
  /** true bila promo ulang tahun yang dipakai (untuk label UI). */
  birthdayApplied: boolean;
  /** Total keluaran perk otomatis SEBELUM penjaga (diskon+redeem+cashback). */
  perkRawTotal: number;
  /** Total keluaran perk otomatis AKHIR (setelah clamp). */
  perkTotal: number;
  /** true bila penjaga margin memangkas setidaknya satu perk. */
  clamped: boolean;
  /** Nominal (Rp) yang dipangkas penjaga margin. */
  clampedAmount: number;
}

/**
 * Hitung semua perk member + terapkan penjaga margin. Deterministik; tanpa IO.
 * Lihat komentar di atas file untuk semantics tiap langkah.
 */
export function computePerks(cfg: PerkConfig, input: PerkInput): PerkResult {
  const subtotal = Math.max(0, Math.floor(input.subtotal || 0));
  const totalCost = Math.max(0, Math.floor(input.totalCost || 0));
  const lineDisc = Math.max(0, Math.floor(input.lineDisc || 0));
  const txDisc = Math.max(0, Math.floor(input.txDisc || 0));
  const guard = marginGuard(subtotal, totalCost, lineDisc, txDisc);

  const prePerk = Math.max(0, subtotal - lineDisc - txDisc);

  // ── Perk 1 — diskon member (mentah) ──
  let pct = cfg.memberDiscountPct;
  const birthdayApplied = input.isBday && cfg.birthdayActive;
  if (birthdayApplied) pct = Math.max(pct, cfg.birthdayDiscountPct);
  pct = Math.min(90, pct); // cap agar total tetap > 0
  const rawDisc = Math.floor((prePerk * pct) / 100);

  // ── Perk 2 — redeem (mentah): poin dulu, lalu saldo cashback; cap di
  //    total setelah diskon & dibatasi ketersediaan saldo. ──
  const availPoints = Math.max(0, Math.floor(input.memberPoints || 0));
  const availCb = Math.max(0, Math.floor(input.memberCashbackBalance || 0));
  const pv = cfg.pointValue;
  const wantRedeem = Math.min(
    Math.max(0, Math.floor(input.redeemRequested || 0)),
    Math.max(0, prePerk - rawDisc),
    availPoints * pv + availCb
  );
  const rawRedeemPoints = pv > 0 ? Math.min(Math.floor(wantRedeem / pv), availPoints) : 0;
  const rawRedeemCash = Math.min(wantRedeem - rawRedeemPoints * pv, availCb);
  const rawRedeem = rawRedeemPoints * pv + rawRedeemCash;

  // ── Perk 3 — cashback (mentah): % dari total SETELAH diskon & redeem. ──
  const afterRedeem = Math.max(0, prePerk - rawDisc - rawRedeem);
  const rawCashback = Math.floor((afterRedeem * cfg.cashbackPct) / 100);

  const perkRawTotal = rawDisc + rawRedeem + rawCashback;

  // ── PENJAGA MARGIN: pangkas berurutan cashback → redeem → diskon. ──
  let disc = rawDisc;
  let re = rawRedeem;
  let cb = rawCashback;
  let over = perkRawTotal - guard.cap;
  if (over > 0) {
    const c1 = Math.min(cb, over);
    cb -= c1;
    over -= c1;
    if (over > 0) {
      const c2 = Math.min(re, over);
      re -= c2;
      over -= c2;
    }
    if (over > 0) {
      // Diskon terakhir; secara matematis over sudah habis di sini, tapi
      // tetap dipotong agar cap tidak pernah dilewati.
      disc -= Math.min(disc, over);
      over = 0;
    }
  }
  const clamped = perkRawTotal > guard.cap;

  // Re-pisah redeem final (bisa terpotong) — poin tetap dipakai dulu.
  const redeemPoints = pv > 0 ? Math.min(Math.floor(re / pv), availPoints) : 0;
  const redeemCash = Math.min(re - redeemPoints * pv, availCb);
  const redeemPtsValue = redeemPoints * pv;

  // ── Final: total dibayar, poin didapat, auto-tier. ──
  const total = Math.max(0, prePerk - disc - re);
  const points = Math.floor(total / cfg.pointsEvery);
  const newSpent = Math.max(0, Math.floor(input.memberTotalSpent || 0)) + total;
  const tier =
    cfg.tierGold > 0 && newSpent >= cfg.tierGold
      ? 'gold'
      : cfg.tierSilver > 0 && newSpent >= cfg.tierSilver
        ? 'silver'
        : '';

  return {
    ...guard,
    prePerk,
    memberDiscount: disc,
    redeem: re,
    redeemPoints,
    redeemCash,
    redeemPtsValue,
    cashback: cb,
    total,
    points,
    tier,
    birthdayApplied,
    perkRawTotal,
    perkTotal: disc + re + cb,
    clamped,
    clampedAmount: clamped ? perkRawTotal - guard.cap : 0,
  };
}

// ── Validasi lunak pengaturan member (diterima + peringatan, TIDAK tolak) ──

/** Beban perk otomatis estimasi (% dari harga jual): diskon efektif + cashback.
 *  Redeem tidak dihitung (berbasis saldo, bukan % harga). Dipakai UI admin
 *  utk menampilkan "beban perk" berwarna & utk peringatan saat simpan. */
export function totalPerkPct(cfg: PerkConfig): number {
  const disc = Math.min(90, Math.max(cfg.memberDiscountPct, cfg.birthdayActive ? cfg.birthdayDiscountPct : 0));
  return disc + cfg.cashbackPct;
}

/**
 * Kembalikan daftar peringatan (bukan error) bila konfigurasi member berisiko
 * merampas margin. Nilai tetap diterima (penjaga margin di /api/sales yang
 * memangkas perk), tetapi admin diberi tahu lewat audit + UI.
 */
export function memberSettingWarnings(cfg: PerkConfig): string[] {
  const out: string[] = [];
  const total = totalPerkPct(cfg);
  if (total >= 100) {
    out.push(
      `Beban perk otomatis ${total}% menembus 100% harga — penjualan berpotensi rugi; penjaga margin akan memangkas perk otomatis.`
    );
  } else if (total >= 60) {
    out.push(`Beban perk otomatis ${total}% cukup tinggi — margin produk tipis bisa tergerus.`);
  }
  if (cfg.cashbackPct >= 50) {
    out.push(`Saldo Reward ${cfg.cashbackPct}% tinggi — saldo reward member akan menumpuk cepat.`);
  }
  if (cfg.pointValue > 0 && cfg.pointsEvery > 0 && cfg.pointValue >= cfg.pointsEvery) {
    out.push(
      `Nilai 1 poin (Rp ${cfg.pointValue}) ≥ biaya dapat 1 poin (Rp ${cfg.pointsEvery}) — redeem bisa melebihi nilai belanja.`
    );
  }
  return out;
}