/**
 * Unit test penjaga margin + perk member (modul murni src/lib/perks.ts).
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:margin        (== node scripts/test-margin.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 */
import {
  computePerks,
  memberSettingWarnings,
  marginGuard,
  parsePerkConfig,
  totalPerkPct,
  type PerkConfig,
} from '../src/lib/perks.ts';

let passes = 0;
let failures = 0;

function eq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    passes++;
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name} — dapat ${String(actual)}, seharusnya ${String(expected)}`);
  }
}

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log(`  ok   ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
}

/** Config standar untuk kasus uji. */
function cfg(patch: Partial<PerkConfig> = {}): PerkConfig {
  return {
    pointsEvery: 10_000,
    pointValue: 100,
    memberDiscountPct: 10,
    cashbackPct: 5,
    birthdayActive: true,
    birthdayDiscountPct: 25,
    tierSilver: 1_000_000,
    tierGold: 5_000_000,
    ...patch,
  };
}

const baseInput = {
  subtotal: 100_000,
  totalCost: 40_000,
  lineDisc: 0,
  txDisc: 0,
  isBday: false,
  memberPoints: 0,
  memberCashbackBalance: 0,
  memberTotalSpent: 0,
  redeemRequested: 0,
};

console.log('── parsePerkConfig (normalisasi) ─────────────────────────────');
{
  const d = parsePerkConfig(null);
  eq('default pointsEvery', d.pointsEvery, 10_000);
  eq('default discount 0', d.memberDiscountPct, 0);
  eq('default birthday off', d.birthdayActive, false);

  const w = parsePerkConfig({
    member_discount: 'abc',
    points_every: '500',
    cashback: '5.9',
    birthday_active: '1',
    tier_silver: '-5',
  });
  eq('junk -> 0', w.memberDiscountPct, 0);
  eq('pointsEvery cap min 1000', w.pointsEvery, 1_000);
  eq('cashback floor 5.9 -> 5', w.cashbackPct, 5);
  eq('birthday_active "1" -> true', w.birthdayActive, true);
  eq('negatif -> 0', w.tierSilver, 0);
}

console.log('── marginGuard ──────────────────────────────────────────────');
{
  const g1 = marginGuard(100_000, 40_000, 0, 0);
  eq('margin kotor 60.000', g1.grossMargin, 60_000);
  eq('cap = margin (tanpa manual)', g1.cap, 60_000);
  eq('tidak over margin', g1.manualOverMargin, false);

  const g2 = marginGuard(100_000, 40_000, 70_000, 0);
  eq('manual menembus margin', g2.manualOverMargin, true);
  eq('cap dipatok 0', g2.cap, 0);

  const g3 = marginGuard(100_000.9, 40_000.6, 0, 0);
  eq('floor input', g3.grossMargin, 60_000);
}

console.log('── Kasus 1: margin sehat, tanpa clamping ───────────────────');
{
  const r = computePerks(cfg(), baseInput);
  eq('diskon 10% = 10.000', r.memberDiscount, 10_000);
  eq('redeem 0', r.redeem, 0);
  eq('cashback 5% x 90.000', r.cashback, 4_500);
  eq('total 90.000', r.total, 90_000);
  eq('poin 9', r.points, 9);
  eq('tier kosong', r.tier, '');
  eq('tidak dipangkas', r.clamped, false);
}

console.log('── Kasus 2: margin nol, semua perk dipangkas ───────────────');
{
  const r = computePerks(cfg(), { ...baseInput, totalCost: 100_000 });
  eq('diskon dipangkas 0', r.memberDiscount, 0);
  eq('cashback dipangkas 0', r.cashback, 0);
  eq('total tetap 100.000', r.total, 100_000);
  eq('dipangkas', r.clamped, true);
  eq('jumlah pangkas = keluaran mentah', r.clampedAmount, r.perkRawTotal);
  eq('manual tidak over (tidak ada diskon manual)', r.manualOverMargin, false);
}

console.log('── Kasus 3: margin negatif + diskon manual (soft flag) ─────');
{
  const r = computePerks(cfg(), { ...baseInput, totalCost: 120_000, lineDisc: 5_000 });
  eq('margin kotor -20.000', r.grossMargin, -20_000);
  eq('manualOverMargin true', r.manualOverMargin, true);
  eq('diskon dipangkas 0', r.memberDiscount, 0);
  eq('cashback dipangkas 0', r.cashback, 0);
  eq('diskon manual tetap berlaku', r.prePerk, 95_000);
  eq('total = prePerk', r.total, 95_000);
}

