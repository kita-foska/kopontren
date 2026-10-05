/**
 * W4.1 (skema v24) -- test skema koperasi Level C (Sek.7.1):
 *  M1: fresh install v24 (seed COA_V24 + CREATE 3 tabel + index + stamp).
 *  M2: upgrade path v23 -> v24 (seed COA_V23 + FLIP6 + DDL IF NOT EXISTS).
 *  M3: stamp 23 -> 24 (mekanisme ON CONFLICT DO UPDATE = db.ts).
 * Node langsung (type-stripping, Node >= 23.6): npm run test:coop.
 * In-memory node:sqlite; DDL mirror src/db.ts (skema v24). C-suite
 * (lib/coop.ts) ditambahkan di W4.2.
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
// open=37 / pending=14 / closed=1; flip W2.7 + W3.1 sudah 'open').
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
  ['6030', 'Zakat Tijarah Dibayar', '60xx', 'syariah', 'pending', 1],
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

/** Helper: jumlah baris hasil query COUNT(*) c pada DB in-memory. */
function cnt0(db: import('node:sqlite').DatabaseSync, sql: string): number {
  return Number((db.prepare(sql).get() as { c: number }).c);
}

/** Helper: daftar nama kolom tabel (PRAGMA table_info). */
function colsOf(db: import('node:sqlite').DatabaseSync, t: string): string {
  return (db.prepare('PRAGMA table_info(' + t + ')').all() as Array<{ name: string }>).map((r) => r.name).join(',');
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
    // 6 flip + kontrol (state akhir fresh v24 = open43/pending8/nd8).
    eq('M1: coa COUNT = 52', cnt0(db1, 'SELECT COUNT(*) c FROM coa'), 52);
    eq('M1: coa open = 43 (37 v23 + 6 flip)', cnt0(db1, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 43);
    eq('M1: coa pending = 8 (14 - 6 flip)', cnt0(db1, "SELECT COUNT(*) c FROM coa WHERE status='pending'"), 8);
    eq('M1: coa closed = 1', cnt0(db1, "SELECT COUNT(*) c FROM coa WHERE status='closed'"), 1);
    eq('M1: coa needs_decision=1 = 8', cnt0(db1, 'SELECT COUNT(*) c FROM coa WHERE needs_decision=1'), 8);
    for (const code of FLIP6) {
      const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok('M1: coa ' + code + ' flip open/0', r.s === 'open' && r.n === 0, 'status=' + r.s + ' nd=' + r.n);
    }
    const ctrl = (code: string, status: string, nd: number): void => {
      const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok('M1: coa ' + code + ' tetap ' + status + '/nd=' + nd, r.s === status && r.n === nd);
    };
    ctrl('2080', 'pending', 1); // ruling Q6: SHU Berjalan tak dipakai alur Sek.7
    ctrl('1060', 'pending', 1);
    ctrl('5050', 'closed', 0);
    ctrl('6030', 'pending', 1);
    ctrl('4040', 'open', 0); // flip v22
    ctrl('1070', 'open', 0); // flip v23
    ctrl('2050', 'open', 0);
    ctrl('2060', 'open', 0);
    ctrl('2070', 'open', 0);
    ctrl('3010', 'open', 0);
    // Idempoten: DDL + flip kedua kali tak mengubah apa pun.
    db1.exec(DDL_COOP_MEM);
    db1.exec(FLIP6_SQL);
    eq('M1: re-run DDL/flip idempoten (coop_members tetap 2)', cnt0(db1, 'SELECT COUNT(*) c FROM coop_members'), 2);
    eq('M1: re-run flip open tetap 43', cnt0(db1, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 43);
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
    eq('M2: awal (v23) coa open = 37', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 37);
    eq('M2: awal (v23) coa pending = 14', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='pending'"), 14);
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
    eq('M2: pasca FLIP6 coa open = 43', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 43);
    eq('M2: pasca FLIP6 coa pending = 8', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='pending'"), 8);
    eq('M2: pasca FLIP6 coa nd = 8', cnt0(db2, 'SELECT COUNT(*) c FROM coa WHERE needs_decision=1'), 8);
    const r2080 = db2.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get('2080') as { s: string; n: number };
    ok('M2: coa 2080 TIDAK ter-flip (Q6)', r2080.s === 'pending' && r2080.n === 1, 'status=' + r2080.s + ' nd=' + r2080.n);
    // FLIP6 ulangan = no-op; baris lama (1070 flip v23) tak tersentuh.
    db2.exec(FLIP6_SQL);
    eq('M2: FLIP6 ulang tetap open 43 (idempoten)', cnt0(db2, "SELECT COUNT(*) c FROM coa WHERE status='open'"), 43);
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
