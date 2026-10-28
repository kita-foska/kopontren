/**
 * COUNTER (POST-W5, 2026-10-13) + W18-B (2026-10-28) -- Unit test
 * src/lib/low-stock.ts (modul pure utk badge stok menipis + API
 * /api/low-stock-count + ambang min_stock per produk).
 * Node langsung (type-stripping, Node >= 23.6), konvensi sama dgn
 * test-roles.ts / test-member-export.ts: modul hermetis diuji
 * langsung + node:sqlite in-memory utk query count.
 *     npm run test:low-stock-count   (== node scripts/test-low-stock-count.ts)
 *
 * Sifat yang diuji:
 *  - Definisi D1 (W18-B): ambang efektif COALESCE(NULLIF(min_stock,0), 10);
 *    SQL "SELECT COUNT(*) ... active = 1 AND stock < COALESCE(NULLIF(min_stock,0),10)";
 *    query benar-benar berjalan di SQLite (boundary: stock 10 TIDAK dihitung
 *    bila ambang global; min_stock 20 & stock 15 HITUNG; inactive TIDAK).
 *  - Helper W18-B: effectiveMinStock() / isLowStock() (pure).
 *  - Gerbang tier D4: 401 anon / 403 role tanpa tier 'stock'
 *    (kasir/pengurus/pembelian/member) / 200 (admin/manajer/gudang).
 *  - Respons D1: normalisasi count (bulat >= 0; selain itu null --
 *    gagal query = badge tersembunyi, bukan angka bohong).
 *  - Header cache: no-store.
 *  - Label D5: lebar "N produk stok menipis" / sempit "N"; ASCII
 *    saja (tanpa emoji/unicode di seluruh konstanta modul).
 */
import { DatabaseSync } from 'node:sqlite';
import type { AppUser } from '../src/lib/auth.ts';
import {
  effectiveMinStock,
  LOW_STOCK_CACHE_CONTROL,
  LOW_STOCK_COUNT_SQL,
  LOW_STOCK_STATUS,
  LOW_STOCK_THRESHOLD,
  LOW_STOCK_WHERE,
  isLowStock,
  lowStockCount,
  lowStockGate,
  lowStockLabel,
} from '../src/lib/low-stock.ts';

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
const asUser = (role: string) => ({ role }) as unknown as AppUser;

