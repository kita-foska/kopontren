/**
 * W4.1 (skema v24) -- test skema koperasi Level C (Sek.7.1):
 *  M1: fresh install v24 (seed COA_V24 + CREATE 3 tabel + index + stamp).
 *  M2: upgrade path v23 -> v24 (seed COA_V23 + FLIP6 + DDL IF NOT EXISTS).
 *  M3: stamp 23 -> 24 (mekanisme ON CONFLICT DO UPDATE = db.ts).
 * Node langsung (type-stripping, Node >= 23.6): npm run test:coop.
 * In-memory node:sqlite; DDL mirror src/db.ts (skema v24). W4.2:
 * C-suite (lib/coop.ts) -- C1 D=K + mapping / C2 idempoten /
 * C3 negative guard / C4 gl-off / C5 keluar refund / C6 transisi.
 * W4.3: R-suite (route wiring, pola /api/akad) -- R1 rekap akun COA
 * W4.1 (2050/2060/2070 + 30xx, 4-digit) / R2 setor D1010->K205x /
 * R3 tarik baris NEGATIF tanpa double-count / R4 keluar refund
 * D2050->K1010 + terminal / R5 kondisi galat -> mapping HTTP route.
 */

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.error('  FAIL ' + name + ((detail !== '') ? ' (' + detail + ')' : ''));
  }
}
function eq<T>(name: string, actual: T, expected: T): void {
  ok(name, actual === expected, 'dapat ' + String(actual) + ', seharusnya ' + String(expected));
}

// DDL mirror src/db.ts (skema v24: coa + coop_* + index).
const DDL_COA =
  'CREATE TABLE coa(code TEXT PRIMARY KEY, name TEXT NOT NULL, "group" TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'open\', pap_ref TEXT, needs_decision INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')))';
const DDL_COOP_MEM =
  "CREATE TABLE IF NOT EXISTS coop_members(id TEXT PRIMARY KEY, name TEXT NOT NULL, npwp TEXT, member_since TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aktif', rumpun TEXT, UNIQUE(name))";
const DDL_COOP_SV =
  'CREATE TABLE IF NOT EXISTS coop_savings(member_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(member_id, kind, saved_at, amount))';
const DDL_COOP_SHU =
  'CREATE TABLE IF NOT EXISTS coop_shu(id TEXT PRIMARY KEY, period TEXT NOT NULL, shu_total INTEGER NOT NULL, cadangan_umum INTEGER, cadangan_khusus INTEGER, jasa_anggota INTEGER, dibagi INTEGER, rasio_json TEXT, created_by TEXT, created_at TEXT NOT NULL, UNIQUE(period))';
const DDL_IDX = ['CREATE INDEX IF NOT EXISTS idx_coop_savings ON coop_savings(member_id, saved_at)'];
const STAMP_DDL =
  'CREATE TABLE IF NOT EXISTS schema_version(id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)';

// Seed COA v23 (mirror coaSeed src/db.ts skema v23: 52 akun;
// open=38 / pending=13 / closed=1; flip W2.7 + W3.1 sudah 'open';
// 6030 open sejak flip W5.3b v26).
type CoaRow = [string, string, string, string, string, number];
const COA_V23: CoaRow[] = [
  ['1010', 'Kas Toko', '10xx', 'aset', 'open', 0],
  ['1020', 'Kas Bank', '10xx', 'aset', 'open', 0],
  ['1030', 'Piutang Penjualan', '10xx', 'aset', 'open', 0],
  ['1040', 'Persediaan', '10xx', 'aset', 'open', 0],
  ['1050', 'Aset Tetap', '10xx', 'aset', 'open', 0],
  ['1060', 'Akumulasi Penyusutan', '10xx', 'aset', 'pending', 1],
  ['1070', 'Piutang Murabahah', '10xx', 'aset', 'open', 0],
  ['1080', 'Investasi Mudharabah', '10xx', 'aset', 'open', 0],
  ['1090', 'Investasi Musyarakah', '10xx', 'aset', 'open', 0],
  ['1100', 'Kas ZIS', '10xx', 'aset', 'open', 0],
  ['1110', 'Piutang Zakat', '10xx', 'aset', 'pending', 1],
  ['1120', 'Aset Wakaf', '10xx', 'aset', 'open', 0],
  ['2010', 'Hutang Pembelianan', '20xx', 'kewajiban', 'open', 0],
  ['2020', 'Hutang Ujrah Konsinyasi', '20xx', 'kewajiban', 'open', 0],
  ['2030', 'Utang Cashback Member', '20xx', 'kewajiban', 'open', 0],
  ['2040', 'Kewajiban Akad (Ujrah/Tijarah/Mudharabah)', '20xx', 'kewajiban', 'open', 0],
  ['2050', 'Simpanan Pokok', '20xx', 'kewajiban', 'open', 0],
  ['2060', 'Simpanan Wajib', '20xx', 'kewajiban', 'open', 0],
  ['2070', 'Simpanan Sukarela', '20xx', 'kewajiban', 'open', 0],
  ['2080', 'SHU Berjalan', '20xx', 'kewajiban', 'pending', 1],
  ['2090', 'ZIS Terkumpul Belum Disalurkan', '20xx', 'kewajiban', 'open', 0],
  ['2100', 'Kewajiban Lain-lain', '20xx', 'kewajiban', 'pending', 1],
  ['3010', 'Modal Penyertaan', '30xx', 'ekuitas', 'open', 0],
  ['3020', 'SHU Ditahan', '30xx', 'ekuitas', 'pending', 1],
  ['3030', 'SHU Cadangan Umum', '30xx', 'ekuitas', 'pending', 1],
  ['3040', 'SHU Cadangan Khusus', '30xx', 'ekuitas', 'pending', 1],
  ['3050', 'SHU Jasa Anggota', '30xx', 'ekuitas', 'pending', 1],
  ['3060', 'SHU Dibagi', '30xx', 'ekuitas', 'pending', 1],
  ['3070', 'Koreksi Saldo', '30xx', 'ekuitas', 'open', 0],
  ['4010', 'Pendapatan Penjualan', '40xx', 'pendapatan', 'open', 0],
  ['4020', 'Potongan & Diskon (kontra pendapatan)', '40xx', 'pendapatan', 'open', 0],
  ['4030', 'Retur Penjualan', '40xx', 'pendapatan', 'open', 0],
  ['4040', 'Ujrah Konsinyasi', '40xx', 'pendapatan', 'open', 0],
  ['4050', 'Pendapatan Ijarah', '40xx', 'pendapatan', 'open', 0],
  ['4060', 'Laba Murabahah', '40xx', 'pendapatan', 'open', 0],
  ['4070', 'Bagi Hasil Mudharabah', '40xx', 'pendapatan', 'open', 0],
  ['4080', 'Bagi Hasil Musyarakah', '40xx', 'pendapatan', 'open', 0],
  ['4090', 'ZIS Masuk', '40xx', 'pendapatan', 'open', 0],
  ['4100', 'Wakaf Masuk', '40xx', 'pendapatan', 'open', 0],
  ['5010', 'HPP (Beban Persediaan)', '50xx', 'beban', 'open', 0],
  ['5020', 'Retur COGS (reversal)', '50xx', 'beban', 'open', 0],
  ['5030', 'Beban Operasional', '50xx', 'beban', 'open', 0],
  ['5040', 'Beban Penyusutan Aset Tetap', '50xx', 'beban', 'pending', 1],
  ['5050', 'Denda/Keterlambatan (clearing)', '50xx', 'beban', 'closed', 0],
  ['5060', 'Bagi Hasil Partner Mudharabah', '50xx', 'beban', 'open', 0],
  ['5070', 'Beban Ijarah', '50xx', 'beban', 'pending', 1],
  ['5080', 'Distribusi SHU', '50xx', 'beban', 'pending', 1],
  ['5090', 'Zakat Keluar', '50xx', 'beban', 'open', 0],
  ['5100', 'Infak/Sedekah Keluar', '50xx', 'beban', 'open', 0],
  ['6010', 'Dana Pesantren (memo)', '60xx', 'syariah', 'pending', 1],
  ['6020', 'Aset Wakaf (memo)', '60xx', 'syariah', 'open', 0],
  ['6030', 'Zakat Tijarah Dibayar', '60xx', 'syariah', 'open', 0], // W5.3b (v26): flip open (OQ-13)
];
// Seed COA v24 = v23 + 6 flip W4.1 (open/0). Diturunkan (bukan
// disalin) agar konsisten persis dengan coaSeed src/db.ts.
const FLIP6 = new Set(['3020', '3030', '3040', '3050', '3060', '5080']);
const COA_V24: CoaRow[] = COA_V23.map((r) => (FLIP6.has(r[0]) ? ([r[0], r[1], r[2], r[3], 'open', 0] as CoaRow) : r));
const INSERT_COA =
  'INSERT INTO coa (code, name, "group", kind, status, needs_decision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING';
