/**
 * W15 P2a OMNISEARCH (2026-10-26) -- Unit test src/lib/calc.ts:
 * kalkulator aman (no eval/Function) utk command palette + deteksi
 * ekspresi + deep-link ?q= 3 titik (produk admin, member admin, kasir).
 * Suite 45 (test:all). Node langsung (type-stripping), konvensi sama
 * dgn test-health-meter.ts.
 *
 * Sifat yang diuji:
 *  - isCalcExpr: hanya digit/operator/kurung/persen + 1 digit + 1 operator;
 *  - safeCalc: hasil benar (prioritas operator, kurung, persen, unary,
 *    pembulatan desimal), null utk: divide by zero, kurung miring,
 *    operator rumpang, karakter asing, input kosong, overflow, double op;
 *  - formatCalcResult: locale id-ID;
 *  - modul hermetis: 0 non-ASCII, tanpa eval/Function, 0 import.
 */
import { CALC_MAX_LEN, formatCalcResult, isCalcExpr, safeCalc } from '../src/lib/calc.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

console.log('# calc (W15 P2a OmniSearch, suite 45)');

// ---- isCalcExpr ------------------------------------------------------
ok('deteksi: 25000 * 12 = true', isCalcExpr('25000 * 12') === true);
ok('deteksi: sari = false (bukan ekspresi)', isCalcExpr('sari') === false);
ok('deteksi: 5 = false (angka polos, biarkan live-search)', isCalcExpr('5') === false);
ok('deteksi: 10% = true', isCalcExpr('10%') === true);
ok('deteksi: (1+2) = true', isCalcExpr('(1+2)') === true);
ok('deteksi: kurung rumpang (1 = false (tak ada operator)', isCalcExpr('(1') === false);
ok('deteksi: " 3 + 4 " = true (trim)', isCalcExpr(' 3 + 4 ') === true);
ok('deteksi: >64 char = false', isCalcExpr('1'.repeat(CALC_MAX_LEN + 1) + '+' + '1'.repeat(10)) === false);

// ---- safeCalc: hasil benar ------------------------------------------
ok('25000 * 12 = 300000 (contoh GO)', safeCalc('25000 * 12') === 300000);
ok('2 + 2 = 4', safeCalc('2 + 2') === 4);
ok('10 - 4 = 6', safeCalc('10 - 4') === 6);
ok('10 / 4 = 2.5', safeCalc('10 / 4') === 2.5);
ok('prioritas: 2 * 3 + 4 = 10', safeCalc('2 * 3 + 4') === 10);
ok('prioritas: 100 - 50 * 2 = 0', safeCalc('100 - 50 * 2') === 0);
ok('kurung: (2 + 3) * 4 = 20', safeCalc('(2 + 3) * 4') === 20);
ok('kurung dalam: 2 + (3 * 4) = 14', safeCalc('2 + (3 * 4)') === 14);
ok('persen: 10% = 0.1', safeCalc('10%') === 0.1);
ok('persen: 50% * 20 = 10', safeCalc('50% * 20') === 10);
ok('unary: -5 + 10 = 5', safeCalc('-5 + 10') === 5);
ok('unary: 3 * -2 = -6', safeCalc('3 * -2') === -6);
ok('unary kurung: -(3) = -3', safeCalc('-(3)') === -3);
ok('unary kurung: (-2) * 3 = -6', safeCalc('(-2) * 3') === -6);
ok('unary kurung: (-5) + 10 = 5', safeCalc('(-5) + 10') === 5);
ok('unary mix: 3 - -2 = 5', safeCalc('3 - -2') === 5);
ok('unary mix: 2 * -3 + 1 = -5', safeCalc('2 * -3 + 1') === -5);
ok('negasi dobel: --5 = 5', safeCalc('--5') === 5);
ok('unary plus: 3++2 = 5', safeCalc('3++2') === 5);
ok('unary plus: 3 * +2 = 6', safeCalc('3 * +2') === 6);
ok('desimal: 0.1 + 0.2 = 0.3 (bulatkan 4 desimal)', safeCalc('0.1 + 0.2') === 0.3);
ok('spasi bebas: " 3 + 4 " = 7', safeCalc(' 3 + 4 ') === 7);

// ---- safeCalc: null (anti crash / anti input aneh) ------------------
ok('div by zero: 1 / 0 = null', safeCalc('1 / 0') === null);
ok('div by zero: 0 / 0 = null', safeCalc('0 / 0') === null);
ok('kurung miring: (1 + 2 = null', safeCalc('(1 + 2') === null);
ok('kurung miring: 1 + 2) = null', safeCalc('1 + 2)') === null);
ok('operator rumpang: 1 + = null', safeCalc('1 +') === null);
ok('operator rumpang: * 5 = null', safeCalc('* 5') === null);
ok('operator rumpang: 5 + * 3 = null', safeCalc('5 + * 3') === null);
ok('input kosong = null', safeCalc('') === null);
ok('huruf: sari = null', safeCalc('sari') === null);
ok('desimal ganda: 1.2.3 * 2 = null', safeCalc('1.2.3 * 2') === null);
ok('double op: 2 ** 3 = null', safeCalc('2 ** 3') === null);
ok('e-notation: 9e999 = null (huruf e tak didukung)', safeCalc('9e999') === null);
ok('persen rumpang: % 5 = null', safeCalc('% 5') === null);
ok('overflow: hasil > 1e12 = null', safeCalc('1000000000 * 1000000000') === null);

// ---- formatCalcResult -------------------------------------------------
ok('format: 300000 -> 300.000 (id-ID)', formatCalcResult(300000) === '300.000');
ok('format: 2.5 -> 2,5 (koma desimal id-ID)', formatCalcResult(2.5) === '2,5');
ok('format: 0.1 -> 0,1 (koma desimal id-ID)', formatCalcResult(0.1) === '0,1');

// ---- hermetis ----------------------------------------------------------
const src = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'calc.ts'), 'utf8');
ok('modul: 0 karakter non-ASCII', !/[\u0080-\uFFFF]/.test(src));
ok('modul: TANPA eval(', !src.includes('eval('));
ok('modul: TANPA new Function(', !src.includes('new Function('));
ok('modul: 0 import (pure)', !/^\s*import\s/m.test(src));

console.log('');
console.log(passes + ' passed, ' + failures + ' failed');
if (failures > 0) process.exit(1);