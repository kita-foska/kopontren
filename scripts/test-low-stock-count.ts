/**
 * COUNTER (POST-W5, 2026-10-13) -- Unit test src/lib/low-stock.ts
 * (modul pure utk badge stok menipis + API /api/low-stock-count).
 * Suite 32 (test:all = 32).
 * Node langsung (type-stripping, Node >= 23.6), konvensi sama dgn
 * test-roles.ts / test-member-export.ts: modul hermetis diuji
 * langsung + node:sqlite in-memory utk query count.
 *     npm run test:low-stock-count   (== node scripts/test-low-stock-count.ts)
 *
 * Sifat yang diuji:
 *  - Definisi D1: threshold 10; SQL bentuk "SELECT COUNT(*) ...
 *    active = 1 AND stock < 10"; query benar-benar berjalan di
 *    SQLite (boundary: stock 10 TIDAK dihitung; inactive TIDAK).
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
  LOW_STOCK_CACHE_CONTROL,
  LOW_STOCK_COUNT_SQL,
  LOW_STOCK_STATUS,
  LOW_STOCK_THRESHOLD,
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
  console.log('# low-stock-count (COUNTER POST-W5, suite 32)\n');

  // -- Definisi D1: threshold & bentuk query --
  ok('threshold: 10 (identik widget dashboard)', LOW_STOCK_THRESHOLD === 10);
  ok(
    'sql: COUNT(*) atas products, active = 1 AND stock < 10',
    LOW_STOCK_COUNT_SQL.includes('SELECT COUNT(*)') &&
      LOW_STOCK_COUNT_SQL.includes('FROM products') &&
      LOW_STOCK_COUNT_SQL.includes('active = 1') &&
      LOW_STOCK_COUNT_SQL.includes('stock < 10'),
    LOW_STOCK_COUNT_SQL,
  );

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

  // -- Query nyata di SQLite in-memory (boundary) --
  {
    const d = new DatabaseSync(':memory:');
    d.exec(`CREATE TABLE products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, stock INTEGER NOT NULL DEFAULT 0)`);
    const ins = d.prepare('INSERT INTO products (id, name, active, stock) VALUES (?, ?, ?, ?)');
    ins.run(1, 'A', 1, 9); // active, stok menipis -> HITUNG
    ins.run(2, 'B', 1, 10); // stok 10 = normal -> TIDAK
    ins.run(3, 'C', 0, 5); // tidak aktif -> TIDAK
    ins.run(4, 'D', 1, 0); // stok habis -> HITUNG
    ins.run(5, 'E', 1, 3); // active, menipis -> HITUNG
    const n = (d.prepare(LOW_STOCK_COUNT_SQL).get() as { n: number }).n;
    ok('query: boundary (9 hitung, 10 tidak, inactive tidak) -> 3', n === 3, 'n=' + n);
    ins.run(6, 'F', 1, 9);
    const n2 = (d.prepare(LOW_STOCK_COUNT_SQL).get() as { n: number }).n;
    ok('query: bertambah setelah insert -> 4', n2 === 4, 'n=' + n2);
    d.close();
    const empty = new DatabaseSync(':memory:');
    empty.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, stock INTEGER NOT NULL DEFAULT 0)');
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
