/**
 * P0-C3 - test 16 cek rekonsiliasi (modul src/lib/rekonsiliasi.ts, flag-only).
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:rekon     (== node scripts/test-rekonsiliasi.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 * Pola harness in-memory (node:sqlite) + shim QueryDb sama dgn
 * scripts/test-neraca.ts.
 *
 * Alur:
 *   1. Seed sehat (selaras dgn guard tulis app) - SEMUA 16 cek 'ok',
 *      clean=true, drift_total=0.
 *   2. Korup (edits manual/DB) - cek target drift dgn jumlah persis;
 *      drift_total=19, clean=false.
 *   3. DB kosong → semua cek 'ok' (nol), clean=true.
 */
import { queryRekonsiliasi, REKONSILIASI_NOTES, type RekCheck, type RekPayload } from '../src/lib/rekonsiliasi.ts';
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
function find(p: RekPayload, id: string): RekCheck {
  const c = p.checks.find((x) => x.id === id);
  if (!c) throw new Error('cek tak ditemukan: ' + id);
  return c;
}

/** Skema minimal: hanya kolom yang dibaca 16 cek. */
const SCHEMA = `
CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  kasir_id INTEGER,
  pay_method TEXT NOT NULL DEFAULT 'cash',
  total INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  change INTEGER NOT NULL DEFAULT 0,
  pay_split TEXT,
  created_at TEXT NOT NULL DEFAULT '2026-09-27T07:00:00.000Z'
);
CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL,
  product_id INTEGER,
  qty INTEGER NOT NULL,
  cost_price INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE returns (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL,
  product_id INTEGER,
  qty INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  cogs INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE shifts (
  id INTEGER PRIMARY KEY,
  kasir_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  start_time TEXT NOT NULL,
  end_time TEXT,
  sales_count INTEGER NOT NULL DEFAULT 0,
  sales_total INTEGER NOT NULL DEFAULT 0,
  cash_total INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE debts (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE TABLE payables (
  id INTEGER PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  cashback_balance INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE point_history (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE cash_entries (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE consignments (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  item_name TEXT NOT NULL,
  qty_received INTEGER NOT NULL DEFAULT 0,
  agree_price INTEGER NOT NULL DEFAULT 0,
  commission_rate INTEGER NOT NULL DEFAULT 20,
  qty_sold INTEGER NOT NULL DEFAULT 0,
  qty_returned INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  ref_table TEXT NOT NULL,
  ref_id TEXT,
  entry_date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'normal'
);
CREATE TABLE journal_lines (
  entry_id TEXT NOT NULL,
  account_code TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  debit INTEGER NOT NULL DEFAULT 0,
  credit INTEGER NOT NULL DEFAULT 0
);
`;

/**
 * Seed sehat: setiap baris selaras dgn guard tulis app - 16 cek 'ok'.
 *  - Shif 1 (kasir 1, [06:00,09:00)): 2 sales (100.000 + 50.000), kas
 *    120.000 (sales tunai 100.000 + porsi split 20.000).
 *  - Konsinyasi: ujrah tercatat = 8.000 + 10.000 (rate 20%, floor/unit);
 *    settlement H. B = 40.000 lunas (settled => tagihan 40.000 = paid).
 *  - Jurnal GL: 2 entry seimbang D=K (100.000 & 50.000), semua
 *    entry_date berakhiran +07:00.
 */
const SEED = `
INSERT INTO sales (id, kasir_id, pay_method, total, amount_paid, change, pay_split, created_at) VALUES
  (1, 1, 'cash', 100000, 100000, 0, NULL, '2026-09-27T07:00:00.000Z'),
  (2, 1, 'cash', 50000, 50000, 0, '[{"m":"cash","a":20000},{"m":"tf","a":30000}]', '2026-09-27T07:30:00.000Z'),
  (3, 2, 'tf', 20000, 20000, 0, NULL, '2026-09-27T08:00:00.000Z'),
  (4, 2, 'cash', 50000, 50000, 0, '[{"m":"cash","a":25000},{"m":"tf","a":25000}]', '2026-09-27T08:10:00.000Z');
INSERT INTO sale_items (sale_id, product_id, qty, cost_price) VALUES (1, 1, 2, 5000), (2, 2, 1, 40000);
INSERT INTO returns (sale_id, product_id, qty, amount, cogs) VALUES (1, 1, 1, 50000, 5000);
INSERT INTO shifts (id, kasir_id, status, start_time, end_time, sales_count, sales_total, cash_total)
  VALUES (1, 1, 'closed', '2026-09-27T06:00:00.000Z', '2026-09-27T09:00:00.000Z', 2, 150000, 120000);
INSERT INTO products (id, name, stock) VALUES (1, 'Madu Sachet', 50), (2, 'Madu Box', 10), (3, 'Air Mineral', 0);
INSERT INTO debts (customer_name, amount, paid, remaining, status) VALUES ('Pak RT', 100000, 40000, 60000, 'open');
INSERT INTO payables (supplier_name, amount, paid, remaining, status) VALUES ('CV Sembako', 50000, 50000, 0, 'settled');
INSERT INTO members (id, name, points, cashback_balance) VALUES (1, 'Ahmad', 5, 0);
INSERT INTO point_history (member_id, delta, reason, amount) VALUES (1, 5, 'earn', 50000);
INSERT INTO consignments (owner, item_name, qty_received, agree_price, commission_rate, qty_sold, amount_paid, status) VALUES
  ('H. A', 'Rendang', 10, 10000, 20, 4, 0, 'active'),
  ('H. B', 'Sambal', 5, 10000, 20, 5, 40000, 'settled');
INSERT INTO cash_entries (type, label, amount) VALUES
  ('income', 'Ujrah Kon. H. A - Rendang', 8000),
  ('income', 'Ujrah Kon. H. B - Sambal', 10000),
  ('expense', 'Kon. H. B - Sambal', 40000);
INSERT INTO journal_entries (id, ref_table, ref_id, entry_date, type) VALUES
  ('je-1', 'sales', '1', '2026-09-27T07:00:00+07:00', 'normal'),
  ('je-2', 'expenses', '1', '2026-09-27T08:00:00+07:00', 'normal');
INSERT INTO journal_lines (entry_id, account_code, debit, credit) VALUES
  ('je-1', '1010', 100000, 0),
  ('je-1', '4010', 0, 100000),
  ('je-2', '1010', 50000, 0),
  ('je-2', '5010', 0, 50000);
`;

