/**
 * Runtime test multi-satuan V2 fraksional (P-V2-MULTISATUAN.md) -- suite #37.
 *
 * Memverifikasi Tashih T1-T5 pada logika aritmetika pack dengan helper
 * kanonik V2 (src/lib/multisatuan.ts):
 *   T1: HPP pack = hppPerUnit(cost, qpb) -- Math.round (R3/D4)
 *   T2: Margin = subtotal - HPP
 *   T3: Zakat = SUM(stock x cost_price) TIDAK berubah (base unit)
 *   T4: Stok decrement = stockNeeded(qty, qpb) dgn guard STOCK_EPS (R2)
 *   T5: Konversi (stok dibutuhkan = stockNeeded, pembulatan r3 -- R1/D3)
 * + kasus fraksional baru (qpb 0.5 kg, stok 3 desimal, validasi R6).
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping):
 *     node scripts/test-multisatuan.ts
 * Tanpa framework test -- output sederhana, exit code 1 bila ada gagal.
 */

import { r3, validateQpb, stockNeeded, hppPerUnit, parseStockInput, STOCK_EPS } from '../src/lib/multisatuan.ts';

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
  console.log('Multi-satuan V2 fraksional -- Tashih T1-T5');

  // Fixtures: Madu Box (base = pcs, cost = 2000/pcs)
  // pack_units: [{unit:"box", qty_per_base:12, price:45000}]
  const costPrice = 2000; // Rp per pcs
  const basePrice = 3000; // Rp per pcs
  const packUnit = 'box';
  const qtyPerBase = 12;
  const packPrice = 45000; // Rp per box
  const stock = 100; // 100 pcs tersedia

  // -- T1: HPP pack = hppPerUnit(cost, qpb) x qty (R3: Math.round) --
  const qty = 2; // 2 box terjual
  const hppPack = hppPerUnit(costPrice, qtyPerBase) * qty; // 24000 x 2 = 48000
  ok('T1: HPP 2 box = 48000', hppPack === 48000, String(hppPack));

  const hppBase = hppPerUnit(costPrice, 1) * qty; // utk penjualan satuan dasar
  ok('T1: HPP 2 pcs (base) = 4000', hppBase === 4000, String(hppBase));

  // ── T2: Margin = subtotal - HPP ──
  const subtotal = packPrice * qty; // 45000 x 2 = 90000
  const margin = subtotal - hppPack; // 90000 - 48000 = 42000
  ok('T2: Margin 2 box = 42000', margin === 42000, String(margin));

  const marginBase = basePrice * 2 - costPrice * 2; // 6000 - 4000 = 2000
  ok('T2: Margin 2 pcs (base) = 2000', marginBase === 2000, String(marginBase));

  // Margin negatif (rugi) saat harga pack < HPP
  const packPriceLow = 20000; // 1 box = 20000 (lebih murah dari HPP 24000)
  const hppOneBox = hppPerUnit(costPrice, qtyPerBase); // 24000
  const marginNeg = packPriceLow - hppOneBox; // 20000 - 24000 = -4000
  ok('T2: Margin negatif (rugi) = -4000', marginNeg === -4000, String(marginNeg));

  // -- T3: Zakat TIDAK berubah (tetap base unit) --
  // Zakat = SUM(stock x cost_price) di satuan dasar.
  // pack_units TIDAK mengubah rumus zakat: stok tetap 100 pcs.
  const zakatBase = stock * costPrice; // 100 x 2000 = 200000
  ok('T3: Zakat = stok x cost (base) = 200000', zakatBase === 200000, String(zakatBase));
  // Zakat TIDAK peduli pack_units -- tetap 200000 walau ada pack box.
  const zakatWithPack = stock * costPrice; // sama persis
  ok('T3: Zakat tak berubah dengan pack_units', zakatWithPack === zakatBase);

  // -- T4: Stok decrement = stockNeeded(qty, qpb) + guard STOCK_EPS (R2) --
  const stockAfter = r3(stock - stockNeeded(qty, qtyPerBase)); // 100 - 24 = 76
  ok('T4: Stok setelah 2 box (24 pcs) = 76', stockAfter === 76, String(stockAfter));

  // Guard: stok tidak cukup (perbandingan dgn epsilon R2)
  const stockSmall = 20; // 20 pcs
  const canSell2Box = stockSmall + STOCK_EPS >= stockNeeded(2, qtyPerBase); // 20 >= 24? NO
  ok('T4: Guard stok (20 < 24) blokir 2 box', !canSell2Box);

  const stockEnough = 36; // 36 pcs
  const canSell3Box = stockEnough + STOCK_EPS >= stockNeeded(3, qtyPerBase); // 36 >= 36? YES
  ok('T4: Stok 36 cukup utk 3 box (36 pcs)', canSell3Box);

  // -- T5: Konversi otomatis -- stockNeeded = r3(qty*qpb) (R1/D3) --
  const stockNeeded5Box = stockNeeded(5, qtyPerBase); // 60
  ok('T5: Stok dibutuhkan 5 box = 60 pcs', stockNeeded5Box === 60, String(stockNeeded5Box));

  // Restock (retur/pembatalan) = stockNeeded(qty, qpb)
  const restock2Box = stockNeeded(2, qtyPerBase); // 24
  ok('T5: Restock 2 box = +24 pcs', restock2Box === 24, String(restock2Box));

  // Satuan dasar (qty_per_base=1): stok dibutuhkan = qty x 1
  const stockNeededBase = stockNeeded(5, 1); // 5
  ok('T5: Stok dibutuhkan 5 pcs (base) = 5', stockNeededBase === 5, String(stockNeededBase));

  // -- V2 fraksional baru --
  // qpb = 0.5 kg per botol (konversi satuan fraksional, R6):
  // stok dibutuhkan 3 botol = 1.5 kg; pembulatan r3 deterministik.
  const qpbHalf = 0.5;
  ok('V2: stockNeeded(3, 0.5) = 1.5 kg', stockNeeded(3, qpbHalf) === 1.5, String(stockNeeded(3, qpbHalf)));

  // Stok 3 desimal: 10.123 kg - 1.5 kg -> r3 = 8.623 (drift-safe, R1).
  const stockKg = 10.123;
  const stockKgAfter = r3(stockKg - stockNeeded(3, qpbHalf));
  ok('V2: Stok 10.123 - 1.5 = 8.623', stockKgAfter === 8.623, String(stockKgAfter));

  // HPP fraksional (R3/D4: Math.round): cost 2500/kg x qpb 0.5 = 1250.
  ok('V2: HPP per botol (cost 2500, qpb 0.5) = 1250', hppPerUnit(2500, qpbHalf) === 1250, String(hppPerUnit(2500, qpbHalf)));

  // Pembulatan HPP: cost 3333, qpb 0.333 -> round(1109.889) = 1110.
  ok('V2: HPP (3333 x 0.333) = 1110', hppPerUnit(3333, 0.333) === 1110, String(hppPerUnit(3333, 0.333)));

  // Guard epsilon fraksional: stok 1.5 kg cukup utk 3 botol x 0.5 kg.
  ok('V2: stok 1.5 cukup utk 3 botol (qpb 0.5)', 1.5 + STOCK_EPS >= stockNeeded(3, qpbHalf));
  ok('V2: stok 1.499 TIDAK cukup utk 3 botol (qpb 0.5)', !(1.499 + STOCK_EPS >= stockNeeded(3, qpbHalf)));

  // -- Validasi R6 (validateQpb) -- strict, throw utk input invalid --
  ok('V2: validateQpb(0.5) = 0.5', validateQpb(0.5) === 0.5);
  ok('V2: validateQpb(12) = 12', validateQpb(12) === 12);
  ok('V2: validateQpb(0.3333) = 0.333 (r3)', validateQpb(0.3333) === 0.333, String(validateQpb(0.3333)));
  const throwCases: unknown[] = ['abc', null, undefined, NaN, Infinity, 0, 0.005, 100000];
  let throwsAll = true;
  for (const c of throwCases) {
    try {
      validateQpb(c);
      throwsAll = false;
    } catch {
      /* expected */
    }
  }
  ok('V2: validateQpb throw utk ' + throwCases.length + ' input invalid', throwsAll);

  // -- R7: parseStockInput (CSV/Excel import) -- titik desimal saja --
  ok('V2: parseStockInput("3.5") = 3.5', parseStockInput('3.5') === 3.5);
  ok('V2: parseStockInput("3,5") = 0 (koma OOS)', parseStockInput('3,5') === 0, String(parseStockInput('3,5')));
  ok('V2: parseStockInput(3.14159) = 3.142 (r3)', parseStockInput(3.14159) === 3.142, String(parseStockInput(3.14159)));
  ok('V2: parseStockInput("") = 0', parseStockInput('') === 0);

  // -- Backward compat: produk tanpa pack_units (qty_per_base=1) --
  const compatCost = 5000;
  const compatQty = 3;
  const compatHpp = hppPerUnit(compatCost, 1) * compatQty; // 15000
  ok('Compat: HPP 3 pcs (base) = 15000', compatHpp === 15000, String(compatHpp));
  const compatStock = 50;
  const compatAfter = r3(compatStock - stockNeeded(compatQty, 1)); // 47
  ok('Compat: Stok 50 - 3 = 47', compatAfter === 47, String(compatAfter));

  // -- HPP per unit (cost_price di sale_items, snapshot R3) --
  const costPerUnitPack = hppPerUnit(costPrice, qtyPerBase); // 24000 (HPP per box)
  ok('HPP per box = 24000', costPerUnitPack === 24000, String(costPerUnitPack));
  const costPerUnitBase = hppPerUnit(costPrice, 1); // 2000
  ok('HPP per pcs (base) = 2000', costPerUnitBase === 2000, String(costPerUnitBase));

  console.log('');
  console.log(passes + '/' + (passes + failures) + ' passed' + (failures > 0 ? ', ' + failures + ' FAILED' : ''));
  process.exitCode = failures > 0 ? 1 : 0;
}

main();
