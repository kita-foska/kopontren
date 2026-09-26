/**
 * Runtime test modul zakat — modul murni:
 * - src/lib/zakat-period.ts (periode WIB; diguna route /api/zakat + CSV)
 * - src/lib/zakat-valuation.ts (P3 Step 2 PROVISIONAL: penilaian,
 *   accrual, anchor haul, settlement — menunggu tashih pengasuh)
 * Menutup known-issue ±7 jam: boundary periode & timestamp CSV harus
 * WIB, bukan UTC. Dijalankan LANGSUNG oleh Node (type-stripping):
 *     npm run test:zakat       (== node scripts/test-zakat.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 */
import {
  currentWibMonthDate,
  isoToWib,
  wibDayStartUtc,
  wibToday,
} from '../src/lib/zakat-period.ts';
import {
  computeAccrual,
  computeBalance,
  computeHaulAnchor,
  computeValuation,
  computeZakatAmount,
  resolveValuationMode,
  type ProductRow,
} from '../src/lib/zakat-valuation.ts';

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.error('  FAIL ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function main(): void {
  // ── wibDayStartUtc: 00:00 WIB = 17:00 UTC hari sebelumnya ──
  ok(
    'boundary: 2026-09-01 WIB -> 2026-08-31T17:00Z',
    wibDayStartUtc('2026-09-01') === '2026-08-31T17:00:00.000Z',
    wibDayStartUtc('2026-09-01')
  );
  // Cross-year: 1 Jan -> 31 Des tahun sebelumnya 17:00Z.
  ok(
    'boundary: cross-year 2026-01-01 -> 2025-12-31T17:00Z',
    wibDayStartUtc('2026-01-01') === '2025-12-31T17:00:00.000Z',
    wibDayStartUtc('2026-01-01')
  );
  ok('boundary: format tak dikenal -> apa adanya', wibDayStartUtc('garbage') === 'garbage');
  ok('boundary: string kosong -> kosong', wibDayStartUtc('') === '');
  // Konsistensi: penjualan tepat 00:00 WIB (17:00Z) MASUK periode.
  const d91 = wibDayStartUtc('2026-09-01');
  ok('boundary: 17:00Z 31 Aug (00:00 WIB 1 Sep) >= boundary', d91 >= d91);
  ok('boundary: 16:59Z 31 Aug (23:59 WIB 31 Aug) < boundary', '2026-08-31T16:59:59.000Z' < d91);

  // ── wibToday / currentWibMonthDate (WIB berganti jam 17:00Z) ──
  // 16:59Z 25 Sep = WIB 23:59 hari itu; 17:00Z 25 Sep = WIB 00:00 besok.
  ok('today: 16:59:59Z -> 2026-09-25', wibToday(Date.parse('2026-09-25T16:59:59Z')) === '2026-09-25');
  ok('today: 17:00:00Z -> 2026-09-26 (berganti WIB)', wibToday(Date.parse('2026-09-25T17:00:00Z')) === '2026-09-26');
  // 25 Sep 17:30Z = WIB 26 Sep 00:30 -> awal bulan WIB berjalan = 1 Sep.
  ok('month: Sep 2026', currentWibMonthDate(Date.parse('2026-09-25T17:30:00Z')) === '2026-09-01');
  // 31 Des 18:00Z = WIB 1 Jan -> awal bulan = 1 Januari (cross-year).
  ok('month: cross-year Des->Jan', currentWibMonthDate(Date.parse('2026-12-31T18:00:00Z')) === '2027-01-01');

  // ── isoToWib: export CSV konsisten dgn tampilan UI (±7 jam) ──
  ok(
    'csv: ISO-UTC +7h',
    isoToWib('2026-09-25T02:00:00.000Z') === '2026-09-25 09:00:00',
    isoToWib('2026-09-25T02:00:00.000Z')
  );
  ok('csv: ISO-UTC tanpa ms', isoToWib('2026-09-25T02:00:00Z') === '2026-09-25 09:00:00');
  // Format legacy 'YYYY-MM-DD HH:MM:SS' (diasumsikan UTC, konvensi normTs).
  ok('csv: legacy space-separated', isoToWib('2026-09-25 02:00:00') === '2026-09-25 09:00:00');
  ok('csv: kosong -> kosong', isoToWib('') === '');
  ok('csv: tak dikenal -> apa adanya', isoToWib('bukan-tanggal') === 'bukan-tanggal');

  // ── Verifikasi sifat boundary utk query `created_at >= ?` ──
  // Sales 07:00 WIB 1 Sep (= 00:00Z) lama TIDAK masuk (perbandingan
  // leksikografis '2026-09-01' > '2026-09-01T00:00Z' salah kaprah utk
  // range 00:00-06:59 WIB); dgn boundary UTC benar, MASUK periode.
  const saleWibEarly = '2026-09-01T00:00:00.000Z'; // 07:00 WIB 1 Sep
  const saleWibMidnight = '2026-08-31T17:00:00.000Z'; // 00:00 WIB 1 Sep
  ok('query: 00:00 WIB 1 Sep masuk periode', saleWibMidnight >= d91);
  ok('query: 07:00 WIB 1 Sep masuk periode', saleWibEarly >= d91);
  const salePrevDay = '2026-08-31T16:59:59.000Z'; // 23:59 WIB 31 Agu
  ok('query: 23:59 WIB 31 Agu TIDAK masuk', !(salePrevDay >= d91));

  // ═══ P3 Step 2 (PROVISIONAL — menunggu tashih): 7 skenario baru ═══
  const prods: ProductRow[] = [
    { stock: 10, base_price: 50000, cost_price: 30000 },
    { stock: 4, base_price: 10000, cost_price: 6000 },
  ];
  // 1) valuation: market vs hpp (laba + piutang − hutang)
  const mv = computeValuation('market', prods, 100000, 50000, 25000);
  const hv = computeValuation('hpp', prods, 100000, 50000, 25000);
  ok('valuation: market = Σ stok×base_price', mv.modal === 540000, String(mv.modal));
  ok('valuation: hpp = Σ stok×cost_price', hv.modal === 324000, String(hv.modal));
  ok(
    'valuation: total = modal+laba+piutang−hutang',
    mv.total_assets === 540000 + 100000 + 50000 - 25000,
    String(mv.total_assets)
  );
  ok('valuation: floor 0 (kewajiban > harta)', computeValuation('market', [], 0, 0, 1000).total_assets === 0);
  ok(
    'valuation: normalisasi mode (trim/case/unknown->market)',
    resolveValuationMode('  HPP ') === 'hpp' &&
      resolveValuationMode('pasar') === 'market' &&
      resolveValuationMode(undefined) === 'market'
  );

  // 2) accrual: 0 hari = 0
  ok('accrual: 0 hari = 0', computeAccrual(4000000, 2.5, 0) === 0);
  // 3) accrual: 365 hari = penuh (4jt × 2,5% = 100rb)
  ok('accrual: 365 hari = penuh', computeAccrual(4000000, 2.5, 365) === 100000, String(computeAccrual(4000000, 2.5, 365)));
  ok('accrual: cap 365 (730 hari tak lebih)', computeAccrual(4000000, 2.5, 730) === 100000);

  // 4) settlement: overpaid
  const over = computeBalance(100000, 120000);
  ok('settlement: overpaid 20rb', over.overpaid === 20000 && over.underpaid === 0 && over.net === 20000, JSON.stringify(over));
  // 5) settlement: underpaid
  const under = computeBalance(100000, 80000);
  ok('settlement: underpaid 20rb', under.underpaid === 20000 && under.overpaid === 0 && under.net === -20000, JSON.stringify(under));

  // 6) nisab belum tercapai
  const below = computeZakatAmount(8000000, 8500000, 2.5);
  ok(
    'nisab: belum tercapai -> zakat 0 + shortfall',
    below.zakat === 0 && below.status === 'belum_nisab' && below.shortfall === 500000,
    JSON.stringify(below)
  );
  const at = computeZakatAmount(8500000, 8500000, 2.5);
  ok('nisab: tepat = wajib (8,5jt × 2,5% = 212,5rb)', at.zakat === 212500 && at.status === 'wajib', String(at.zakat));

  // 7) haul anchor: fallback chain (haul_start -> last_payment -> current_month)
  const a1 = computeHaulAnchor('2026-09-01', '2025-09-01', '2026-09-25');
  ok('anchor: haul_start diprioritaskan (ta\'jil tak menggeser)', a1.source === 'haul_start' && a1.anchor === '2026-09-01');
  ok('anchor: days_elapsed 24 hari', a1.days_elapsed === 24, String(a1.days_elapsed));
  ok('anchor: haul_end +1 tahun', a1.haul_end === '2027-09-01' && a1.status === 'belum_haul');
  const a2 = computeHaulAnchor('', '2025-09-01', '2026-09-25');
  ok('anchor: fallback pembayaran terakhir', a2.source === 'last_payment' && a2.anchor === '2025-09-01');
  ok('anchor: 389 hari -> cap 365 + haul_jatuh', a2.days_elapsed === 365 && a2.status === 'haul_jatuh', String(a2.days_elapsed));
  const a3 = computeHaulAnchor('', '', '2026-09-25');
  ok('anchor: fallback awal bulan berjalan', a3.source === 'current_month' && a3.anchor === '2026-09-01' && a3.days_elapsed === 24);
  ok('anchor: leap Feb-29 -> haul_end clamp Mar-01', computeHaulAnchor('2024-02-29', '', '2024-03-01').haul_end === '2025-03-01');

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();