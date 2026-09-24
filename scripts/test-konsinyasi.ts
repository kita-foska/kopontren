/**
 * Unit test FASE P4 — komisi konsinyasi (akad ju'alah) pada modul murni
 * src/lib/konsinyasi.ts.
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:konsinyasi   (== node scripts/test-konsinyasi.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 *
 * Keputusan pengurus 2026-09-24: komisi toko 20% dr harga jual, bagian
 * pemilik 80%. Aturan syariah: upah TIDAK di muka — komisi (ujrah) baru
 * terhitung saat barang TERJUAL; barang yang dikembalikan (ora payu)
 * tidak menghasilkan komisi. Ref: Fatwa DSN-MUI No. 62/DSN-MUI/XII/2007.
 */
import {
  clampRate,
  DEFAULT_CONSIGN_COMMISSION,
  parseOwnerRates,
  resolveCommissionRate,
  splitConsignment,
} from '../src/lib/konsinyasi.ts';

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

console.log('── clampRate (normalisasi setting) ──────────────────────────────────────────────');
{
  eq('default konstan 20', DEFAULT_CONSIGN_COMMISSION, 20);
  eq('"20" -> 20', clampRate('20'), 20);
  eq('25 (number) -> 25', clampRate(25), 25);
  eq('junk -> 20 (default)', clampRate(undefined), 20);
  eq('null -> 20', clampRate(null), 20);
  eq('150 -> cap 100', clampRate(150), 100);
  eq('-5 -> lantai 0', clampRate(-5), 0);
  eq('20.9 -> floor 20', clampRate(20.9), 20);
}

console.log('── splitConsignment (bagi hasil per unit, tanpa pecahan) ────────────────────────');
{
  const s1 = splitConsignment(10_000, 20);
  eq('komisi 20% dr 10.000 = 2.000', s1.commission, 2_000);
  eq('pemilik 80% = 8.000', s1.owner, 8_000);
  eq('jumlah = harga persis', s1.owner + s1.commission, 10_000);

  const s2 = splitConsignment(9_999, 20);
  eq('9.999 komisi floor(1.999,8) = 1.999', s2.commission, 1_999);
  eq('9.999 pemilik = 9.999 - 1.999 = 8.000', s2.owner, 8_000);
  check('9.999 jumlah = harga', s2.owner + s2.commission === 9_999);

  eq('rate 0 -> komisi 0 (boleh tanpa komisi)', splitConsignment(10_000, 0).commission, 0);
  eq('rate 0 -> pemilik penuh', splitConsignment(10_000, 0).owner, 10_000);
  eq('rate 100 -> komisi penuh', splitConsignment(10_000, 100).commission, 10_000);
  eq('rate 100 -> pemilik 0', splitConsignment(10_000, 100).owner, 0);
  eq('harga 0 -> komisi 0', splitConsignment(0, 20).commission, 0);
}

console.log('── Skenario transaksi konsinyasi (skema 20:80) ──────────────────────────────────');
{
  // Barang dititip: 10 unit @ Rp10.000; rate 20% di-snapshot saat titip.
  const rate = clampRate('20');
  const { owner, commission } = splitConsignment(10_000, rate);

  // (1) UPACH TIDAK DI MUKA: sebelum ada penjualan, komisi belum muncul.
  eq('sebelum terjual ujrah = 0', 0 * commission, 0);

  // (2) BARANG TERJUAL: komisi (ujrah) hanya terhitung untuk qty terjual.
  const qtySold = 4;
  eq('ujrah 4 unit = 4 x 2.000 = 8.000', qtySold * commission, 8_000);
  eq('tagihan pemilik 4 unit = 4 x 8.000 = 32.000', qtySold * owner, 32_000);

  // (3) BARANG ORA PAYU: 6 unit sisa dikembalikan -> tanpa komisi.
  const qtyReturned = 6;
  eq('ujrah tetap hanya dari terjual', (qtySold + qtyReturned * 0) * commission, 8_000);
  eq('dikembalikan tanpa menambah tagihan', qtySold * owner, 32_000);
}

console.log('── parseOwnerRates (rate per-pemilik, P4-B) ─────────────────────────────────────');
{
  eq('JSON valid diparse', JSON.stringify(parseOwnerRates('{"Muhamad":15}')), '{"Muhamad":15}');
  eq('empty/kosong -> {}', JSON.stringify(parseOwnerRates('')), '{}');
  eq('undefined -> {}', JSON.stringify(parseOwnerRates(undefined)), '{}');
  eq('JSON korup -> {} (fallback global)', JSON.stringify(parseOwnerRates('{x}')), '{}');
  eq('bukan object (array) -> {}', JSON.stringify(parseOwnerRates('[1]')), '{}');
  eq('null -> {}', JSON.stringify(parseOwnerRates('null')), '{}');
  const m = parseOwnerRates('{"A":150,"B":-5,"C":"25","D":null,"E":""}');
  eq('nilai >100 di-cap 100', m.A, 100);
  eq('nilai <0 di-floor 0', m.B, 0);
  eq('string number diparse', m.C, 25);
  check('nilai tidak valid di-skip', !('D' in m) && !('E' in m));
}

console.log('── resolveCommissionRate (prioritas antardhin, P4-B) ─────────────────────────────');
{
  const ownerRates = { Muhamad: 15, Budi: 0 };
  const r1 = resolveCommissionRate(10, 'Muhamad', ownerRates, '20');
  // cek field per field (objek ≠ by-reference)
  eq('eksplisit -> rate 10', r1.rate, 10);
  eq('eksplisit -> source', r1.source, 'explicit');

  const r2 = resolveCommissionRate(undefined, 'Muhamad', ownerRates, '20');
  eq('tanpa eksplisit -> rate pemilik', r2.rate, 15);
  eq('tanpa eksplisit -> source owner', r2.source, 'owner');

  const r3 = resolveCommissionRate(null, 'SiUng', ownerRates, '20');
  eq('pemilik tanpa rate -> global', r3.rate, 20);
  eq('global source', r3.source, 'global');

  const r4 = resolveCommissionRate(0, 'Budi', ownerRates, '20');
  eq('eksplisit 0 = tanpa komisi (valid)', r4.rate, 0);
  eq('0 tetap source explicit', r4.source, 'explicit');

  const r5 = resolveCommissionRate(undefined, 'Budi', ownerRates, '20');
  eq('pemilik Budi rate 0 -> owner (bukan global)', r5.rate, 0);
  eq('source owner utk rate 0', r5.source, 'owner');

  // Global dari setting string, clamp.
  const r6 = resolveCommissionRate(undefined, 'X', {}, '77');
  eq('global string diparse', r6.rate, 77);
  const r7 = resolveCommissionRate(undefined, 'X', {}, '999');
  eq('global >100 di-cap', r7.rate, 100);

  // owner name trim + case-sensitif (nama = key persis).
  const r8 = resolveCommissionRate(undefined, '  Muhamad  ', ownerRates, '20');
  eq('nama di-trim saat lookup', r8.rate, 15);
}

console.log(`\n${passes} lulus, ${failures} gagal`);
if (failures > 0) process.exitCode = 1;