/**
 * Korup (simulasi edit manual/DB) - 16 target drift (RETURN_COGS: over-
 * retur baru cogs 0 != 25.000; JOURNAL_BAL: entry tak seimbang; GL_TZ:
 * entry tanggal UTC/Z); efek silang yg sengaja: total negatif (sales 3)
 * juga melanggar SALES_PAY.
 */
const CORRUPT = `
UPDATE sales SET amount_paid = 99000 WHERE id = 1;
UPDATE sales SET total = -50 WHERE id = 3;
UPDATE sales SET pay_split = '[{"m":"qris","a":50000}]' WHERE id = 4;
UPDATE shifts SET sales_count = 99 WHERE id = 1;
INSERT INTO returns (sale_id, product_id, qty, amount) VALUES (1, 1, 5, 20000), (999, 1, 1, 1000);
UPDATE products SET stock = -3 WHERE id = 1;
UPDATE debts SET remaining = 12345;
UPDATE payables SET remaining = 1;
UPDATE members SET points = points + 7;
UPDATE members SET cashback_balance = 500;
UPDATE consignments SET qty_sold = qty_sold + 99 WHERE owner = 'H. A';
UPDATE consignments SET amount_paid = amount_paid - 1000 WHERE owner = 'H. B';
INSERT INTO journal_entries (id, ref_table, ref_id, entry_date, type) VALUES
  ('je-3', 'sales', '9', '2026-09-28T03:30:00.000Z', 'normal');
INSERT INTO journal_lines (entry_id, account_code, debit, credit) VALUES
  ('je-3', '1010', 100000, 0),
  ('je-3', '4010', 0, 90000);
`;

/** node:sqlite sinkron → dibungkus Promise + spread args (QueryDb). */
function makeShim(db: import('node:sqlite').DatabaseSync): QueryDb {
  return {
    prepare: (q: string) => ({
      get: async (...args: unknown[]) => db.prepare(q).get(...(args as (string | number)[])),
      all: async (...args: unknown[]) => db.prepare(q).all(...(args as (string | number)[])),
    }),
  } as unknown as QueryDb;
}

