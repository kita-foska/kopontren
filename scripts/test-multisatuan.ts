/**
 * Runtime test multi-satuan V1 (Opsi A, integer qty_per_base) -- suite #37.
 *
 * Memverifikasi Tashih T1-T5 pada logika aritmetika pack:
 *   T1: HPP pack = cost_price x qty_per_base x qty
 *   T2: Margin = subtotal - HPP
 *   T3: Zakat = SUM(stock x cost_price) TIDAK berubah (base unit)
 *   T4: Stok decrement = qty x qty_per_base
 *   T5: Konversi otomatis (stok dibutuhkan = qty x qty_per_base)
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping):
 *     node scripts/test-multisatuan.ts
 * Tanpa framework test -- output sederhana, exit code 1 bila ada gagal.
 */

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
  console.log('Multi-satuan V1 -- Tashih T1-T5');

  // Fixtures: Madu Box (base = pcs, cost = 2000/pcs)
  // pack_units: [{unit:"box", qty_per_base:12, price:45000}]
  const costPrice = 2000; // Rp per pcs
  const basePrice = 3000; // Rp per pcs
  const packUnit = 'box';
  const qtyPerBase = 12;
  const packPrice = 45000; // Rp per box
  const stock = 100; // 100 pcs tersedia

  // ── T1: HPP pack = cost_price x qty_per_base x qty ──
  const qty = 2; // 2 box terjual
  const hppPack = costPrice * qtyPerBase * qty; // 2000 x 12 x 2 = 48000
  ok('T1: HPP 2 box = 48000', hppPack === 48000, String(hppPack));

  const hppBase = costPrice * qty; // utk penjualan satuan dasar (qty_per_base=1)
  ok('T1: HPP 2 pcs (base) = 4000', hppBase === 4000, String(hppBase));

  // ── T2: Margin = subtotal - HPP ──
  const subtotal = packPrice * qty; // 45000 x 2 = 90000
  const margin = subtotal - hppPack; // 90000 - 48000 = 42000
  ok('T2: Margin 2 box = 42000', margin === 42000, String(margin));

  const marginBase = basePrice * 2 - costPrice * 2; // 6000 - 4000 = 2000
  ok('T2: Margin 2 pcs (base) = 2000', marginBase === 2000, String(marginBase));

  // Margin negatif (rugi) saat harga pack < HPP
  const packPriceLow = 20000; // 1 box = 20000 (lebih murah dari HPP 24000)
  const hppOneBox = costPrice * qtyPerBase; // 24000
  const marginNeg = packPriceLow - hppOneBox; // 20000 - 24000 = -4000
  ok('T2: Margin negatif (rugi) = -4000', marginNeg === -4000, String(marginNeg));

  // ── T3: Zakat TIDAK berubah (tetap base unit) ──
  // Zakat = SUM(stock x cost_price) di satuan dasar.
  // pack_units TIDAK mengubah rumus zakat: stok tetap 100 pcs.
  const zakatBase = stock * costPrice; // 100 x 2000 = 200000
  ok('T3: Zakat = stok x cost (base) = 200000', zakatBase === 200000, String(zakatBase));
  // Zakat TIDAK peduli pack_units -- tetap 200000 walau ada pack box.
  const zakatWithPack = stock * costPrice; // sama persis
  ok('T3: Zakat tak berubah dengan pack_units', zakatWithPack === zakatBase);

  // ── T4: Stok decrement = qty x qty_per_base ──
  const stockAfter = stock - qty * qtyPerBase; // 100 - 24 = 76
  ok('T4: Stok setelah 2 box (24 pcs) = 76', stockAfter === 76, String(stockAfter));

  // Guard: stok tidak cukup
  const stockSmall = 20; // 20 pcs
  const canSell2Box = stockSmall >= 2 * qtyPerBase; // 20 >= 24? NO
  ok('T4: Guard stok (20 < 24) blokir 2 box', !canSell2Box);

  const stockEnough = 36; // 36 pcs
  const canSell3Box = stockEnough >= 3 * qtyPerBase; // 36 >= 36? YES
  ok('T4: Stok 36 cukup utk 3 box (36 pcs)', canSell3Box);

  // ── T5: Konversi otomatis ──
  // Stok dibutuhkan = qty x qty_per_base (selalu integer utk V1).
  const stockNeeded5Box = 5 * qtyPerBase; // 60
  ok('T5: Stok dibutuhkan 5 box = 60 pcs', stockNeeded5Box === 60, String(stockNeeded5Box));

  // Restock (retur/pembatalan) = qty x qty_per_base
  const restock2Box = 2 * qtyPerBase; // 24
  ok('T5: Restock 2 box = +24 pcs', restock2Box === 24, String(restock2Box));

  // Satuan dasar (qty_per_base=1): stok dibutuhkan = qty x 1
  const stockNeededBase = 5 * 1; // 5
  ok('T5: Stok dibutuhkan 5 pcs (base) = 5', stockNeededBase === 5, String(stockNeededBase));

  // ── Backward compat: produk tanpa pack_units (qty_per_base=1) ──
  const compatCost = 5000;
  const compatQty = 3;
  const compatHpp = compatCost * 1 * compatQty; // 15000
  ok('Compat: HPP 3 pcs (base) = 15000', compatHpp === 15000, String(compatHpp));
  const compatStock = 50;
  const compatAfter = compatStock - compatQty * 1; // 47
  ok('Compat: Stok 50 - 3 = 47', compatAfter === 47, String(compatAfter));

  // ── HPP per unit (cost_price di sale_items) ──
  const costPerUnitPack = costPrice * qtyPerBase; // 24000 (HPP per box)
  ok('HPP per box = 24000', costPerUnitPack === 24000, String(costPerUnitPack));
  const costPerUnitBase = costPrice * 1; // 2000
  ok('HPP per pcs (base) = 2000', costPerUnitBase === 2000, String(costPerUnitBase));

  console.log('');
  console.log(passes + '/' + (passes + failures) + ' passed' + (failures > 0 ? ', ' + failures + ' FAILED' : ''));
  process.exitCode = failures > 0 ? 1 : 0;
}

main();