// Upgrade path (db.ts W4.1): 2080 TIDAK di-flip (ruling Q6).
const FLIP6_SQL =
  "UPDATE coa SET status = 'open', needs_decision = 0 WHERE code IN ('3020', '3030', '3040', '3050', '3060', '5080')";
// P3a (v28): close 2080 (SHU Berjalan; ruling Q6 W4 tak dipakai alur Sek.7).
const CLOSE_2080_SQL =
  "UPDATE coa SET status = 'closed', needs_decision = 0 WHERE code = '2080'";

/** Helper: jumlah baris hasil query COUNT(*) c pada DB in-memory. */
function cnt0(db: import('node:sqlite').DatabaseSync, sql: string): number {
  return Number((db.prepare(sql).get() as { c: number }).c);
}

/** Helper: daftar nama kolom tabel (PRAGMA table_info). */
function colsOf(db: import('node:sqlite').DatabaseSync, t: string): string {
  return (db.prepare('PRAGMA table_info(' + t + ')').all() as Array<{ name: string }>).map((r) => r.name).join(',');
}

// W4.2: C-suite (lib/coop.ts) -- import lib + postJournalInTx + DDL
// jurnal mirror src/db.ts (skema W1.1, sama test-akad.ts) + adapter
// TxDb + helper.
import {
  coopSavingsBalance,
  coopSavingsJournalFor,
  coopWithdrawJournalFor,
  createCoopMemberInTx,
  recordCoopMemberKeluarInTx,
  recordCoopSavingsInTx,
  recordCoopWithdrawInTx,
  setCoopMemberStatusInTx,
} from '../src/lib/coop.ts';
import type { CoopWithdrawRec } from '../src/lib/coop.ts';
import { postJournalInTx } from '../src/lib/jurnal.ts';
import type { TxDb } from '../src/lib/jurnal.ts';

// DDL journal mirror src/db.ts (skema W1.1 -- test-akad.ts; tanpa index).
const DDL_JE =
  "CREATE TABLE journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))";
const DDL_JL =
  "CREATE TABLE journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))";

/** Adapter node:sqlite -> TxDb (permukaan async jurnal.ts; mirror test-akad.ts). */
function toTxDb(db: import('node:sqlite').DatabaseSync): TxDb {
  const inVals = (a: unknown[]) => a as import('node:sqlite').SQLInputValue[];
  return {
    prepare: (sql: string) => ({
      run: async (...a: unknown[]) => {
        const r = db.prepare(sql).run(...inVals(a)) as unknown as { changes: number | bigint };
        return { changes: Number(r.changes ?? 0), lastInsertRowid: 0 };
      },
      get: async (...a: unknown[]) => db.prepare(sql).get(...inVals(a)),
      all: async (...a: unknown[]) => db.prepare(sql).all(...inVals(a)),
    }),
  };
}

/** Helper: nilai debit/credit akun tertentu pada entry (0 bila tak ada). */
function lineVal(
  db: import('node:sqlite').DatabaseSync,
  entryId: string,
  code: string,
  what: 'debit' | 'credit'
): number {
  const r = db
    .prepare('SELECT ' + what + ' v FROM journal_lines WHERE entry_id=? AND account_code=?')
    .get(entryId, code) as { v: number } | undefined;
  return r ? Number(r.v) : 0;
}

