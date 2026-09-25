/**
 * Unit test harga grosir (modul murni src/lib/wholesale.ts).
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:wholesale      (== node scripts/test-wholesale.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 *
 * Rumus (disetujui user 2026-09-25):
 *  - pct efektif = MAKS(tier produk terbaik utk qty, diskon global) —
 *    tier terbaik = diskon terbesar antar tier dgn min_qty <= qty;
 *    global berlaku bila min > 0 dan qty >= min.
 *  - dasar hitung = base_price (deterministik).
 *  - harga = round(base_price × (100 − pct) / 100), lantai 0.
 */
import {
  bestTierPct,
  effectiveWholesalePrice,
  globalWholesalePct,
  parseWholesaleJson,
  type GlobalWholesale,
  type WholesaleTier,
} from '../src/lib/wholesale.ts';

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

const T: WholesaleTier[] = [
  { min_qty: 6, discount_percent: 5 },
  { min_qty: 12, discount_percent: 10 },
  { min_qty: 24, discount_percent: 15 },
];
const G: GlobalWholesale = { min: 10, discount: 8 };

console.log('wholesale: tier per produk');
eq('tanpa tier -> harga dasar', effectiveWholesalePrice(10000, 50, null, null).price, 10000);
eq('tanpa tier -> pct 0', effectiveWholesalePrice(10000, 50, null, null).pct, 0);
eq('qty di bawah ambang -> tidak diskon', effectiveWholesalePrice(10000, 5, T, null).price, 10000);
eq('qty tepat di ambang tier pertama -> 5%', effectiveWholesalePrice(10000, 6, T, null).pct, 5);
eq('qty di tengah -> tier teraman yang cocok (5%)', effectiveWholesalePrice(10000, 11, T, null).pct, 5);
eq('qty 12 -> 10%', effectiveWholesalePrice(10000, 12, T, null).pct, 10);
eq('qty 24 -> 15% (terbesar)', effectiveWholesalePrice(10000, 24, T, null).pct, 15);
eq('qty 100 -> tetap 15% (tier tertinggi)', effectiveWholesalePrice(10000, 100, T, null).pct, 15);
eq('harga tier: 10000 x 85%', effectiveWholesalePrice(10000, 24, T, null).price, 8500);
eq('pembulatan: 9999 x 90% = 8999 (bulat)', effectiveWholesalePrice(9999, 12, T, null).price, 8999);
eq('pembulatan: 1001 x 5% = 951 (950.95 -> 951)', effectiveWholesalePrice(1001, 6, T, null).price, 951);

console.log('wholesale: global');
eq('global min 0 -> nonaktif', globalWholesalePct({ min: 0, discount: 50 }, 99), 0);
eq('global: qty di bawah ambang -> 0', globalWholesalePct(G, 9), 0);
eq('global: qty tepat ambang -> 8%', globalWholesalePct(G, 10), 8);
eq('global: qty di atas ambang -> 8%', globalWholesalePct(G, 50), 8);
eq('harga global saja: 10000 x 92%', effectiveWholesalePrice(10000, 50, [], G).price, 9200);

console.log('wholesale: kombinasi tier + global (MAKS, menguntungkan pembeli)');
eq('tier 5% > global tak kena (qty 6) -> tier', effectiveWholesalePrice(10000, 6, T, G).pct, 5);
eq('global saja (tier kosong, qty 10) -> 8%', effectiveWholesalePrice(10000, 10, [], G).pct, 8);
eq(
  'tier 10% > global 8% (qty 12) -> tier menang',
  effectiveWholesalePrice(10000, 12, T, G).pct,
  10
);
eq(
  'tier 5% < global 8% (qty 10) -> global menang',
  effectiveWholesalePrice(10000, 10, T, G).pct,
  8
);
eq('tier tak kena + global tak kena (qty 3) -> 0', effectiveWholesalePrice(10000, 3, T, G).pct, 0);
eq('keduanya sama -> sumber "both"', effectiveWholesalePrice(10000, 12, T, { min: 10, discount: 10 }).source, 'both');
eq('sumber tier', effectiveWholesalePrice(10000, 12, T, G).source, 'tier');
eq('sumber global', effectiveWholesalePrice(10000, 10, [], G).source, 'global');

console.log('wholesale: bestTierPct & edge case');
eq('bestTierPct: null/undefined -> 0', bestTierPct(undefined, 99), 0);
eq('bestTierPct: qty 0 -> 0 (tak ada pembelian)', bestTierPct(T, 0), 0);
eq(
  'tier duplikat min_qty: diskon terbesar menang',
  bestTierPct(
    [
      { min_qty: 6, discount_percent: 3 },
      { min_qty: 6, discount_percent: 7 },
    ],
    6
  ),
  7
);
eq(
  'tier dgn nilai rusak diabaikan',
  bestTierPct(
    [
      { min_qty: 0, discount_percent: 50 },
      { min_qty: 6, discount_percent: 4 },
    ],
    6
  ),
  4
);
eq('base_price 0 -> harga 0', effectiveWholesalePrice(0, 24, T, G).price, 0);
eq('pct 100 -> harga 0 (dibulatkan, tak negatif)', effectiveWholesalePrice(5000, 1, [{ min_qty: 1, discount_percent: 100 }], null).price, 0);
eq('base_price negatif/NaN -> dianggap 0', effectiveWholesalePrice(NaN, 5, T, null).price, 0);

console.log('wholesale: parseWholesaleJson');
eq('parse valid', JSON.stringify(parseWholesaleJson('[{"min_qty":6,"discount_percent":5}]')), JSON.stringify(T.slice(0, 1)));
eq("parse '[]' -> kosong", parseWholesaleJson('[]').length, 0);
eq('parse null -> kosong', parseWholesaleJson(null).length, 0);
eq('parse undefined -> kosong', parseWholesaleJson(undefined).length, 0);
eq('parse JSON rusak -> kosong', parseWholesaleJson('{bukan-json').length, 0);
eq('parse string kosong -> kosong', parseWholesaleJson('').length, 0);
eq('parse non-array -> kosong', parseWholesaleJson('{"a":1}').length, 0);
eq(
  'parse merapikan urutan + buang baris rusak',
  JSON.stringify(
    parseWholesaleJson(
      JSON.stringify([
        { min_qty: 12, discount_percent: 10 },
        'garbage',
        { min_qty: 6, discount_percent: 5 },
      ])
    )
  ),
  JSON.stringify(T.slice(0, 2))
);

console.log(`\nwholesale: ${passes} lulus, ${failures} gagal`);
if (failures > 0) process.exit(1);
