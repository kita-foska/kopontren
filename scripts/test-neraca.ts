/**
 * Unit test FASE A3 — Neraca Sederhana V1 (modul murni src/lib/neraca.ts).
 * Menjalankan SQL nyata (SUM/COUNT multi-tabel, tanpa parameter)
 * terhadap in-memory SQLite (node:sqlite) agar rumus agregat terverifikasi.
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:neraca      (== node scripts/test-neraca.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 * Pola harness in-memory + shim sama dgn scripts/test-split.ts.
 */
import { queryNeraca, NERACA_NOTES } from '../src/lib/neraca.ts';
import type { QueryDb } from '../src/lib/keuangan.ts';

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

function eq<T>(name: string, actual: T, expected: T): void {
  ok(name, actual === expected, 'dapat ' + String(actual) + ', seharusnya ' + String(expected));
}

/** Skema minimal: hanya kolom yang dibaca queryNeraca. */
const SCHEMA = `
CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);
CREATE TABLE purchases (
  id INTEGER PRIMARY KEY,
  qty INTEGER NOT NULL DEFAULT 0,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);
CREATE TABLE cash_entries (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  created_by INTEGER
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  cost_price INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE debts (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  remaining INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT
);
CREATE TABLE payables (
  id INTEGER PRIMARY KEY,
  owner_name TEXT NOT NULL,
  remaining INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT
);
CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  name TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  cashback_balance INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE consignment_items (
  id INTEGER PRIMARY KEY,
  owner_name TEXT,
  item_name TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  settled_at TEXT
);
`;