async function main() {
  console.log('# low-stock-count (COUNTER POST-W5 + W18-B min_stock)\n');

  // -- Definisi D1 (W18-B): threshold & bentuk query --
  ok('threshold global: 10', LOW_STOCK_THRESHOLD === 10);
  ok(
    'sql: COUNT(*) atas products, ambang efektif COALESCE(NULLIF(min_stock,0),10)',
    LOW_STOCK_COUNT_SQL.includes('SELECT COUNT(*)') &&
      LOW_STOCK_COUNT_SQL.includes('FROM products') &&
      LOW_STOCK_COUNT_SQL.includes(LOW_STOCK_WHERE),
    LOW_STOCK_COUNT_SQL,
  );
  ok(
    'WHERE bersama: active = 1 + COALESCE(NULLIF(min_stock,0),10)',
    LOW_STOCK_WHERE === 'active = 1 AND stock < COALESCE(NULLIF(min_stock,0), 10)',
    LOW_STOCK_WHERE,
  );

  // -- Helper W18-B: ambang efektif per produk --
  ok('effectiveMinStock: 0 -> 10 (ambang global)', effectiveMinStock(0) === 10);
  ok(
    'effectiveMinStock: null/undefined/NaN -> 10',
    effectiveMinStock(null) === 10 && effectiveMinStock(undefined) === 10 && effectiveMinStock(NaN) === 10,
  );
  ok('effectiveMinStock: -3 -> 10 (nilai tak valid = global)', effectiveMinStock(-3) === 10);
  ok(
    'effectiveMinStock: 20 -> 20; 7.4 -> 7 (dibulatkan ke bawah)',
    effectiveMinStock(20) === 20 && effectiveMinStock(7.4) === 7,
  );
  ok('isLowStock: min 20, stok 15 -> menipis', isLowStock(15, 20) === true);
  ok('isLowStock: min 20, stok 25 -> aman', isLowStock(25, 20) === false);
  ok(
    'isLowStock: min 0 (global), stok 9 -> menipis; stok 10 -> aman',
    isLowStock(9, 0) === true && isLowStock(10, 0) === false,
  );
  ok('isLowStock: stok tepat = ambang -> AMAN (stock < ambang, strict)', isLowStock(20, 20) === false);

  // -- Gerbang tier D4: 401 / 403 / 200 --
  ok('gate: tak login -> anon (401)', lowStockGate(null) === 'anon' && lowStockGate(undefined) === 'anon');
  for (const r of ['kasir', 'pengurus', 'pembelian', 'member']) {
    ok('gate: ' + r + ' (tanpa tier stock) -> denied (403)', lowStockGate(asUser(r)) === 'denied');
  }
  for (const r of ['admin', 'manajer', 'gudang']) {
    ok('gate: ' + r + ' (tier stock) -> ok (200)', lowStockGate(asUser(r)) === 'ok');
  }
  ok(
    'status map: anon 401, denied 403, ok 200',
    LOW_STOCK_STATUS.anon === 401 && LOW_STOCK_STATUS.denied === 403 && LOW_STOCK_STATUS.ok === 200,
  );

  // -- Header cache --
  ok('cache: no-store', LOW_STOCK_CACHE_CONTROL === 'no-store');

  // -- Normalisasi respons: hanya angka bulat >= 0 yang valid --
  ok(
    'count: 7 -> 7; 0 -> 0; 2.9 -> 2',
    lowStockCount(7) === 7 && lowStockCount(0) === 0 && lowStockCount(2.9) === 2,
  );
  ok(
    'count: null/undefined/teks/NaN/Infinity/negatif -> null (badge tak tampil)',
    lowStockCount(null) === null &&
      lowStockCount(undefined) === null &&
      lowStockCount('5') === null &&
      lowStockCount(Number.NaN) === null &&
      lowStockCount(Number.POSITIVE_INFINITY) === null &&
      lowStockCount(-1) === null,
  );

  // -- Query nyata di SQLite in-memory (boundary, W18-B: + kolom min_stock) --
  {
    const d = new DatabaseSync(':memory:');
    d.exec(`CREATE TABLE products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0)`);
    const ins = d.prepare('INSERT INTO products (id, name, active, stock, min_stock) VALUES (?, ?, ?, ?, ?)');
    ins.run(1, 'A', 1, 9, 0); // min_stock 0 -> ambang global 10; stok 9 < 10 -> HITUNG
    ins.run(2, 'B', 1, 10, 0); // stok 10 = ambang global (strict <) -> TIDAK
    ins.run(3, 'C', 0, 5, 0); // tidak aktif -> TIDAK
    ins.run(4, 'D', 1, 0, 0); // stok habis -> HITUNG
    ins.run(5, 'E', 1, 3, 0); // active, menipis -> HITUNG
    ins.run(6, 'F', 1, 15, 20); // W18-B: min_stock 20, stok 15 < 20 -> HITUNG
    ins.run(7, 'G', 1, 6, 5); // W18-B: min_stock 5, stok 6 > 5 -> TIDAK
    ins.run(8, 'H', 1, 20, 20); // stok tepat = min_stock -> TIDAK (strict <)
    const n = (d.prepare(LOW_STOCK_COUNT_SQL).get() as { n: number }).n;
    ok(
      'query: boundary (9/0/3/min20&15 hitung; 10, inactive, min5&6, stok=min tidak) -> 4',
      n === 4,
      'n=' + n,
    );
    ins.run(9, 'I', 1, 4, 0);
    const n2 = (d.prepare(LOW_STOCK_COUNT_SQL).get() as { n: number }).n;
    ok('query: bertambah setelah insert -> 5', n2 === 5, 'n=' + n2);
    d.close();
    const empty = new DatabaseSync(':memory:');
    empty.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, stock INTEGER NOT NULL DEFAULT 0, min_stock INTEGER NOT NULL DEFAULT 0)');
    const ne = (empty.prepare(LOW_STOCK_COUNT_SQL).get() as { n: number }).n;
    ok('query: tabel kosong -> 0', ne === 0, 'n=' + ne);
    empty.close();
  }

  // -- Label D5: lebar / sempit --
  ok('label: lebar "3 produk stok menipis"', lowStockLabel(3, true) === '3 produk stok menipis');
  ok('label: sempit "3"', lowStockLabel(3, false) === '3');

  // -- ASCII: seluruh konstanta modul bebas karakter non-ASCII --
  {
    const sample = [
      LOW_STOCK_COUNT_SQL,
      LOW_STOCK_WHERE,
      LOW_STOCK_CACHE_CONTROL,
      lowStockLabel(12, true),
      lowStockLabel(12, false),
    ].join('|');
    const nonAscii = [...sample].filter((ch) => ch.charCodeAt(0) > 127);
    ok('ascii: konstanta modul bebas non-ASCII', nonAscii.length === 0, nonAscii.join(''));
  }

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();