console.log('── Kasus 4: promo ulang tahun ──────────────────────────────');
{
  const r = computePerks(cfg(), { ...baseInput, isBday: true, subtotal: 200_000, totalCost: 50_000 });
  eq('birthdayApplied', r.birthdayApplied, true);
  eq('pakai 25% (bukan 10%)', r.memberDiscount, 50_000);
  eq('total 150.000', r.total, 150_000);

  // ultah KURANG dari base -> tetap pakai base (MAKS).
  const r2 = computePerks(cfg({ birthdayDiscountPct: 5, memberDiscountPct: 30 }), {
    ...baseInput,
    isBday: true,
    subtotal: 200_000,
    totalCost: 50_000,
  });
  eq('MAKS(bday 5%, base 30%) = 30%', r2.memberDiscount, 60_000);
}

console.log('── Kasus 5: redeem pakai poin dulu, cap ketersediaan ──────');
{
  const r = computePerks(cfg(), {
    ...baseInput,
    totalCost: 0,
    memberPoints: 50,
    memberCashbackBalance: 2_000,
    redeemRequested: 100_000,
  });
  eq('ketersediaan 50 poin + 2.000 = 7.000', r.redeem, 7_000);
  eq('poin dipakai dulu (50)', r.redeemPoints, 50);
  eq('nilai poin 5.000', r.redeemPtsValue, 5_000);
  eq('sisa dari cashback 2.000', r.redeemCash, 2_000);
  eq('total setelah redeem', r.total, 83_000);
}

console.log('── Kasus 6: urutan pemangkasan (cashback -> redeem -> diskon)');
{
  // Margin 5.000; keluaran mentah = diskon 10.000 + redeem 3.000 + cashback 4.350
  const r = computePerks(cfg(), {
    ...baseInput,
    totalCost: 95_000,
    memberCashbackBalance: 3_000,
    redeemRequested: 10_000,
  });
  eq('cashback dipangkas penuh', r.cashback, 0);
  eq('redeem dipangkas penuh', r.redeem, 0);
  eq('diskon dipangkas separuh', r.memberDiscount, 5_000);
  eq('total = subtotal - sisa diskon', r.total, 95_000);
  eq('dipangkas', r.clamped, true);
  eq('jumlah pangkas', r.clampedAmount, r.perkRawTotal - 5_000);
}

console.log('── Kasus 7: poin & auto-tier ──────────────────────────────');
{
  const silver = computePerks(cfg(), { ...baseInput, totalCost: 0, memberTotalSpent: 950_000 });
  eq('total 90.000 (diskon 10%)', silver.total, 90_000);
  eq('poin 9', silver.points, 9);
  eq('akumulasi 1.040.000 -> silver', silver.tier, 'silver');

  const gold = computePerks(cfg(), { ...baseInput, totalCost: 0, memberTotalSpent: 4_950_000 });
  eq('akumulasi 5.040.000 -> gold', gold.tier, 'gold');

  const none = computePerks(cfg(), { ...baseInput, totalCost: 0, memberTotalSpent: 0 });
  eq('belum ada tier', none.tier, '');
}

console.log('── Validasi lunak (peringatan setting) ─────────────────────');
{
  eq('beban 80+30 = 110%', totalPerkPct(cfg({ memberDiscountPct: 80, cashbackPct: 30 })), 110);
  const w1 = memberSettingWarnings(cfg({ memberDiscountPct: 80, cashbackPct: 30 }));
  check('peringatan >100%', w1.some((w) => w.includes('menembus 100%')), `${w1.length} peringatan`);

  const w2 = memberSettingWarnings(cfg({ pointValue: 10_000 }));
  check('peringatan poin >= biaya poin', w2.some((w) => w.includes('≥ biaya dapat 1 poin')), `${w2.length} peringatan`);

  eq('setting bersih -> tanpa peringatan', memberSettingWarnings(cfg({ pointValue: 100 })).length, 0);
}

console.log(`\n${passes} lulus, ${failures} gagal`);
if (failures > 0) process.exitCode = 1;