async function main(): Promise<void> {
  let sqliteErr = '';
  let db: import('node:sqlite').DatabaseSync | null = null;
  try {
    const mod = await import('node:sqlite');
    db = new mod.DatabaseSync(':memory:');
    db.exec(SCHEMA);
  } catch (e) {
    sqliteErr = String(e);
  }

  if (!db) {
    console.error('  SKIP — node:sqlite tidak tersedia: ' + sqliteErr);
    console.log('HAS_FAILURE');
    process.exit(1);
  }

  // node:sqlite sinkron -> dibungkus Promise agar cocok dgn QueryDb.
  // queryNeraca TANPA parameter (snapshot) — shim tanpa args memadai.
  const shim = {
    prepare: (q: string) => ({
      all: async () => db!.prepare(q).all(),
      get: async () => db!.prepare(q).get(),
    }),
  } as unknown as QueryDb;

  // ── Data uji (angka mudah diverifikasi manual) ────────────────────────
  // Kas = Σsales 1.000.000 + cash_in 150.000 − purchases 200.000
  //       − expenses 50.000 − cash_out 25.000 = 875.000
  db.exec(
    `INSERT INTO sales (total) VALUES (400000), (350000), (250000);
     INSERT INTO purchases (qty, unit_cost) VALUES (2, 50000), (1, 100000);
     INSERT INTO expenses (amount) VALUES (50000);
     INSERT INTO cash_entries (type, label, amount) VALUES
       ('income', 'Modal awal', 100000),
       ('income', 'Setor kasir', 50000),
       ('expense', 'Potong belanja kasir', 25000);`
  );
  // Stok = Teh 10×5.000=50.000 + Kopi 3×20.000=60.000 = 110.000 (2 SKU, 13 unit).
  // Gula (stok 0), Madu (stok −2 oversell), Minyak (cost 0) diabaikan.
  db.exec(
    `INSERT INTO products (name, stock, cost_price, price) VALUES
       ('Teh', 10, 5000, 8000),
       ('Kopi', 3, 20000, 32000),
       ('Gula', 0, 10000, 15000),
       ('Madu', -2, 30000, 50000),
       ('Minyak', 4, 0, 14000);`
  );
  // Piutang open = 40.000 + 60.000 = 100.000 (settled TIDAK dihitung,
  // kolom remaining — bukan amount — yang dijumlah).
  db.exec(
    `INSERT INTO debts (customer_name, remaining, due_date, status) VALUES
       ('Pak RT', 40000, '2026-10-01', 'open'),
       ('Ibu Sari', 60000, '', 'open'),
       ('Budi (sudah lunas)', 0, '2026-09-01', 'settled');`
  );
  // Hutang open = 25.000 (settled TIDAK dihitung).
  db.exec(
    `INSERT INTO payables (owner_name, remaining, due_date, status) VALUES
       ('CV Sembako', 25000, '2026-10-15', 'open'),
       ('Sudah Lunas', 0, '', 'settled');`
  );
  // Cashback = 1.500 + 3.500 = 5.000 (saldo 0 tak dihitung).
  db.exec(
    `INSERT INTO members (name, cashback_balance) VALUES
       ('Ahmad', 1500), ('Bela', 0), ('Cita', 3500);`
  );
  // Off-balance: tagihan konsinyasi terbuka 75.000 (TIDAK masuk neraca).
  db.exec(
    `INSERT INTO consignment_items (owner_name, item_name, amount, status) VALUES
       ('H. Ujang', 'Rendang', 75000, 'open'),
       ('H. Ujang', 'Sambal', 40000, 'settled');`
  );

  const p = await queryNeraca(shim);

  // ── Aset ──
  eq('kas = 875.000 (rumus /api/kas)', p.kas, 875_000);
  eq('stok total = 110.000 (basis harga beli)', p.stok.total, 110_000);
  eq('stok count = 2 SKU (oversell/cost 0 diabaikan)', p.stok.count, 2);
  eq('stok units = 13', p.stok.units, 13);
  eq('piutang open = 100.000', p.piutang.total, 100_000);
  eq('piutang count = 2 (settled tak dihitung)', p.piutang.count, 2);
  eq('aset total = 875.000 + 110.000 + 100.000 = 1.085.000', p.aset_total, 1_085_000);

  // ── Kewajiban ──
  eq('hutang open = 25.000', p.hutang.total, 25_000);
  eq('hutang count = 1', p.hutang.count, 1);
  eq('cashback = 5.000 (kewajiban, bukan beban)', p.cashback.total, 5_000);
  eq('cashback count = 2 member', p.cashback.count, 2);
  eq('liabilitas total = 25.000 + 5.000 = 30.000', p.liabilitas_total, 30_000);

  // ── Anti dobel hitung off-balance ──
  eq('off-balance konsinyasi = 75.000 (hanya open)', p.off_balance.konsinyasi.total, 75_000);
  eq('off-balance count = 1 (settled tak dihitung)', p.off_balance.konsinyasi.count, 1);
  ok(
    'off-balance TIDAK masuk liabilitas',
    p.liabilitas_total === 30_000 && p.off_balance.konsinyasi.total === 75_000,
    'liabilitas=' + p.liabilitas_total
  );

  // ── Modal Setara ──
  eq('modal setara = 1.085.000 − 30.000 = 1.055.000', p.modal_setara, 1_055_000);

  // ── Detail 5 terbesar ──
  eq('stok_top panjang = 2 (hanya yang sah)', p.rincian.stok_top.length, 2);
  eq('stok_top #1 = Kopi 60.000', p.rincian.stok_top[0].name + '/' + p.rincian.stok_top[0].total, 'Kopi/60000');
  eq('stok_top #2 = Teh 50.000', p.rincian.stok_top[1].name + '/' + p.rincian.stok_top[1].total, 'Teh/50000');
  eq('piutang_top #1 = Ibu Sari 60.000', p.rincian.piutang_top[0].name + '/' + p.rincian.piutang_top[0].remaining, 'Ibu Sari/60000');
  eq('hutang_top #1 = CV Sembako 25.000', p.rincian.hutang_top[0].name + '/' + p.rincian.hutang_top[0].remaining, 'CV Sembako/25000');
  ok(
    'due_date dipindah ("" utk tanpa tanggal)',
    p.rincian.piutang_top[0].due_date === '' && p.rincian.piutang_top[1].due_date === '2026-10-01'
  );

  // ── Skenario kas negatif (lalu expenses besar) ───────────────────────
  db.exec(`INSERT INTO expenses (amount) VALUES (2000000);`);
  const p2 = await queryNeraca(shim);
  // kas = 875.000 − 2.000.000 = −1.125.000
  eq('kas boleh negatif = −1.125.000', p2.kas, -1_125_000);
  eq('aset total negatif = −1.125.000 + 110.000 + 100.000 = −915.000', p2.aset_total, -915_000);
  eq('modal setara = −915.000 − 30.000 = −945.000', p2.modal_setara, -945_000);

  // ── DB kosong: semua nol, rincian kosong (bukan null/NaN) ───────────
  const emptyDb = new (await import('node:sqlite')).DatabaseSync(':memory:') as unknown as import('node:sqlite').DatabaseSync;
  emptyDb.exec(SCHEMA);
  const shimEmpty = {
    prepare: (q: string) => ({
      all: async () => emptyDb.prepare(q).all(),
      get: async () => emptyDb.prepare(q).get(),
    }),
  } as unknown as QueryDb;
  const e = await queryNeraca(shimEmpty);
  eq('kosong: kas 0', e.kas, 0);
  eq('kosong: aset total 0', e.aset_total, 0);
  eq('kosong: liabilitas total 0', e.liabilitas_total, 0);
  eq('kosong: modal setara 0', e.modal_setara, 0);
  eq(
    'kosong: rincian semua kosong',
    e.rincian.stok_top.length + e.rincian.piutang_top.length + e.rincian.hutang_top.length,
    0
  );

  // ── Sanity NERACA_NOTES ───────────────────────────────────────────────
  ok('NERACA_NOTES ≥ 5 baris', NERACA_NOTES.length >= 5, 'panjang ' + NERACA_NOTES.length);
  ok('NERACA_NOTES menyebut "harga beli"', NERACA_NOTES.some((n) => n.includes('harga beli')));
  ok('NERACA_NOTES menyebut off-balance', NERACA_NOTES.some((n) => n.toLowerCase().includes('off-balance')));

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();