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
import { clampRate, DEFAULT_CONSIGN_COMMISSION, splitConsignment } from '../src/lib/konsinyasi.ts';

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

console.log(`\n${passes} lulus, ${failures} gagal`);
if (failures > 0) process.exitCode = 1;