async function main(): Promise<void> {
  let db: import('node:sqlite').DatabaseSync;
  try {
    const mod = await import('node:sqlite');
    db = new mod.DatabaseSync(':memory:');
  } catch (e) {
    console.error('  SKIP — node:sqlite tidak tersedia: ' + String(e));
    console.log('HAS_FAILURE');
    process.exit(1);
    return;
  }
  db.exec(SCHEMA);
  db.exec(SEED);

  // ===== Fase 1: DB sehat - SEMUA 16 cek 'ok' ========================
  const p1 = await queryRekonsiliasi(makeShim(db));
  eq('sehat: 16 cek', p1.checks.length, 16);
  eq(
    'sehat: JOURNAL_BAL selaras',
    find(p1, 'JOURNAL_BAL').detail,
    '2 entry jurnal seimbang (D=K); 0 baris yatim; selisih global 0'
  );
  eq('sehat: GL_TZ selaras', find(p1, 'GL_TZ').detail, 'semua entry jurnal +07:00 (satu zona waktu)');
  eq('sehat: RETURN_COGS selaras', find(p1, 'RETURN_COGS').detail, 'semua cogs retur selaras dgn snapshot HPP item (V2-2)');
  eq('sehat: drift_total = 0', p1.drift_total, 0);
  eq('sehat: clean = true', p1.clean, true);
  for (const c of p1.checks) ok("sehat: " + c.id + " 'ok' + baris kosong", c.status === 'ok' && c.rows.length === 0, c.detail);
  eq('sehat: SHIFT = 1 rekap selaras', find(p1, 'SHIFT').detail, '1 rekap shif terakhir selaras dgn recompute');
  eq('sehat: KONSIN_UJRAH = 18.000/18.000', find(p1, 'KONSIN_UJRAH').detail, 'ujrah diharapkan 18.000 vs tercatat di kas 18.000');
  eq('sehat: KONSIN_PAY = 40.000/40.000', find(p1, 'KONSIN_PAY').detail, 'terbayar tercatat 40.000 vs kas keluar 40.000');

  // ── Fase 2: DB korup → drift persis pada cek target ──────────────
  db.exec(CORRUPT);
  const p2 = await queryRekonsiliasi(makeShim(db));
  eq('korup: drift_total = 19', p2.drift_total, 19);
  eq('korup: clean = false', p2.clean, false);
  eq('SALES_PAY = 2 (sales 1 & 3)', find(p2, 'SALES_PAY').drift_count, 2);
  eq('SALES_MONEY = 1 (total negatif)', find(p2, 'SALES_MONEY').drift_count, 1);
  eq('SPLIT = 1 (metode tak dikenal)', find(p2, 'SPLIT').drift_count, 1);
  eq('SHIFT = 1 (rekap ≠ recompute)', find(p2, 'SHIFT').drift_count, 1);
  eq('RETURN = 2 (orphan + over-return)', find(p2, 'RETURN').drift_count, 2);
  eq('RETURN_COGS = 1 (cogs 0 ≠ 25.000)', find(p2, 'RETURN_COGS').drift_count, 1);
  eq('STOCK = 1 (stok negatif)', find(p2, 'STOCK').drift_count, 1);
  eq('DEBTS = 1 (aritmetika piutang)', find(p2, 'DEBTS').drift_count, 1);
  eq('PAYABLES = 1 (kolom supplier_name)', find(p2, 'PAYABLES').drift_count, 1);
  eq('POINTS = 1 (poin ≠ ledger)', find(p2, 'POINTS').drift_count, 1);
  eq('CASHBACK = 1 (saldo ≠ ledger)', find(p2, 'CASHBACK').drift_count, 1);
  eq('KONSIN = 2 (sisa negatif + settled belum lunas)', find(p2, 'KONSIN').drift_count, 2);
  eq('KONSIN_UJRAH drift (216.000 vs 18.000)', find(p2, 'KONSIN_UJRAH').drift_count, 1);
  eq('KONSIN_PAY drift (39.000 vs 40.000)', find(p2, 'KONSIN_PAY').drift_count, 1);
  eq(
    'KONSIN_UJRAH detail angka',
    Number(find(p2, 'KONSIN_UJRAH').rows[0].expected) + '/' + Number(find(p2, 'KONSIN_UJRAH').rows[0].recorded),
    '216000/18000'
  );
  eq(
    'KONSIN_PAY detail angka',
    Number(find(p2, 'KONSIN_PAY').rows[0].expected) + '/' + Number(find(p2, 'KONSIN_PAY').rows[0].recorded),
    '39000/40000'
  );
  eq('JOURNAL_BAL = 1 (1 entry tak seimbang)', find(p2, 'JOURNAL_BAL').drift_count, 1);
  eq('JOURNAL_BAL selisih 10.000', Number(find(p2, 'JOURNAL_BAL').rows[0].selisih), 10000);
  eq('GL_TZ = 1 (1 entry UTC/Z)', find(p2, 'GL_TZ').drift_count, 1);
  eq('GL_TZ baris memuat tanggal Z', String(find(p2, 'GL_TZ').rows[0].entry_date), '2026-09-28T03:30:00.000Z');
  ok('korup: SETIAP cek drift memuat baris detail', p2.checks.every((c) => c.status === 'drift' && c.rows.length > 0));

  // ── Fase 3: DB kosong (skema saja) → semua nol, clean ─────────────
  const dbEmpty = new (await import('node:sqlite')).DatabaseSync(':memory:');
  dbEmpty.exec(SCHEMA);
  const p3 = await queryRekonsiliasi(makeShim(dbEmpty));
  eq('kosong: 16 cek', p3.checks.length, 16);
  eq('kosong: clean = true', p3.clean, true);
  eq('kosong: drift_total = 0', p3.drift_total, 0);
  ok('kosong: semua cek ok + baris kosong', p3.checks.every((c) => c.status === 'ok' && c.rows.length === 0));

  // ── Fase 4: sanity REKONSILIASI_NOTES (ditampilkan UI) ────────────
  ok('NOTES ≥ 5 baris', REKONSILIASI_NOTES.length >= 5, 'panjang ' + REKONSILIASI_NOTES.length);
  ok('NOTES menyebut flag-only', REKONSILIASI_NOTES.some((n) => n.toLowerCase().includes('flag-only')));
  ok('NOTES menyebut split', REKONSILIASI_NOTES.some((n) => n.toLowerCase().includes('split')));

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();