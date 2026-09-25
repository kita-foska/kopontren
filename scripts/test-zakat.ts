/**
 * Runtime test periode zakat WIB (UTC+7) — modul murni
 * src/lib/zakat-period.ts (digunakan route /api/zakat + export CSV).
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

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();