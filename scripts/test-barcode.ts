/**
 * Runtime test Barcode ID (Wave 8 Item 2, ruling R1-R5) -- suite #38.
 *
 * Verifikasi helper murni src/lib/barcode.ts (format R2: KP-{id:05d}):
 *   B1: deterministik + zero-pad 5 digit (KP-00042, KP-00007, KP-00001)
 *   B2: id besar tanpa truncation (KP-99999, KP-100000, KP-1000000)
 *   B3: input tak valid menghasilkan '' (0, negatif, NaN, Infinity)
 *   B4: fraksional difloor-kan (3.7 -> KP-00003)
 *   B5: isKpBarcode formal: shape-only (KP-\d{5,9}), case-sensitive
 *   B6: konstanta format (prefix KP-, lebar minimal 5)
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping):
 *     node scripts/test-barcode.ts
 * Tanpa framework test -- output sederhana, exit code 1 bila ada gagal.
 */

import { kpBarcode, isKpBarcode, KP_PREFIX, KP_MIN_DIGITS } from '../src/lib/barcode.ts';

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
  console.log('Barcode ID (W8 Item 2, R2) -- helper murni kpBarcode');

  // B1: deterministik + zero-pad.
  ok('B1.1 id=42 -> KP-00042', kpBarcode(42) === 'KP-00042', kpBarcode(42));
  ok('B1.2 id=7 -> KP-00007', kpBarcode(7) === 'KP-00007', kpBarcode(7));
  ok('B1.3 id=1 -> KP-00001', kpBarcode(1) === 'KP-00001', kpBarcode(1));
  ok('B1.4 deterministik', kpBarcode(42) === kpBarcode(42));

  // B2: id besar tanpa truncation.
  ok('B2.1 id=99999 -> KP-99999', kpBarcode(99999) === 'KP-99999', kpBarcode(99999));
  ok('B2.2 id=100000 -> KP-100000', kpBarcode(100000) === 'KP-100000', kpBarcode(100000));
  ok('B2.3 id=1000000 -> KP-1000000', kpBarcode(1000000) === 'KP-1000000', kpBarcode(1000000));

  // B3: input tak valid -> ''.
  ok('B3.1 id=0 -> ""', kpBarcode(0) === '', kpBarcode(0));
  ok('B3.2 id=-3 -> ""', kpBarcode(-3) === '', kpBarcode(-3));
  ok('B3.3 NaN -> ""', kpBarcode(Number.NaN) === '');
  ok('B3.4 Infinity -> ""', kpBarcode(Number.POSITIVE_INFINITY) === '');

  // B4: fraksional difloor.
  ok('B4.1 id=3.7 -> KP-00003', kpBarcode(3.7) === 'KP-00003', kpBarcode(3.7));
  ok('B4.2 id=4.9 -> KP-00004', kpBarcode(4.9) === 'KP-00004', kpBarcode(4.9));

  // B5: isKpBarcode formal (shape-only).
  ok('B5.1 KP-00042 valid', isKpBarcode('KP-00042') === true);
  ok('B5.2 kp-00042 (lowercase) invalid', isKpBarcode('kp-00042') === false);
  ok('B5.3 KP-123 (3 digit) invalid', isKpBarcode('KP-123') === false);
  ok('B5.4 KP-100000 valid', isKpBarcode('KP-100000') === true);
  ok('B5.5 KP-123456789 valid (9 digit)', isKpBarcode('KP-123456789') === true);
  ok('B5.6 TPI-01 (kode manual) bukan shape KP', isKpBarcode('TPI-01') === false);
  ok('B5.7 string kosong invalid', isKpBarcode('') === false);

  // B6: konstanta format.
  ok('B6.1 prefix = "KP-"', KP_PREFIX === 'KP-', JSON.stringify(KP_PREFIX));
  ok('B6.2 lebar minimal digit = 5', KP_MIN_DIGITS === 5, String(KP_MIN_DIGITS));

  console.log(failures === 0 ? 'ALL PASS (' + passes + ')' : failures + ' GAGAL');
  if (failures > 0) process.exit(1);
}

main();
