/**
 * W3.1 (skema v23) -- test modul akad: DDL akad + akad_events (Sek.6.1)
 * + index + flip 9 COA 'pending' -> 'open' + schema_version stamp.
 * Node langsung (type-stripping, Node >= 23.6/v24): npm run test:akad.
 * In-memory node:sqlite, DDL mirror src/db.ts (v23). Cakupan:
 *  - M1 (fresh install v23): seed v23 + CREATE tabel/index; kolom
 *    akad/akad_events persis Sek.6.1 (PRAGMA table_info, per kolom);
 *    UNIQUE(type, counterparty, opened_at, amount); idx_akad_opened +
 *    idx_akad_events; coa open=37/pending=14/closed=1, nd=14, COUNT=52;
 *    9 flip open; kontrol 6030/5050/1060/2080 & flip v22 tak berubah;
 *    schema_version stamp 23.
 *  - M2 (upgrade v22->v23): state coa v22 (9 akun pending) + seed v23
 *    (DO NOTHING, baris lama tak ter-impa) + UPDATE flip -> 9 akun
 *    open; DDL IF NOT EXISTS idempoten (jalankan 2x); 6030/5050/1060
 *    tak berubah; kontrol flip v22 (2090/4040) tetap open; stamp 22->23.
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
function eq<T>(name: string, actual: T, expected: T): void {
  ok(name, actual === expected, 'dapat ' + String(actual) + ', seharusnya ' + String(expected));
}

// DDL mirror src/db.ts (skema v23: coa + akad + akad_events + index).
const DDL_COA =
  'CREATE TABLE coa(code TEXT PRIMARY KEY, name TEXT NOT NULL, "group" TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'open\', pap_ref TEXT, needs_decision INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')))';
const DDL_AKAD =
  "CREATE TABLE IF NOT EXISTS akad(id TEXT PRIMARY KEY, type TEXT NOT NULL, counterparty TEXT NOT NULL, amount INTEGER NOT NULL, terms_json TEXT, status TEXT NOT NULL DEFAULT 'active', opened_at TEXT NOT NULL, settled_at TEXT, note TEXT, UNIQUE(type, counterparty, opened_at, amount))";
const DDL_AKAD_EV =
  'CREATE TABLE IF NOT EXISTS akad_events(id TEXT PRIMARY KEY, akad_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, event_date TEXT NOT NULL, posted_entry TEXT, created_by TEXT, created_at TEXT NOT NULL)';
const DDL_IDX = [
  'CREATE INDEX IF NOT EXISTS idx_akad_opened ON akad(opened_at)',
  'CREATE INDEX IF NOT EXISTS idx_akad_events ON akad_events(akad_id, event_date)',
];
const STAMP_DDL =
  'CREATE TABLE IF NOT EXISTS schema_version(id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)';

// Seed COA v22 (mirror COA_V22 test-zis.ts: 52 akun; 28 open /
// 23 pending / 1 closed; flip W2.7 2090/5090/4040 sudah 'open').
type CoaRow = [string, string, string, string, string, number];
const COA_V22: CoaRow[] = [
  ['1010', 'Kas Toko', '10xx', 'aset', 'open', 0],
  ['1020', 'Kas Bank', '10xx', 'aset', 'open', 0],
  ['1030', 'Piutang Penjualan', '10xx', 'aset', 'open', 0],
  ['1040', 'Persediaan', '10xx', 'aset', 'open', 0],
  ['1050', 'Aset Tetap', '10xx', 'aset', 'open', 0],
  ['1060', 'Akumulasi Penyusutan', '10xx', 'aset', 'pending', 1],
  ['1070', 'Piutang Murabahah', '10xx', 'aset', 'pending', 1],
  ['1080', 'Investasi Mudharabah', '10xx', 'aset', 'pending', 1],
  ['1090', 'Investasi Musyarakah', '10xx', 'aset', 'pending', 1],
  ['1100', 'Kas ZIS', '10xx', 'aset', 'open', 0],
  ['1110', 'Piutang Zakat', '10xx', 'aset', 'pending', 1],
  ['1120', 'Aset Wakaf', '10xx', 'aset', 'open', 0],
  ['2010', 'Hutang Pembelianan', '20xx', 'kewajiban', 'open', 0],
  ['2020', 'Hutang Ujrah Konsinyasi', '20xx', 'kewajiban', 'open', 0],
  ['2030', 'Utang Cashback Member', '20xx', 'kewajiban', 'open', 0],
  ['2040', 'Kewajiban Akad (Ujrah/Tijarah/Mudharabah)', '20xx', 'kewajiban', 'pending', 1],
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
  ['4050', 'Pendapatan Ijarah', '40xx', 'pendapatan', 'pending', 1],
  ['4060', 'Laba Murabahah', '40xx', 'pendapatan', 'pending', 1],
  ['4070', 'Bagi Hasil Mudharabah', '40xx', 'pendapatan', 'pending', 1],
  ['4080', 'Bagi Hasil Musyarakah', '40xx', 'pendapatan', 'pending', 1],
  ['4090', 'ZIS Masuk', '40xx', 'pendapatan', 'open', 0],
  ['4100', 'Wakaf Masuk', '40xx', 'pendapatan', 'open', 0],
  ['5010', 'HPP (Beban Persediaan)', '50xx', 'beban', 'open', 0],
  ['5020', 'Retur COGS (reversal)', '50xx', 'beban', 'open', 0],
  ['5030', 'Beban Operasional', '50xx', 'beban', 'open', 0],
  ['5040', 'Beban Penyusutan Aset Tetap', '50xx', 'beban', 'pending', 1],
  ['5050', 'Denda/Keterlambatan (clearing)', '50xx', 'beban', 'closed', 0],
  ['5060', 'Bagi Hasil Partner Mudharabah', '50xx', 'beban', 'pending', 1],
  ['5070', 'Beban Ijarah', '50xx', 'beban', 'pending', 1],
  ['5080', 'Distribusi SHU', '50xx', 'beban', 'pending', 1],
  ['5090', 'Zakat Keluar', '50xx', 'beban', 'open', 0],
  ['5100', 'Infak/Sedekah Keluar', '50xx', 'beban', 'open', 0],
  ['6010', 'Dana Pesantren (memo)', '60xx', 'syariah', 'pending', 1],
  ['6020', 'Aset Wakaf (memo)', '60xx', 'syariah', 'open', 0],
  ['6030', 'Zakat Tijarah Dibayar', '60xx', 'syariah', 'pending', 1],
];
// Seed COA v23 = v22 + 9 flip W3.1 (open/0). Diturunkan (bukan
// disalin) agar konsisten persis dengan coaSeed src/db.ts.
const FLIP9 = new Set(['1070', '1080', '1090', '2040', '4050', '4060', '4070', '4080', '5060']);
const COA_V23: CoaRow[] = COA_V22.map((r) => (FLIP9.has(r[0]) ? ([r[0], r[1], r[2], r[3], 'open', 0] as CoaRow) : r));
const INSERT_COA =
  'INSERT INTO coa (code, name, "group", kind, status, needs_decision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING';
const FLIP9_SQL =
  "UPDATE coa SET status = 'open', needs_decision = 0 WHERE code IN ('1070', '1080', '1090', '2040', '4050', '4060', '4070', '4080', '5060')";

async function main(): Promise<void> {
  let mod: typeof import('node:sqlite');
  try {
    mod = await import('node:sqlite');
  } catch (e) {
    console.error('  SKIP - node:sqlite tak tersedia: ' + String(e));
    console.log('HAS_FAILURE');
    process.exit(1);
  }
  const cnt = (q: string, d?: import('node:sqlite').DatabaseSync): number =>
    Number((d?.prepare(q).get() as { c: number } | undefined)?.c ?? 0);
  const cols = (d: import('node:sqlite').DatabaseSync, t: string): string =>
    (d.prepare('PRAGMA table_info(' + t + ')').all() as Array<{ name: string }>).map((r) => r.name).join(',');

  // ===== M1: fresh install skema v23 (seed v23 + CREATE tabel/index) =====
  {
    const db1 = new mod.DatabaseSync(':memory:');
    db1.exec(DDL_COA);
    const insCoa = db1.prepare(INSERT_COA);
    for (const r of COA_V23) insCoa.run(r[0], r[1], r[2], r[3], r[4], r[5]);
    db1.exec(FLIP9_SQL); // upgrade path; fresh = no-op (seed sudah open)
    db1.exec(DDL_AKAD);
    db1.exec(DDL_AKAD_EV);
    for (const s of DDL_IDX) db1.exec(s);
    // Per kolom Sek.6.1 (DeepSeek NOTE 1):
    eq('M1: kolom akad (Sek.6.1)', cols(db1, 'akad'), 'id,type,counterparty,amount,terms_json,status,opened_at,settled_at,note');
    eq('M1: kolom akad_events (Sek.6.1)', cols(db1, 'akad_events'), 'id,akad_id,kind,amount,event_date,posted_entry,created_by,created_at');
    ok(
      'M1: idx_akad_opened ada',
      (db1.prepare('PRAGMA index_list(akad)').all() as Array<{ name: string }>).some((x) => x.name === 'idx_akad_opened')
    );
    ok(
      'M1: idx_akad_events ada',
      (db1.prepare('PRAGMA index_list(akad_events)').all() as Array<{ name: string }>).some((x) => x.name === 'idx_akad_events')
    );
    // UNIQUE(type, counterparty, opened_at, amount): duplikat ditolak.
    db1.exec("INSERT INTO akad(id, type, counterparty, amount, opened_at) VALUES ('a1','murabahah','Budi',10000000,'2026-10-02')");
    let dupRejected = false;
    try {
      db1.exec("INSERT INTO akad(id, type, counterparty, amount, opened_at) VALUES ('a2','murabahah','Budi',10000000,'2026-10-02')");
    } catch {
      dupRejected = true;
    }
    ok('M1: UNIQUE(type,counterparty,opened_at,amount) menolak duplikat', dupRejected);
    db1.exec("INSERT INTO akad(id, type, counterparty, amount, opened_at) VALUES ('a3','murabahah','Budi',10000000,'2026-10-03')");
    eq('M1: akad = 2 baris (duplikat tertolak, tanggal beda boleh)', cnt('SELECT COUNT(*) c FROM akad', db1), 2);
    // 9 flip + kontrol.
    eq('M1: coa COUNT = 52', cnt('SELECT COUNT(*) c FROM coa', db1), 52);
    eq("M1: coa open = 37 (28 v22 + 9 flip)", cnt("SELECT COUNT(*) c FROM coa WHERE status='open'", db1), 37);
    eq("M1: coa pending = 14 (23 - 9 flip)", cnt("SELECT COUNT(*) c FROM coa WHERE status='pending'", db1), 14);
    eq("M1: coa closed = 1", cnt("SELECT COUNT(*) c FROM coa WHERE status='closed'", db1), 1);
    eq('M1: coa needs_decision=1 = 14', cnt('SELECT COUNT(*) c FROM coa WHERE needs_decision=1', db1), 14);
    for (const code of FLIP9) {
      const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok(`M1: coa ${code} flip open/0`, r.s === 'open' && r.n === 0, `status=${r.s} nd=${r.n}`);
    }
    const ctrl = (code: string, status: string, nd: number | null): void => {
      const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok(`M1: coa ${code} tetap ${status}${nd == null ? '' : '/nd=' + nd} (di luar flip)`, r.s === status && (nd == null || r.n === nd));
    };
    ctrl('6030', 'pending', 1); // jembatan zakat P3 (W5.1)
    ctrl('5050', 'closed', 0);
    ctrl('1060', 'pending', 1);
    ctrl('2080', 'pending', 1);
    ctrl('2090', 'open', 0); // flip v22
    ctrl('4040', 'open', 0); // flip v22
    // Stamp v23.
    db1.exec(STAMP_DDL);
    db1.exec('INSERT INTO schema_version(id, version) VALUES (1, 23) ON CONFLICT(id) DO UPDATE SET version = excluded.version');
    eq('M1: schema_version stamp 23', Number((db1.prepare('SELECT version v FROM schema_version').get() as { v: number }).v), 23);
    db1.close();
  }

  // ===== M2: upgrade v22 -> v23 (coa v22 ada; seed DO NOTHING + flip) =====
  {
    const db2 = new mod.DatabaseSync(':memory:');
    db2.exec(DDL_COA);
    const ins2 = db2.prepare(INSERT_COA);
    for (const r of COA_V22) ins2.run(r[0], r[1], r[2], r[3], r[4], r[5]);
    eq('M2: state v22 -> coa COUNT 52', cnt('SELECT COUNT(*) c FROM coa', db2), 52);
    const pre = db2.prepare("SELECT status s, needs_decision n FROM coa WHERE code='1070'").get() as { s: string; n: number };
    ok('M2: pre-flip 1070 masih pending/1 (state v22)', pre.s === 'pending' && pre.n === 1);
    // Seed v23 dijalankan ulang: baris v22 ada -> DO NOTHING.
    const ins23 = db2.prepare(INSERT_COA);
    for (const r of COA_V23) ins23.run(r[0], r[1], r[2], r[3], r[4], r[5]);
    eq('M2: seed v23 (DO NOTHING) -> COUNT tetap 52', cnt('SELECT COUNT(*) c FROM coa', db2), 52);
    const pre2 = db2.prepare("SELECT status s FROM coa WHERE code='1070'").get() as { s: string };
    ok('M2: pre-flip 1070 TIDAK ter-impa seed v23 (do-nothing)', pre2.s === 'pending');
    // Flip UPDATE (path upgrade; mutlak karena seed DO NOTHING).
    db2.exec(FLIP9_SQL);
    for (const code of FLIP9) {
      const r = db2.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok(`M2: coa ${code} upgrade -> open/0`, r.s === 'open' && r.n === 0, `status=${r.s} nd=${r.n}`);
    }
    eq("M2: coa open = 37 (setelah flip)", cnt("SELECT COUNT(*) c FROM coa WHERE status='open'", db2), 37);
    eq("M2: coa pending = 14 (setelah flip)", cnt("SELECT COUNT(*) c FROM coa WHERE status='pending'", db2), 14);
    const ctrl2 = (code: string, status: string): void => {
      const r = db2.prepare('SELECT status s FROM coa WHERE code=?').get(code) as { s: string };
      ok(`M2: coa ${code} tetap ${status} (di luar flip)`, r.s === status, `status=${r.s}`);
    };
    ctrl2('6030', 'pending');
    ctrl2('5050', 'closed');
    ctrl2('1060', 'pending');
    ctrl2('2080', 'pending');
    ctrl2('2090', 'open'); // flip v22 tetap valid
    // DDL IF NOT EXISTS idempoten (jalankan 2x, aman di DB yang sudah ada).
    db2.exec(DDL_AKAD);
    db2.exec(DDL_AKAD);
    db2.exec(DDL_AKAD_EV);
    db2.exec(DDL_AKAD_EV);
    eq('M2: DDL IF NOT EXISTS idempoten (kolom akad tak berubah)', cols(db2, 'akad'), 'id,type,counterparty,amount,terms_json,status,opened_at,settled_at,note');
    db2.exec("INSERT INTO akad_events(id, akad_id, kind, amount, event_date, created_at) VALUES ('e1','a1','opening',10000000,'2026-10-02','2026-10-02T08:00:00.000Z')");
    eq('M2: akad_events insert ok', cnt('SELECT COUNT(*) c FROM akad_events', db2), 1);
    // Stamp 22 -> 23.
    db2.exec(STAMP_DDL);
    db2.exec('INSERT INTO schema_version(id, version) VALUES (1, 22) ON CONFLICT(id) DO NOTHING');
    eq('M2: stamp pre-upgrade = 22', Number((db2.prepare('SELECT version v FROM schema_version').get() as { v: number }).v), 22);
    db2.exec('INSERT INTO schema_version(id, version) VALUES (1, 23) ON CONFLICT(id) DO UPDATE SET version = excluded.version');
    eq('M2: stamp post-upgrade = 23', Number((db2.prepare('SELECT version v FROM schema_version').get() as { v: number }).v), 23);
    db2.close();
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