async function main(): Promise<void> {
  let mod: typeof import('node:sqlite');
  try {
    mod = await import('node:sqlite');
  } catch (e) {
    console.error('  SKIP - node:sqlite tak tersedia: ' + String(e));
    console.log('HAS_FAILURE');
    process.exit(1);
  }

  // ===== M1: fresh install skema v24 (seed v24 + CREATE tabel/index) =====
  {
    const db1 = new mod.DatabaseSync(':memory:');
    db1.exec(DDL_COA);
    const insCoa = db1.prepare(INSERT_COA);
    for (const r of COA_V24) insCoa.run(r[0], r[1], r[2], r[3], r[4], r[5]);
    db1.exec(FLIP6_SQL); // upgrade path; fresh = no-op (seed sudah open)
  db1.exec(CLOSE_2080_SQL); // P3a (v28): close 2080
    db1.exec(DDL_COOP_MEM);
    db1.exec(DDL_COOP_SV);
    db1.exec(DDL_COOP_SHU);
    for (const s of DDL_IDX) db1.exec(s);
    // Per kolom Sek.7.1 + rumpun (Q4):
    eq('M1: kolom coop_members (Sek.7.1 + rumpun Q4)', colsOf(db1, 'coop_members'), 'id,name,npwp,member_since,status,rumpun');
    eq('M1: kolom coop_savings (Sek.7.1)', colsOf(db1, 'coop_savings'), 'member_id,kind,amount,saved_at');
    eq(
      'M1: kolom coop_shu (Sek.7.1)',
      colsOf(db1, 'coop_shu'),
      'id,period,shu_total,cadangan_umum,cadangan_khusus,jasa_anggota,dibagi,rasio_json,created_by,created_at'
    );
    // UNIQUE(name): 2 anggota ber-name sama ditolak; rumpun tersimpan.
    db1.exec("INSERT INTO coop_members(id, name, member_since) VALUES ('m1', 'Ahmad', '2026-01-01')");
    let dupNameRejected = false;
    try {
      db1.exec("INSERT INTO coop_members(id, name, member_since) VALUES ('m2', 'Ahmad', '2026-02-01')");
    } catch {
      dupNameRejected = true;
    }
    ok('M1: UNIQUE(name) menolak duplikat anggota', dupNameRejected);
    db1.exec("INSERT INTO coop_members(id, name, member_since, rumpun) VALUES ('m3', 'Budi', '2026-01-01', 'Rumpun A')");
    eq('M1: coop_members = 2 baris (duplikat tertolak)', cnt0(db1, 'SELECT COUNT(*) c FROM coop_members'), 2);
    // PK komposit: member+kind+saved_at sama dgn nominal beda = sah;
    // duplikat eksak = ditolak.
    db1.exec("INSERT INTO coop_savings(member_id, kind, amount, saved_at) VALUES ('m1', 'pokok', 1000000, '2026-01-02')");
    db1.exec("INSERT INTO coop_savings(member_id, kind, amount, saved_at) VALUES ('m1', 'pokok', 500000, '2026-01-02')");
    let dupSaveRejected = false;
    try {
      db1.exec("INSERT INTO coop_savings(member_id, kind, amount, saved_at) VALUES ('m1', 'pokok', 1000000, '2026-01-02')");
    } catch {
      dupSaveRejected = true;
    }
    ok('M1: PK komposit menolak duplikat eksak, nominal beda sah', dupSaveRejected);
    eq('M1: coop_savings = 2 baris', cnt0(db1, 'SELECT COUNT(*) c FROM coop_savings'), 2);
    // UNIQUE(period): 1 baris SHU per periode.
    db1.exec("INSERT INTO coop_shu(id, period, shu_total, created_at) VALUES ('s1', '2026', 10000000, '2026-10-05')");
    let dupShuRejected = false;
    try {
      db1.exec("INSERT INTO coop_shu(id, period, shu_total, created_at) VALUES ('s2', '2026', 9999999, '2026-10-05')");
    } catch {
      dupShuRejected = true;
    }
    ok('M1: UNIQUE(period) menolak 2 baris SHU periode sama', dupShuRejected);
    db1.exec("INSERT INTO coop_shu(id, period, shu_total, created_at) VALUES ('s3', '2026-Q1', 2500000, '2026-10-05')");
    eq('M1: coop_shu = 2 baris (periode beda boleh)', cnt0(db1, 'SELECT COUNT(*) c FROM coop_shu'), 2);
    ok(
      'M1: idx_coop_savings ada',
      (db1.prepare('PRAGMA index_list(coop_savings)').all() as Array<{ name: string }>).some((x) => x.name === 'idx_coop_savings')
    );
    // 6 flip + close 2080 (P3a v28) + kontrol (fresh v28 = open44/pending6/nd6/closed2).
    eq('M1: coa COUNT = 52', cnt0(db1, 'SELECT COUNT(*) c FROM coa'), 52);
    eq('M1: coa open = 44 (38 v23 + 6 flip)', cnt0(db1, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 44);
    eq('M1: coa pending = 6 (13 - 6 flip - 1 close 2080)', cnt0(db1, "SELECT COUNT(*) c FROM coa WHERE status='pending'"), 6);
    eq('M1: coa closed = 2 (5050 + 2080 P3a)', cnt0(db1, "SELECT COUNT(*) c FROM coa WHERE status='closed'"), 2);
    eq('M1: coa needs_decision=1 = 6', cnt0(db1, 'SELECT COUNT(*) c FROM coa WHERE needs_decision=1'), 6);
    for (const code of FLIP6) {
      const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok('M1: coa ' + code + ' flip open/0', r.s === 'open' && r.n === 0, 'status=' + r.s + ' nd=' + r.n);
    }
    const ctrl = (code: string, status: string, nd: number): void => {
      const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok('M1: coa ' + code + ' tetap ' + status + '/nd=' + nd, r.s === status && r.n === nd);
    };
    ctrl('2080', 'closed', 0); // P3a (v28): ruling Q6 W4: tak dipakai alur Sek.7
    ctrl('1060', 'pending', 1);
    ctrl('5050', 'closed', 0);
    ctrl('6030', 'open', 0); // flip W5.3b (OQ-13)
    ctrl('4040', 'open', 0); // flip v22
    ctrl('1070', 'open', 0); // flip v23
    ctrl('2050', 'open', 0);
    ctrl('2060', 'open', 0);
    ctrl('2070', 'open', 0);
    ctrl('3010', 'open', 0);
    // Idempoten: DDL + flip kedua kali tak mengubah apa pun.
    db1.exec(DDL_COOP_MEM);
    db1.exec(FLIP6_SQL);
    db1.exec(CLOSE_2080_SQL);
    eq('M1: re-run DDL/flip idempoten (coop_members tetap 2)', cnt0(db1, 'SELECT COUNT(*) c FROM coop_members'), 2);
    eq('M1: re-run flip open tetap 44', cnt0(db1, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 44);
    // Stamp v24.
    db1.exec(STAMP_DDL);
    db1.exec('INSERT INTO schema_version(id, version) VALUES (1, 24) ON CONFLICT(id) DO UPDATE SET version = excluded.version');
    eq('M1: schema_version = 24', Number((db1.prepare('SELECT version v FROM schema_version').get() as { v: number }).v), 24);
    db1.close();
  }

  // ===== M2: upgrade path v23 -> v24 (DB stempel 23, coa seed v23) =====
  {
    const db2 = new mod.DatabaseSync(':memory:');
    db2.exec(DDL_COA);
    const insCoa = db2.prepare(INSERT_COA);
    for (const r of COA_V23) insCoa.run(r[0], r[1], r[2], r[3], r[4], r[5]);
    eq('M2: awal (baseline v26) coa open = 38', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 38);
    eq('M2: awal (baseline v26) coa pending = 13', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='pending'"), 13);
    // DB v23: tabel coop BELUM ada -> CREATE IF NOT EXISTS = path upgrade.
    db2.exec(DDL_COOP_MEM);
    db2.exec(DDL_COOP_SV);
    db2.exec(DDL_COOP_SHU);
    for (const s of DDL_IDX) db2.exec(s);
    ok(
      'M2: DDL coop aman pada DB v23 (IF NOT EXISTS)',
      (db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'coop_%'").all() as Array<{ name: string }>).length === 3
    );
    db2.exec(FLIP6_SQL);
    eq('M2: pasca FLIP6 coa open = 44', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 44);
    eq('M2: pasca FLIP6 coa pending = 7', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='pending'"), 7);
    eq('M2: pasca FLIP6 coa nd = 7', cnt0(db2, 'SELECT COUNT(*) c FROM coa WHERE needs_decision=1'), 7);
    const r2080 = db2.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get('2080') as { s: string; n: number };
    ok('M2: coa 2080 TIDAK ter-flip (Q6)', r2080.s === 'pending' && r2080.n === 1, 'status=' + r2080.s + ' nd=' + r2080.n);
    // FLIP6 ulangan = no-op; baris lama (1070 flip v23) tak tersentuh.
    db2.exec(FLIP6_SQL);
    eq('M2: FLIP6 ulang tetap open 44 (idempoten)', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 44);
    const r1070 = db2.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get('1070') as { s: string; n: number };
    ok('M2: coa 1070 (flip v23) tetap open/0', r1070.s === 'open' && r1070.n === 0);
    db2.close();
  }

  // ===== M3: stamp 23 -> 24 (mekanisme db.ts: ON CONFLICT DO UPDATE) =====
  {
    const db3 = new mod.DatabaseSync(':memory:');
    db3.exec(STAMP_DDL);
    db3.exec('INSERT INTO schema_version(id, version) VALUES (1, 23)');
    eq('M3: stamp awal = 23', Number((db3.prepare('SELECT version v FROM schema_version').get() as { v: number }).v), 23);
    db3.exec('INSERT INTO schema_version(id, version) VALUES (1, 24) ON CONFLICT(id) DO UPDATE SET version = excluded.version');
    eq('M3: stamp pasca upgrade = 24', Number((db3.prepare('SELECT version v FROM schema_version').get() as { v: number }).v), 24);
    db3.close();
  }

  // ===== C1-C6: lib/coop.ts (W4.2) -- engine simpanan Sek.7.2.3 =====
  {
    const db4 = new mod.DatabaseSync(':memory:');
    db4.exec(DDL_COA);
    const insCoa4 = db4.prepare(INSERT_COA);
    for (const r of COA_V24) insCoa4.run(r[0], r[1], r[2], r[3], r[4], r[5]);
    db4.exec(DDL_COOP_MEM);
    db4.exec(DDL_COOP_SV);
    db4.exec(DDL_JE);
    db4.exec(DDL_JL);
    const tdb4 = toTxDb(db4);
    const jeCnt = () => cnt0(db4, "SELECT COUNT(*) c FROM journal_entries WHERE ref_table='coop'");
    const coopJlCnt = () =>
      cnt0(db4, "SELECT COUNT(*) c FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.ref_table='coop'");
    const statusOf = (id: string): string =>
      String((db4.prepare('SELECT status s FROM coop_members WHERE id=?').get(id) as { s: string }).s);
    const rf = (entry: string): string =>
      String((db4.prepare('SELECT ref_id r FROM journal_entries WHERE id=?').get(entry) as { r: string }).r);
    const br = (entry: string, code: string): number =>
      Number((db4.prepare('SELECT balance_running b FROM journal_lines WHERE entry_id=? AND account_code=?').get(entry, code) as { b: number }).b);

    // C1: setor per kind -- D=K per entry + mapping akun Sek.7.2.3.
    await createCoopMemberInTx(tdb4, { id: 'c1', name: 'Andi', memberSince: '2026-10-06' });
    const s1 = await recordCoopSavingsInTx(tdb4, { memberId: 'c1', kind: 'pokok', amount: 10000, savedAt: '2026-10-06T08:00:00+07:00', gl_enabled: true });
    const s2 = await recordCoopSavingsInTx(tdb4, { memberId: 'c1', kind: 'wajib', amount: 5000, savedAt: '2026-10-06T08:01:00+07:00', gl_enabled: true });
    const s3 = await recordCoopSavingsInTx(tdb4, { memberId: 'c1', kind: 'sukarela', amount: 7000, savedAt: '2026-10-06T08:02:00+07:00', gl_enabled: true });
    eq('C1: 3 entry jurnal setor', jeCnt(), 3);
    ok('C1: entry id unik', !!s1.entryId && !!s2.entryId && !!s3.entryId && s1.entryId !== s2.entryId && s2.entryId !== s3.entryId);
    ok('C1: D=K 2050 (setor pokok)', lineVal(db4, s1.entryId!, '2050', 'credit') === 10000 && lineVal(db4, s1.entryId!, '1010', 'debit') === 10000);
    ok('C1: D=K 2060 (setor wajib)', lineVal(db4, s2.entryId!, '2060', 'credit') === 5000 && lineVal(db4, s2.entryId!, '1010', 'debit') === 5000);
    ok('C1: D=K 2070 (setor sukarela)', lineVal(db4, s3.entryId!, '2070', 'credit') === 7000 && lineVal(db4, s3.entryId!, '1010', 'debit') === 7000);
    eq('C1: balance_running 2050 = -10000 (akun liabilitas: kredit = negatif)', br(s1.entryId!, '2050'), -10000);
    eq('C1: balance_running 1010 = 10000 (kas: debit = positif)', br(s1.entryId!, '1010'), 10000);
    eq('C1: ref_id F1 setor', rf(s1.entryId!), 'coop#c1:sv#2026-10-06T08:00:00+07:00:pokok@10000');
    eq('C1: saldo pokok c1 = 10000', await coopSavingsBalance(tdb4, 'c1', 'pokok'), 10000);
    eq('C1: saldo wajib c1 = 5000', await coopSavingsBalance(tdb4, 'c1', 'wajib'), 5000);
    eq('C1: saldo sukarela c1 = 7000', await coopSavingsBalance(tdb4, 'c1', 'sukarela'), 7000);

    // C2: idempoten -- re-post spec sama = no-op (kembalikan id entry).
    const w1rec: CoopWithdrawRec = { memberId: 'c1', amount: 3000, savedAt: '2026-10-06T09:00:00+07:00', gl_enabled: true };
    const w1 = await recordCoopWithdrawInTx(tdb4, w1rec);
    ok('C2: tarik 3000 tercatat + jurnal D2070/K1010', !!w1.entryId && lineVal(db4, w1.entryId!, '2070', 'debit') === 3000 && lineVal(db4, w1.entryId!, '1010', 'credit') === 3000);
    eq('C2: saldo sukarela c1 = 4000 (7000 - 3000)', await coopSavingsBalance(tdb4, 'c1', 'sukarela'), 4000);
    eq('C2: baris negatif -3000 (Option A)', cnt0(db4, "SELECT COUNT(*) c FROM coop_savings WHERE member_id='c1' AND amount = -3000"), 1);
    const jeB2 = jeCnt();
    eq('C2: re-post setor ref sama = no-op (entry sama)', await postJournalInTx(tdb4, coopSavingsJournalFor({ memberId: 'c1', kind: 'pokok', amount: 10000, savedAt: '2026-10-06T08:00:00+07:00' })), s1.entryId);
    eq('C2: re-post tarik ref sama = no-op (entry sama)', await postJournalInTx(tdb4, coopWithdrawJournalFor(w1rec)), w1.entryId);
    eq('C2: jumlah entry tak bertambah', jeCnt(), jeB2);

    // C3: negative guard + validasi input.
    let e1 = '';
    try {
      await recordCoopWithdrawInTx(tdb4, { memberId: 'c1', amount: 4001, savedAt: '2026-10-06T09:01:00+07:00', gl_enabled: true });
    } catch (x) {
      e1 = String(x);
    }
    ok('C3: tarik 4001 > sisa 4000 ditolak', e1.includes('melebihi sisa'));
    eq('C3: entry tak bertambah (guard)', jeCnt(), jeB2);
    const w2 = await recordCoopWithdrawInTx(tdb4, { memberId: 'c1', amount: 4000, savedAt: '2026-10-06T09:02:00+07:00', gl_enabled: true });
    ok('C3: tarik = sisa (4000) sah (sisa -> 0)', !!w2.entryId && (await coopSavingsBalance(tdb4, 'c1', 'sukarela')) === 0);
    let e2 = '';
    try {
      await recordCoopWithdrawInTx(tdb4, { memberId: 'c1', amount: 1, savedAt: '2026-10-06T09:03:00+07:00', gl_enabled: true });
    } catch (x) {
      e2 = String(x);
    }
    ok('C3: tarik 1 pada sisa 0 ditolak', e2.includes('melebihi sisa'));
    let e3 = '';
    try {
      await recordCoopWithdrawInTx(tdb4, { memberId: 'seseorang', amount: 100, gl_enabled: true });
    } catch (x) {
      e3 = String(x);
    }
    ok('C3: anggota tak dikenal ditolak', e3.includes('tidak ditemukan'));
    let e4 = '';
    try {
      await recordCoopSavingsInTx(tdb4, { memberId: 'c1', kind: 'pokok', amount: 0, gl_enabled: true });
    } catch (x) {
      e4 = String(x);
    }
    ok('C3: amount 0 ditolak (positif saja)', e4.includes('positif'));

    // C4: gl-off = zero behavior change (rows tercatat, 0 jurnal baru).
    await createCoopMemberInTx(tdb4, { id: 'c4', name: 'Budi', memberSince: '2026-10-06' });
    const jeB4 = jeCnt();
    const jlB4 = coopJlCnt();
    eq(
      'C4: gl-off setor entryId = null',
      (await recordCoopSavingsInTx(tdb4, { memberId: 'c4', kind: 'pokok', amount: 9000, savedAt: '2026-10-06T10:00:00+07:00', gl_enabled: false })).entryId,
      null
    );
    eq(
      'C4: gl-off setor sukarela entryId = null',
      (await recordCoopSavingsInTx(tdb4, { memberId: 'c4', kind: 'sukarela', amount: 5000, savedAt: '2026-10-06T10:00:30+07:00', gl_enabled: false })).entryId,
      null
    );
    eq(
      'C4: gl-off tarik entryId = null',
      (await recordCoopWithdrawInTx(tdb4, { memberId: 'c4', amount: 2000, savedAt: '2026-10-06T10:01:00+07:00', gl_enabled: false })).entryId,
      null
    );
    eq('C4: gl-off = 0 entry jurnal baru', jeCnt(), jeB4);
    eq('C4: gl-off = 0 baris jurnal baru', coopJlCnt(), jlB4);
    eq('C4: baris coop_savings c4 tercatat (pokok 9000)', await coopSavingsBalance(tdb4, 'c4', 'pokok'), 9000);
    eq('C4: saldo sukarela c4 = 3000 (5000 - 2000)', await coopSavingsBalance(tdb4, 'c4', 'sukarela'), 3000);

    // C5: keluar -- refund pokok saja (D2050 -> K1010); re-keluar no-op.
    const k1 = await recordCoopMemberKeluarInTx(tdb4, { memberId: 'c1', changedAt: '2026-10-06T11:00:00+07:00', gl_enabled: true });
    ok(
      'C5: D2050 = K1010 = 10000 (pokok c1)',
      !!k1.entryId && lineVal(db4, k1.entryId!, '2050', 'debit') === 10000 && lineVal(db4, k1.entryId!, '1010', 'credit') === 10000
    );
    eq('C5: wajib/sukarela TIDAK di-refund', lineVal(db4, k1.entryId!, '2060', 'debit') + lineVal(db4, k1.entryId!, '2070', 'debit'), 0);
    eq('C5: ref_id exit F1', rf(k1.entryId!), 'coop#c1:exit#2026-10-06T11:00:00+07:00');
    eq('C5: status c1 = keluar', statusOf('c1'), 'keluar');
    eq(
      'C5: re-keluar = no-op',
      (await recordCoopMemberKeluarInTx(tdb4, { memberId: 'c1', changedAt: '2026-10-06T12:00:00+07:00', gl_enabled: true })).entryId,
      null
    );
    eq('C5: entry keluar c1 tetap 1', cnt0(db4, "SELECT COUNT(*) c FROM journal_entries WHERE ref_table='coop' AND ref_id = 'coop#c1:exit#2026-10-06T11:00:00+07:00'"), 1);
    await createCoopMemberInTx(tdb4, { id: 'c5b', name: 'Cak Nun', memberSince: '2026-10-06' });
    eq(
      'C5: keluar tanpa pokok = tanpa jurnal',
      (await recordCoopMemberKeluarInTx(tdb4, { memberId: 'c5b', changedAt: '2026-10-06T11:05:00+07:00', gl_enabled: true })).entryId,
      null
    );
    eq('C5: status c5b = keluar', statusOf('c5b'), 'keluar');

    // C6: create + transisi status (keluar = terminal).
    await createCoopMemberInTx(tdb4, { id: 'c6', name: 'Dewi', rumpun: 'Rumpun X', memberSince: '2026-10-06' });
    let e6 = '';
    try {
      await createCoopMemberInTx(tdb4, { id: 'c6b', name: 'Dewi', memberSince: '2026-10-06' });
    } catch (x) {
      e6 = String(x);
    }
    ok('C6: UNIQUE(name) ditolak', e6.length > 0);
    eq('C6: status awal c6 = aktif', statusOf('c6'), 'aktif');
    await setCoopMemberStatusInTx(tdb4, { memberId: 'c6', status: 'nonaktif' });
    eq('C6: c6 -> nonaktif', statusOf('c6'), 'nonaktif');
    await setCoopMemberStatusInTx(tdb4, { memberId: 'c6', status: 'aktif' });
    eq('C6: c6 kembali aktif', statusOf('c6'), 'aktif');
    await setCoopMemberStatusInTx(tdb4, { memberId: 'c6', status: 'aktif' });
    eq('C6: status sama = no-op', statusOf('c6'), 'aktif');
    let e7 = '';
    try {
      await setCoopMemberStatusInTx(tdb4, { memberId: 'c6', status: 'gila' });
    } catch (x) {
      e7 = String(x);
    }
    ok('C6: status tak dikenal ditolak', e7.includes('tidak dikenal'));
    let e8 = '';
    try {
      await setCoopMemberStatusInTx(tdb4, { memberId: 'hantu', status: 'aktif' });
    } catch (x) {
      e8 = String(x);
    }
    ok('C6: anggota tak dikenal ditolak', e8.includes('tidak ditemukan'));
    await recordCoopMemberKeluarInTx(tdb4, { memberId: 'c6', changedAt: '2026-10-06T13:00:00+07:00', gl_enabled: false });
    let e9 = '';
    try {
      await setCoopMemberStatusInTx(tdb4, { memberId: 'c6', status: 'aktif' });
    } catch (x) {
      e9 = String(x);
    }
    ok('C6: keluar -> aktif ditolak (terminal)', e9.includes('terminal'));
    db4.close();
  }

  // ===== R-suite W4.3: route wiring (engine lib/coop.ts + rekap SQL) =====
  // C-suite menguji engine. R-suite menguji LAYER yang route.ts (pola
  // /api/akad) sajikan + akui: rekap GET = akun W4.1 COA 4-digit
  // (2050/2060/2070 + 30xx) dari journal_lines (SUM debit-credit) + COA
  // + saldo aljabar coop_savings; tiap op delegasi ke engine InTx (tak
  // ada logika duplikat / akun 5-digit / coop_savings_jv / kolom cat /
  // double-count).
  {
    const db5 = new mod.DatabaseSync(':memory:');
    db5.exec(DDL_COA);
    const insCoa5 = db5.prepare(INSERT_COA);
    for (const r of COA_V24) insCoa5.run(r[0], r[1], r[2], r[3], r[4], r[5]);
    db5.exec(DDL_COOP_MEM);
    db5.exec(DDL_COOP_SV);
    db5.exec(DDL_JE);
    db5.exec(DDL_JL);
    const tdb5 = toTxDb(db5);

    // Miror REKAP_ACCOUNTS route.ts (OQ6 W4.3): simpanan 2050/2060/2070
    // + modal/SHU 30xx. 2080 pending tak ditampil.
    const R_REKAP = ['2050', '2060', '2070', '3010', '3020', '3030', '3040', '3050', '3060'];
    // Miror GET /api/koperasi rekap: saldo akun = SUM(debit)-SUM(credit)
    // di journal_lines (kumulatif, pola gl route W1.4); nama dari COA.
    const rekapAccounts = (): { code: string; name: string; balance: number }[] => {
      const ph = R_REKAP.map(() => '?').join(', ');
      const balRows = db5
        .prepare(
          'SELECT account_code, SUM(debit) - SUM(credit) AS bal FROM journal_lines WHERE account_code IN (' +
            ph +
            ') GROUP BY account_code'
        )
        .all(...R_REKAP) as { account_code: string; bal: number }[];
      const coaRows = db5
        .prepare('SELECT code, name FROM coa WHERE code IN (' + ph + ')')
        .all(...R_REKAP) as { code: string; name: string }[];
      const coaMap = new Map(coaRows.map((x) => [x.code, x.name] as const));
      const balMap = new Map(balRows.map((x) => [x.account_code, Math.round(Number(x.bal) || 0)] as const));
      return R_REKAP.map((code) => ({ code, name: coaMap.get(code) ?? 'Akun ' + code, balance: balMap.get(code) ?? 0 }));
    };
    // Miror saldo aljabar route (SUM coop_savings per anggota+kind;
    // baris tarik = negatif, Option A W4.2).
    const memberBal = (memberId: string, kind: string): number =>
      Number(
        (db5
          .prepare('SELECT COALESCE(SUM(amount), 0) s FROM coop_savings WHERE member_id=? AND kind=?')
          .get(memberId, kind) as { s: number }).s
      );

    // R1: rekap GET = 9 akun COA W4.1 (4-digit), TIDAK 5-digit; nama COA.
    const acc1 = rekapAccounts();
    eq('R1: rekap = 9 akun (2050/2060/2070 + 3010..3060)', acc1.length, 9);
    eq('R1: daftar akun rekap = COA W4.1', acc1.map((a) => a.code).join(','), R_REKAP.join(','));
    ok('R1: tak ada kode 5-digit (11010 dst.)', !acc1.some((a) => a.code.length === 5));
    ok('R1: nama 2050 = Simpanan Pokok (dari COA)', acc1.find((a) => a.code === '2050')?.name === 'Simpanan Pokok');
    ok('R1: nama 3020 = SHU Ditahan (akun ekuitas)', acc1.find((a) => a.code === '3020')?.name === 'SHU Ditahan');
    ok('R1: saldo awal semua rekap = 0', acc1.every((a) => a.balance === 0));
    // R2: setor (engine) -> K205x rekap turun (liabilitas) + D1010 kas;
    // saldo aljabar anggota naik.
    await createCoopMemberInTx(tdb5, { id: 'r1', name: 'Rina', memberSince: '2026-10-06' });
    const rs1 = await recordCoopSavingsInTx(tdb5, {
      memberId: 'r1',
      kind: 'pokok',
      amount: 10000,
      savedAt: '2026-10-06T08:00:00+07:00',
      gl_enabled: true,
    });
    ok(
      'R2: sektor punya entryId (D1010 -> K2050)',
      !!rs1.entryId && lineVal(db5, rs1.entryId!, '1010', 'debit') === 10000 && lineVal(db5, rs1.entryId!, '2050', 'credit') === 10000
    );
    await recordCoopSavingsInTx(tdb5, { memberId: 'r1', kind: 'wajib', amount: 5000, savedAt: '2026-10-06T08:01:00+07:00', gl_enabled: true });
    await recordCoopSavingsInTx(tdb5, { memberId: 'r1', kind: 'sukarela', amount: 7000, savedAt: '2026-10-06T08:02:00+07:00', gl_enabled: true });
    eq('R2: rekap 2050 = -10000 (kredit liabilitas)', rekapAccounts().find((a) => a.code === '2050')!.balance, -10000);
    eq('R2: rekap 2060 = -5000', rekapAccounts().find((a) => a.code === '2060')!.balance, -5000);
    eq('R2: rekap 2070 = -7000', rekapAccounts().find((a) => a.code === '2070')!.balance, -7000);
    eq('R2: saldo pokok r1 (coop_savings) = 10000', memberBal('r1', 'pokok'), 10000);
    eq('R2: saldo wajib r1 = 5000', memberBal('r1', 'wajib'), 5000);
    eq('R2: saldo sukarela r1 = 7000', memberBal('r1', 'sukarela'), 7000);

    // R3: tarik sukarela (engine) = SATU baris negatif saja (tanpa
    // UPDATE / double-count); rekap 2070 net turun sekali.
    const rw1 = await recordCoopWithdrawInTx(tdb5, {
      memberId: 'r1',
      amount: 3000,
      savedAt: '2026-10-06T09:00:00+07:00',
      gl_enabled: true,
    });
    ok(
      'R3: tarik punya entryId (D2070 -> K1010)',
      !!rw1.entryId && lineVal(db5, rw1.entryId!, '2070', 'debit') === 3000 && lineVal(db5, rw1.entryId!, '1010', 'credit') === 3000
    );
    eq(
      'R3: tepat 1 baris negatif -3000 (tak ada UPDATE/double-count)',
      cnt0(db5, "SELECT COUNT(*) c FROM coop_savings WHERE member_id='r1' AND amount = -3000"),
      1
    );
    eq('R3: saldo sukarela r1 = 4000 (7000 - 3000, sekali)', memberBal('r1', 'sukarela'), 4000);
    eq('R3: rekap 2070 net = -4000 (kredit 7000 - debit 3000)', rekapAccounts().find((a) => a.code === '2070')!.balance, -4000);
    // R4: keluar (engine) -> refund pokok D2050->K1010; status terminal;
    // re-keluar = no-op idempoten (tanpa refund kedua).
    const rk = await recordCoopMemberKeluarInTx(tdb5, {
      memberId: 'r1',
      changedAt: '2026-10-06T11:00:00+07:00',
      gl_enabled: true,
    });
    ok(
      'R4: keluar punya entryId (refund pokok D2050/K1010)',
      !!rk.entryId && lineVal(db5, rk.entryId!, '2050', 'debit') === 10000 && lineVal(db5, rk.entryId!, '1010', 'credit') === 10000
    );
    eq('R4: status r1 = keluar', String((db5.prepare('SELECT status s FROM coop_members WHERE id=?').get('r1') as { s: string }).s), 'keluar');
    eq('R4: rekap 2050 kembali 0 (debit = credit = 10000)', rekapAccounts().find((a) => a.code === '2050')!.balance, 0);
    eq(
      'R4: re-keluar = no-op (tanpa refund kedua)',
      (await recordCoopMemberKeluarInTx(tdb5, { memberId: 'r1', changedAt: '2026-10-06T12:00:00+07:00', gl_enabled: true })).entryId,
      null
    );

    // R5: kondisi galat yang route.ts petakan ke HTTP status.
    // 404 anggota tak ditemukan / 409 UNIQUE(name) / 400 validasi+insufficient.
    let g404 = '';
    try {
      await recordCoopSavingsInTx(tdb5, { memberId: 'hantu', kind: 'pokok', amount: 1000, gl_enabled: true });
    } catch (x) {
      g404 = String(x);
    }
    ok('R5: anggota tak ditemukan -> galat (route: 404)', g404.includes('tidak ditemukan'));
    let g409 = '';
    try {
      await createCoopMemberInTx(tdb5, { id: 'dup', name: 'Rina', memberSince: '2026-10-06' });
    } catch (x) {
      g409 = String(x);
    }
    ok('R5: nama duplikat -> UNIQUE (route: 409 coop_member_duplicate)', g409.includes('UNIQUE constraint failed'));
    await createCoopMemberInTx(tdb5, { id: 'r2', name: 'Sari', memberSince: '2026-10-06' });
    let g400 = '';
    try {
      await recordCoopWithdrawInTx(tdb5, { memberId: 'r2', amount: 1000, savedAt: '2026-10-06T09:00:00+07:00', gl_enabled: true });
    } catch (x) {
      g400 = String(x);
    }
    ok('R5: tarik melebihi sisa -> galat (route: 400 coop_insufficient)', g400.includes('melebihi sisa'));
    let g400b = '';
    try {
      await recordCoopSavingsInTx(tdb5, { memberId: 'r2', kind: 'pokok', amount: 0, gl_enabled: true });
    } catch (x) {
      g400b = String(x);
    }
    ok('R5: amount <= 0 -> galat (route: 400 validasi)', g400b.length > 0);
    db5.close();
  }

  // ===== R6 (W4.6): rekap per rumpun -- kumpul ulang saldo per keluarga =====
  // Miror agregasi GET /api/koperasi (route.ts W4.6, satu sumber): key
  // rumpun NOCASE, bucket 'tanpa rumpun' (label null) diurutkan paling
  // bawah, total = simpanan pokok+wajib+sukarela per anggota (BUKAN modal
  // 3010 / jasa 3050, itu op terpisah). 4 anggota: m1 'Rumpun A' +
  // m2 'rumpun a' (merge NOCASE) + m3 'Rumpun B' + m4 null.
  {
    const db6 = new mod.DatabaseSync(':memory:');
    db6.exec(DDL_COOP_MEM);
    db6.exec(DDL_COOP_SV);
    const insMem6 = db6.prepare(
      "INSERT INTO coop_members(id, name, rumpun, member_since) VALUES (?, ?, ?, '2026-10-06')"
    );
    insMem6.run('m1', 'Andi', 'Rumpun A');
    insMem6.run('m2', 'Budi', 'rumpun a'); // NOCASE: sama dgn 'Rumpun A'
    insMem6.run('m3', 'Cici', 'Rumpun B');
    insMem6.run('m4', 'Dodi', null); // tanpa rumpun
    const insSv6 = db6.prepare(
      'INSERT INTO coop_savings(member_id, kind, amount, saved_at) VALUES (?, ?, ?, ?)'
    );
    insSv6.run('m1', 'pokok', 10000, '2026-10-06T08:00:00+07:00');
    insSv6.run('m1', 'sukarela', 5000, '2026-10-06T08:01:00+07:00');
    insSv6.run('m2', 'wajib', 3000, '2026-10-06T08:02:00+07:00');
    insSv6.run('m2', 'sukarela', 2000, '2026-10-06T08:03:00+07:00');
    insSv6.run('m3', 'pokok', 8000, '2026-10-06T08:04:00+07:00');
    insSv6.run('m4', 'sukarela', 1000, '2026-10-06T08:05:00+07:00');

    // Miror route.ts W4.6: saldo per anggota per jenis (pokok/wajib/sukarela)
    // lalu kumpul per rumpun (key NOCASE; null bucket label null, urut bawah).
    type RRRow = {
      rumpun: string | null;
      member_count: number;
      pokok: number;
      wajib: number;
      sukarela: number;
      total: number;
    };
    const rekapRumpun = (): RRRow[] => {
      const mems = db6
        .prepare('SELECT id, rumpun FROM coop_members ORDER BY name COLLATE NOCASE')
        .all() as { id: string; rumpun: string | null }[];
      const bal = new Map<string, { pokok: number; wajib: number; sukarela: number; total: number }>();
      for (const m of mems) bal.set(m.id, { pokok: 0, wajib: 0, sukarela: 0, total: 0 });
      for (const r of db6
        .prepare(
          "SELECT member_id, kind, SUM(amount) s FROM coop_savings WHERE kind IN ('pokok','wajib','sukarela') GROUP BY member_id, kind"
        )
        .all() as { member_id: string; kind: string; s: number }[]) {
        const b = bal.get(r.member_id)!;
        const amt = Math.round(Number(r.s) || 0);
        if (r.kind === 'pokok') b.pokok = amt;
        else if (r.kind === 'wajib') b.wajib = amt;
        else if (r.kind === 'sukarela') b.sukarela = amt;
      }
      for (const b of bal.values()) b.total = b.pokok + b.wajib + b.sukarela;
      type Acc = {
        label: string | null;
        member_count: number;
        pokok: number;
        wajib: number;
        sukarela: number;
        total: number;
      };
      const map = new Map<string, Acc>();
      for (const m of mems) {
        const key = m.rumpun ? m.rumpun.toLowerCase() : '';
        const e =
          map.get(key) ??
          { label: m.rumpun ?? null, member_count: 0, pokok: 0, wajib: 0, sukarela: 0, total: 0 };
        e.member_count += 1;
        const b = bal.get(m.id)!;
        e.pokok += b.pokok;
        e.wajib += b.wajib;
        e.sukarela += b.sukarela;
        e.total += b.total;
        map.set(key, e);
      }
      const out = [...map.values()].sort((a, b) => {
        if (a.label === null && b.label === null) return 0;
        if (a.label === null) return 1;
        if (b.label === null) return -1;
        return a.label.localeCompare(b.label);
      });
      return out.map((x) => ({
        rumpun: x.label,
        member_count: x.member_count,
        pokok: x.pokok,
        wajib: x.wajib,
        sukarela: x.sukarela,
        total: x.total,
      }));
    };

    const rr = rekapRumpun();
    const gA = rr.find((x) => x.rumpun === 'Rumpun A')!;
    const gB = rr.find((x) => x.rumpun === 'Rumpun B')!;
    const gN = rr[rr.length - 1]; // tanpa rumpun (label null)
    eq('R6a: rekap rumpun = 3 baris (Rumpun A merge, Rumpun B, tanpa rumpun)', rr.length, 3);
    eq('R6b: Rumpun A member_count = 2 (m1+m2 NOCASE)', gA.member_count, 2);
    eq('R6c: Rumpun B member_count = 1 (m3)', gB.member_count, 1);
    ok('R6d: baris terakhir = tanpa rumpun (label null)', gN.rumpun === null);
    eq('R6e: urutan = [Rumpun A, Rumpun B, null]', rr.map((x) => x.rumpun ?? 'null').join(','), 'Rumpun A,Rumpun B,null');
    // Rincian per jenis (m1: 10000 pokok + 5000 sukarela; m2: 3000 wajib + 2000
    // sukarela; m3: 8000 pokok; m4: 1000 sukarela):
    eq('R6h: Rumpun A pokok = 10000 (m1)', gA.pokok, 10000);
    eq('R6i: Rumpun A wajib = 3000 (m2)', gA.wajib, 3000);
    eq('R6j: Rumpun A sukarela = 7000 (m1 5000 + m2 2000)', gA.sukarela, 7000);
    eq('R6k: Rumpun A total = 20000 (10000+3000+7000)', gA.total, 20000);
    eq('R6l: Rumpun B pokok = 8000 (m3)', gB.pokok, 8000);
    eq('R6m: Rumpun B wajib + sukarela = 0', gB.wajib + gB.sukarela, 0);
    eq('R6n: Tanpa rumpun sukarela = 1000 (m4)', gN.sukarela, 1000);
    eq('R6f1: SUM(member_count) = 4 (semua anggota)', rr.reduce((s, x) => s + x.member_count, 0), 4);
    eq(
      'R6f2: SUM per jenis = pokok 18000 / wajib 3000 / sukarela 8000',
      [
        rr.reduce((s, x) => s + x.pokok, 0),
        rr.reduce((s, x) => s + x.wajib, 0),
        rr.reduce((s, x) => s + x.sukarela, 0),
      ].join(','),
      '18000,3000,8000'
    );
    eq('R6f3: SUM(total) = grand total simpanan (29000)', rr.reduce((s, x) => s + x.total, 0), 29000);
    ok(
      'R6g: merge NOCASE (m1+m2 SATU grup; label = Rumpun A, bukan "rumpun a")',
      gA.member_count === 2 && !rr.some((x) => x.rumpun === 'rumpun a')
    );
    db6.close();
  }

  console.log(passes + ' passed, ' + failures + ' failed');
  if (failures > 0) {
    console.log('HAS_FAILURE');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
