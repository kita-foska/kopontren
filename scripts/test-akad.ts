/**
 * W3.1 (skema v23) + W3.2 (lib/akad.ts) -- test modul akad:
 *  M1-M2: DDL akad + akad_events (Sek.6.1) + index + flip 9 COA
 *         'pending' -> 'open' + schema_version stamp.
 *  A1-A7: lib/akad.ts -- mapping jurnal Sek.6.4 (per tipe/kind) +
 *         validasi terms Sek.6.5 + pencatatan pola recordZisInTx +
 *         F1 ref_id per-event (bukti tabrakan pola docs ':evt#kind').
 *         A1 murabahah golden; A2 mudharabah 4 sisi; A3 musyarakah;
 *         A4 ijarah; A5 throw (wakalah/denda/kind di luar matrix);
 *         A6 idempoten + F1; A7 edge (amount/term/gl-off/rounding).
 *  A8 (W3.3): API-layer, UI-less -- pracheck 400/409 + bukti rollback
 *         atomik (event hilang saat post gagal) + pesan UNIQUE (NOTE 3)
 *         + soft status (OQ 1: active<->settled, tanpa DELETE).
 * Node langsung (type-stripping, Node >= 23.6/v24): npm run test:akad.
 * In-memory node:sqlite, DDL mirror src/db.ts (v23 + journal W1.1).
 * Cakupan M1/M2: kolom akad/akad_events persis Sek.6.1 (PRAGMA
 * table_info, per kolom); UNIQUE(type, counterparty, opened_at,
 * amount); idx_akad_opened + idx_akad_events; coa open=38/pending=13/
 * closed=1, nd=13, COUNT=52; 9 flip open + 6030 flip open (W5.3b);
 * kontrol 5050/1060/2080 & flip v22 tak berubah; stamp 22->23.
 */

import {
  AKAD_STATUS,
  AKAD_UNIQUE_ERROR,
  akadJournalFor,
  akadKindAllowed,
  akadLines,
  akadValidateTerms,
  recordAkadEventInTx,
} from '../src/lib/akad.ts';
import type { AkadEventRec } from '../src/lib/akad.ts';
import { isBalanced, journalForConsignmentSettlement, postJournalInTx } from '../src/lib/jurnal.ts';
import type { JLine, JSpec, TxDb } from '../src/lib/jurnal.ts';


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

// DDL journal mirror src/db.ts (skema v17 -- jurnal W1.1; tanpa index).
// Dipakai A-suite utk postJournalInTx (lib/jurnal.ts) + bukti F1.
const DDL_JE =
  "CREATE TABLE journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))";
const DDL_JL =
  "CREATE TABLE journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))";

/** Adapter node:sqlite -> TxDb (permukaan async jurnal.ts; mirror test-zis). */
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

/** Helper: jumlah baris hasil query COUNT(*) c pada DB in-memory. */
function cnt0(db: import('node:sqlite').DatabaseSync, sql: string): number {
  return Number((db.prepare(sql).get() as { c: number }).c);
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

// Seed COA v22 (mirror COA_V22 test-zis.ts: 52 akun; 29 open /
// 22 pending / 1 closed; flip W2.7 2090/5090/4040 + W5.3b 6030
// sudah 'open').
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
  ['6030', 'Zakat Tijarah Dibayar', '60xx', 'syariah', 'open', 0], // W5.3b (v26): flip open (OQ-13)
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
    eq("M1: coa open = 38 (29 v22 + 9 flip)", cnt("SELECT COUNT(*) c FROM coa WHERE status='open'", db1), 38);
    eq("M1: coa pending = 13 (22 - 9 flip)", cnt("SELECT COUNT(*) c FROM coa WHERE status='pending'", db1), 13);
    eq("M1: coa closed = 1", cnt("SELECT COUNT(*) c FROM coa WHERE status='closed'", db1), 1);
    eq('M1: coa needs_decision=1 = 13', cnt('SELECT COUNT(*) c FROM coa WHERE needs_decision=1', db1), 13);
    for (const code of FLIP9) {
      const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok(`M1: coa ${code} flip open/0`, r.s === 'open' && r.n === 0, `status=${r.s} nd=${r.n}`);
    }
    const ctrl = (code: string, status: string, nd: number | null): void => {
      const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
      ok(`M1: coa ${code} tetap ${status}${nd == null ? '' : '/nd=' + nd} (di luar flip)`, r.s === status && (nd == null || r.n === nd));
    };
    ctrl('6030', 'open', 0); // flip W5.3b (OQ-13)
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
    eq("M2: coa open = 38 (setelah flip)", cnt("SELECT COUNT(*) c FROM coa WHERE status='open'", db2), 38);
    eq("M2: coa pending = 13 (setelah flip)", cnt("SELECT COUNT(*) c FROM coa WHERE status='pending'", db2), 13);
    const ctrl2 = (code: string, status: string): void => {
      const r = db2.prepare('SELECT status s FROM coa WHERE code=?').get(code) as { s: string };
      ok(`M2: coa ${code} tetap ${status} (di luar flip)`, r.s === status, `status=${r.s}`);
    };
    ctrl2('6030', 'open'); // flip W5.3b
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

  // ===== A-suite (W3.2): lib/akad.ts -- DB in-memory ke-3 (akad + jurnal) =====
  const db3 = new mod.DatabaseSync(':memory:');
  db3.exec(DDL_AKAD);
  db3.exec(DDL_AKAD_EV);
  db3.exec(DDL_JE);
  db3.exec(DDL_JL);
  const tdb = toTxDb(db3);
  const EV_D = '2026-10-03T09:00:00+07:00';
  const seedAkad = (id: string, type: string, cp: string, amount: number, terms: string): void => {
    db3.prepare('INSERT INTO akad(id, type, counterparty, amount, terms_json, opened_at) VALUES (?,?,?,?,?,?)')
      .run(id, type, cp, amount, terms, '2026-10-02T00:00:00+07:00');
  };
  seedAkad('aM', 'murabahah', 'Nasabah M', 8000000, '{"margin":10}');
  seedAkad('aP', 'mudharabah', 'Partner P', 50000000, '{"nisbah":40}');
  seedAkad('aX', 'musyarakah', 'Partner X', 40000000, '{"nisbah":50}');
  seedAkad('aI', 'ijarah', 'Nasabah I', 1000000, '{"rate":500000}');
  seedAkad('aW', 'wakalah', 'Pemilik W', 1000000, '{"rate":20}'); // W3.4
  // Post event (gl-on; terms_json diberikan) -> id entry (throw bila null).
  const postEvt = async (
    id: string,
    akadId: string,
    type: string,
    kind: string,
    amount: number,
    termsJson: string
  ): Promise<string> => {
    const rec: AkadEventRec = {
      id,
      akadId,
      type,
      kind,
      amount,
      event_date: EV_D,
      gl_enabled: true,
      terms_json: termsJson,
    };
    const r = await recordAkadEventInTx(tdb, rec);
    if (r.entryId == null) throw new Error('A: entryId null utk event ' + id);
    return r.entryId;
  };
  const val = (lines: JLine[], code: string, what: 'debit' | 'credit'): number =>
    (lines.find((l) => l.account_code === code) ?? { debit: 0, credit: 0 })[what];
  const throwsWith = (fn: () => unknown, frag: string, label: string): void => {
    try {
      fn();
      ok(label + ' -> throw', false, 'tak throw');
    } catch (e) {
      ok(label + ' -> throw', String(e).includes(frag), String(e));
    }
  };

  // ===== A1: murabahah golden (pencairan -> angsuran -> settlement) =====
  {
    const L = akadLines('murabahah', 'pencairan', 3000000, { margin: 10 });
    eq('A1: pencairan = 2 baris', L.length, 2);
    eq('A1: D 1010', L[0].account_code, '1010');
    eq('A1: D 1010 = 3jt', L[0].debit, 3000000);
    eq('A1: C 2040 = 3jt', val(L, '2040', 'credit'), 3000000);
    ok('A1: isBalanced pencairan', isBalanced(L));
    const L2 = akadLines('murabahah', 'angsuran', 2000000, { margin: 10 });
    eq('A1: angsuran C 2040 = 2jt', val(L2, '2040', 'credit'), 2000000);
    ok('A1: isBalanced angsuran', isBalanced(L2));
    const L3 = akadLines('murabahah', 'settlement', 5000000, { margin: 10 });
    eq('A1: settlement D 2040 = 5jt', val(L3, '2040', 'debit'), 5000000);
    eq('A1: settlement C 4060', L3[1].account_code, '4060');
    ok('A1: isBalanced settlement', isBalanced(L3));
    const LL = akadLines('murabahah', 'pencairan', 3000000, { margin: 10 }, { lunas: true });
    eq('A1: lunas saat pencairan -> C 4060', val(LL, '4060', 'credit'), 3000000);
    // DB (gl-on; posted_entry ter-update):
    const e1 = await postEvt('eM1', 'aM', 'murabahah', 'pencairan', 3000000, '{"margin":10}');
    eq('A1: DB D 1010', lineVal(db3, e1, '1010', 'debit'), 3000000);
    eq('A1: DB C 2040', lineVal(db3, e1, '2040', 'credit'), 3000000);
    const pe1 = db3.prepare('SELECT posted_entry p FROM akad_events WHERE id=?').get('eM1') as { p: string | null };
    ok('A1: posted_entry ter-update', pe1.p === e1, String(pe1.p));
  }

  // ===== A2: mudharabah (pencairan + bagi hasil 4 sisi + settlement) =====
  let e2 = ''; // (hoisted: dipakai A6 utk perbandingan F1)
  {
    const Lp = akadLines('mudharabah', 'pencairan', 50000000, { nisbah: 40 });
    eq('A2: pencairan D 1010', Lp[0].account_code, '1010');
    eq('A2: pencairan C 1080', Lp[1].account_code, '1080');
    ok('A2: isBalanced pencairan', isBalanced(Lp));
    const Lb = akadLines('mudharabah', 'bagi_hasil', 10000000, { nisbah: 40 });
    eq('A2: bagi hasil = 1 entry 4 sisi', Lb.length, 4);
    eq('A2: D 1080 (Pc) = 6jt', val(Lb, '1080', 'debit'), 6000000);
    eq('A2: D 5060 (Pp) = 4jt', val(Lb, '5060', 'debit'), 4000000);
    eq('A2: C 4070 (Pc) = 6jt', val(Lb, '4070', 'credit'), 6000000);
    eq('A2: C 1010 (Pp) = 4jt', val(Lb, '1010', 'credit'), 4000000);
    ok('A2: isBalanced 4 sisi', isBalanced(Lb));
    const Lh = akadLines('mudharabah', 'bagi_hasil', 10000000, { nisbah: 40 }, { heldPp: true });
    eq('A2: Pp ditahan -> C 2040', val(Lh, '2040', 'credit'), 4000000);
    eq('A2: Pp ditahan tak C 1010', val(Lh, '1010', 'credit'), 0);
    const Ls = akadLines('mudharabah', 'settlement', 50000000, { nisbah: 40 });
    eq('A2: settlement D 1080', Ls[0].account_code, '1080');
    eq('A2: settlement C 1010', Ls[1].account_code, '1010');
    ok('A2: isBalanced settlement', isBalanced(Ls));
    // DB: bagi hasil = 1 entry 4 baris; ref_id F1 per event.
    e2 = await postEvt('eP1', 'aP', 'mudharabah', 'bagi_hasil', 10000000, '{"nisbah":40}');
    eq('A2: DB 1 entry 4 baris', Number((db3.prepare('SELECT COUNT(*) c FROM journal_lines WHERE entry_id=?').get(e2) as { c: number }).c), 4);
    eq('A2: ref_id F1', String((db3.prepare('SELECT ref_id r FROM journal_entries WHERE id=?').get(e2) as { r: string }).r), 'akad#aP:evt#eP1');
  }

  // ===== A3: musyarakah (mirror A2 dgn 1090/4080) =====
  {
    const Lb = akadLines('musyarakah', 'bagi_hasil', 20000000, { nisbah: 50 });
    eq('A3: bagi hasil = 1 entry 4 sisi', Lb.length, 4);
    eq('A3: D 1090 (Pc) = 10jt', val(Lb, '1090', 'debit'), 10000000);
    eq('A3: D 5060 (Pp) = 10jt', val(Lb, '5060', 'debit'), 10000000);
    eq('A3: C 4080 (Pc) = 10jt', val(Lb, '4080', 'credit'), 10000000);
    eq('A3: C 1010 (Pp) = 10jt', val(Lb, '1010', 'credit'), 10000000);
    ok('A3: isBalanced 4 sisi', isBalanced(Lb));
    const Lp = akadLines('musyarakah', 'pencairan', 40000000, { nisbah: 50 });
    eq('A3: pencairan D 1010 / C 1090', Lp[1].account_code, '1090');
    ok('A3: isBalanced pencairan', isBalanced(Lp));
    const Ls = akadLines('musyarakah', 'settlement', 40000000, { nisbah: 50 });
    eq('A3: settlement D 1090 / C 1010', Ls[0].account_code + '/' + Ls[1].account_code, '1090/1010');
    ok('A3: isBalanced settlement', isBalanced(Ls));
    const e3 = await postEvt('eX1', 'aX', 'musyarakah', 'bagi_hasil', 20000000, '{"nisbah":50}');
    eq('A3: DB 1 entry 4 baris', Number((db3.prepare('SELECT COUNT(*) c FROM journal_lines WHERE entry_id=?').get(e3) as { c: number }).c), 4);
  }

  // ===== A4: ijarah (pencairan imbalan awal + ijarah periodik) =====
  {
    const L1 = akadLines('ijarah', 'pencairan', 1000000, { rate: 500000 });
    eq('A4: pencairan D 1010', L1[0].account_code, '1010');
    eq('A4: pencairan C 4050', val(L1, '4050', 'credit'), 1000000);
    ok('A4: isBalanced pencairan', isBalanced(L1));
    const L2 = akadLines('ijarah', 'ijarah_periodik', 500000, { rate: 500000 });
    eq('A4: periodik D 1010 = rate', L2[0].debit, 500000);
    eq('A4: periodik C 4050', val(L2, '4050', 'credit'), 500000);
    ok('A4: isBalanced periodik', isBalanced(L2));
    const e4 = await postEvt('eI1', 'aI', 'ijarah', 'ijarah_periodik', 500000, '{"rate":500000}');
    eq('A4: DB D 1010', lineVal(db3, e4, '1010', 'debit'), 500000);
    eq('A4: DB C 4050', lineVal(db3, e4, '4050', 'credit'), 500000);
  }

  // ===== A5: throw (wakalah bridge W3.4; denda tak diangkat; matrix) =====
  throwsWith(() => akadLines('wakalah', 'pencairan', 1000000), 'tak mendukung', 'A5: wakalah pencairan (kind invalid)');
  for (const t of ['murabahah', 'mudharabah', 'musyarakah', 'ijarah']) {
    throwsWith(() => akadLines(t, 'denda', 10000), 'TIDAK DIANGKAT', 'A5: denda ' + t);
  }
  throwsWith(() => akadLines('murabahah', 'bagi_hasil', 1000000), 'tak mendukung', 'A5: bagi_hasil pad murabahah');
  throwsWith(() => akadLines('ijarah', 'angsuran', 1000000), 'tak mendukung', 'A5: angsuran pad ijarah');
  throwsWith(() => akadLines('ijarah', 'settlement', 1000000), 'belum ada mapping', 'A5: settlement ijarah (OQ-A3)');
  throwsWith(() => akadLines('consignment', 'pencairan', 1000000), 'tidak dikenal', 'A5: type tak dikenal');
  // gl-on + denda: event tercatat, TIDAK dipost (F3.3 #6; D1 aman).
  {
    const rd = await recordAkadEventInTx(tdb, {
      id: 'eA5d',
      akadId: 'aM',
      type: 'murabahah',
      kind: 'denda',
      amount: 10000,
      event_date: EV_D,
      gl_enabled: true,
    });
    eq('A5: denda gl-on -> entryId null', rd.entryId, null);
    const pe5 = db3.prepare('SELECT posted_entry p FROM akad_events WHERE id=?').get('eA5d') as { p: string | null };
    ok('A5: event denda tercatat, posted_entry NULL', pe5.p === null, String(pe5.p));
    // W3.4: gl-on + wakalah settlement -> auto-posted (bridge, Sek.6.4).
    const rw = await recordAkadEventInTx(tdb, {
      id: 'eA5w',
      akadId: 'aW',
      type: 'wakalah',
      kind: 'settlement',
      amount: 1000000,
      event_date: EV_D,
      gl_enabled: true,
      terms_json: '{"rate":20}',
    });
    ok('A5: wakalah settlement gl-on -> entryId (W3.4 bridge)', typeof rw.entryId === 'string', String(rw.entryId));
  }

  // ===== A6: F1 ref_id per-event (bukti tabrakan) + idempoten =====
  {
    // 2 event same kind pada akad sama -> 2 entry berbeda (F1).
    const e6a = await postEvt('eP2', 'aP', 'mudharabah', 'bagi_hasil', 10000000, '{"nisbah":40}');
    ok('A6: event 2 = entry berbeda', e6a !== e2, e6a + ' vs ' + e2);
    eq(
      "A6: F1 -> COUNT entry 'akad#aP:evt#%' = 2",
      Number((db3.prepare("SELECT COUNT(*) c FROM journal_entries WHERE ref_table='akad' AND ref_id LIKE 'akad#aP:evt#%'").get() as { c: number }).c),
      2
    );
    // Bukti tabrakan pola docs ':evt#<kind>': 2 post ref_id sama ->
    // 1 entry (no-op ke-2), 4 baris (bukan 8).
    // NOTE: this proves the docs Sek.6.4 pattern ':evt#kind' would
    // collide for recurring events. F1 (per-event id) is REQUIRED,
    // not a preference. See W3.1 ruling.
    const mkDocsSpec = (id: string): JSpec => ({
      ...akadJournalFor(
        {
          id,
          akadId: 'aP',
          type: 'mudharabah',
          kind: 'bagi_hasil',
          amount: 10000000,
          event_date: EV_D,
          terms_json: '{"nisbah":40}',
        },
        { nisbah: 40 }
      ),
      ref_id: 'akad#aP:evt#bagi_hasil', // pola docs Sek.6.4 (per KIND)
      id: 'JE-docs-' + id,
    });
    const c1 = await postJournalInTx(tdb, mkDocsSpec('d1'));
    const c2 = await postJournalInTx(tdb, mkDocsSpec('d2'));
    eq('A6: pola docs -> 2 post = 1 entry (TABRAKAN)', c2, c1);
    eq(
      'A6: pola docs -> 1 entry 4 baris (bukan 8)',
      Number((db3.prepare('SELECT COUNT(*) c FROM journal_lines WHERE entry_id=?').get(c1) as { c: number }).c),
      4
    );
    // Idempoten F1: post ulang event eP2 -> no-op, entry tak bertambah.
    const specR: JSpec = akadJournalFor(
      {
        id: 'eP2',
        akadId: 'aP',
        type: 'mudharabah',
        kind: 'bagi_hasil',
        amount: 10000000,
        event_date: EV_D,
        terms_json: '{"nisbah":40}',
      },
      { nisbah: 40 }
    );
    eq('A6: post ulang = no-op (entry sama)', await postJournalInTx(tdb, specR), e6a);
  }

  // ===== A7: edge (amount; terms; gl-off; rounding NOTE 3) =====
  throwsWith(() => akadLines('murabahah', 'pencairan', 0), 'positif', 'A7: amount=0 ditolak');
  throwsWith(() => akadLines('murabahah', 'pencairan', -5), 'positif', 'A7: amount<0 ditolak');
  for (const [j, frag] of [
    ['{"nisbah":101}', 'integer 0-100'],
    ['{"nisbah":-1}', 'integer 0-100'],
    ['{"nisbah":33.5}', 'integer 0-100'],
    ['{"margin":-5}', '>= 0'],
    ['{"rate":-1}', '>= 0'],
    ['{"nisbah":40', 'JSON valid'],
    ['[1,2]', 'objek JSON'],
    ['null', 'objek JSON'],
  ] as [string, string][]) {
    throwsWith(() => akadValidateTerms(j), frag, 'A7: terms ' + j);
  }
  eq('A7: terms null -> {} (0 preset Sek.6.5)', JSON.stringify(akadValidateTerms(null)), '{}');
  eq('A7: terms {schedule:...} diabaikan', JSON.stringify(akadValidateTerms('{"schedule":"3 bulan"}')), '{}');
  eq(
    'A7: terms valid (nisbah+margin+rate)',
    JSON.stringify(akadValidateTerms('{"nisbah":40,"margin":10,"rate":500000}')),
    '{"nisbah":40,"margin":10,"rate":500000}'
  );
  // gl-off: event tercatat, TANPA jurnal (D1 zero behavior change).
  {
    const before = Number((db3.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c);
    const rg = await recordAkadEventInTx(tdb, {
      id: 'eA7g',
      akadId: 'aI',
      type: 'ijarah',
      kind: 'ijarah_periodik',
      amount: 500000,
      event_date: EV_D,
      gl_enabled: false,
    });
    eq('A7: gl-off -> entryId null', rg.entryId, null);
    eq(
      'A7: gl-off -> journal tak bertambah',
      Number((db3.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c),
      before
    );
    const pe7 = db3.prepare('SELECT posted_entry p FROM akad_events WHERE id=?').get('eA7g') as { p: string | null };
    ok('A7: gl-off event tercatat, posted_entry NULL', pe7.p === null, String(pe7.p));
    const ro = await recordAkadEventInTx(tdb, {
      id: 'eA7o',
      akadId: 'aI',
      type: 'ijarah',
      kind: 'ijarah_periodik',
      amount: 500000,
      event_date: EV_D,
      gl_enabled: true,
    });
    ok('A7: gl-on -> entryId terisi', typeof ro.entryId === 'string' && ro.entryId.length > 0, String(ro.entryId));
    eq('A7: gl-on baris D1010', lineVal(db3, ro.entryId as string, '1010', 'debit'), 500000);
    eq('A7: gl-on baris C4050', lineVal(db3, ro.entryId as string, '4050', 'credit'), 500000);
  }
  // Rounding NOTE 3: T=10.000.001, nisbah 33 -> Pp=3.300.000, Pc=6.700.001.
  {
    const L = akadLines('mudharabah', 'bagi_hasil', 10000001, { nisbah: 33 });
    eq('A7: Pp (D 5060) = 3.300.000', val(L, '5060', 'debit'), 3300000);
    eq('A7: Pc (D 1080) = 6.700.001', val(L, '1080', 'debit'), 6700001);
    eq(
      'A7: D total = K total (D=K persis)',
      L.reduce((s, l) => s + l.debit, 0),
      L.reduce((s, l) => s + l.credit, 0)
    );
    ok('A7: isBalanced rounding', isBalanced(L));
  }
  db3.close();

  // ===== A8 (W3.3): API-layer, UI-less -- pracheck 400/409 + bukti
  // rollback atomik + pesan UNIQUE (NOTE 3) + soft status (OQ 1) =====
  {
    // A8.1: rollback atomik -- gagal di post => INSERT akad_events
    // ikut TIDAK persist (event absent; NOTE 1 DeepSeek).
    const db4 = new mod.DatabaseSync(':memory:');
    db4.exec(DDL_AKAD);
    db4.exec(DDL_AKAD_EV);
    db4.exec(DDL_JE);
    db4.exec(DDL_JL);
    db4
      .prepare(
        "INSERT INTO akad(id, type, counterparty, amount, opened_at, status) VALUES ('aU8','murabahah','Nasabah U8',7000000,'2026-10-02T00:00:00+07:00','active')"
      )
      .run();
    const tdb4 = toTxDb(db4);
    const cnt4 = (sql: string): number =>
      Number((db4.prepare(sql).get() as { c: number }).c);
    // Pembukti rollback atomik: eksekusi di dalam tx manual (BEGIN -> ROLLBACK
    // saat gagal; auto-commit node:sqlite tak punya rollback). Gagal di baris
    // jurnal (PRIMARY KEY (entry_id, account_code, source)) => INSERT event +
    // entry jurnal TIDAK persist (NOTE 1 DeepSeek).
    db4.exec("INSERT INTO journal_lines(entry_id, account_code, debit, credit, source) VALUES ('JE-akadevt-eA8r','1010',0,0,'akad#murabahah:pencairan')");
    let threw4 = false;
    db4.exec('BEGIN');
    try {
      await recordAkadEventInTx(tdb4, {
        id: 'eA8r',
        akadId: 'aU8',
        type: 'murabahah',
        kind: 'pencairan',
        amount: 7000000,
        gl_enabled: true,
      });
      db4.exec('COMMIT');
    } catch {
      threw4 = true;
      db4.exec('ROLLBACK');
    }
    ok('A8.1: post gagal -> throw + ROLLBACK dari recordAkadEventInTx', threw4);
    eq('A8.1: INSERT event TIDAK persist (rollback)', cnt4('SELECT COUNT(*) c FROM akad_events'), 0);
    eq('A8.1: journal entry tak terpersist', cnt4("SELECT COUNT(*) c FROM journal_entries WHERE ref_table='akad'"), 0);
    // Kontrol: event lain (post berhasil, tanpa bentrok) -> persist setelah COMMIT.
    const ok4 = await recordAkadEventInTx(tdb4, {
      id: 'eA8c',
      akadId: 'aU8',
      type: 'murabahah',
      kind: 'pencairan',
      amount: 7000000,
      gl_enabled: true,
    });
    eq('A8.1: kontrol -- post berhasil -> entryId', typeof ok4.entryId, 'string');
    eq('A8.1: kontrol -- event persist', cnt4('SELECT COUNT(*) c FROM akad_events'), 1);
    db4.close();

    // A8.2: UNIQUE (409) -- pesan NOTE 3 W3.1 persis (single source).
    const db5 = new mod.DatabaseSync(':memory:');
    db5.exec(DDL_AKAD);
    db5
      .prepare(
        "INSERT INTO akad(id, type, counterparty, amount, opened_at, status) VALUES ('u1','murabahah','Budi',9000000,'2026-10-02T00:00:00+07:00','active')"
      )
      .run();
    let uniqMsg = '';
    try {
      db5
        .prepare(
          "INSERT INTO akad(id, type, counterparty, amount, opened_at, status) VALUES ('u2','murabahah','Budi',9000000,'2026-10-02T00:00:00+07:00','active')"
        )
        .run();
    } catch (e) {
      uniqMsg = e instanceof Error ? e.message : String(e);
    }
    ok('A8.2: UNIQUE ditolak', /UNIQUE/i.test(uniqMsg), uniqMsg);
    eq('A8.2: pesan NOTE 3 W3.1 (single source)', AKAD_UNIQUE_ERROR,
      'Akad dgn counterparty, tanggal, jumlah sama sudah ada -- periksa riwayat atau ubah salah satu parameter.');
    db5
      .prepare(
        "INSERT INTO akad(id, type, counterparty, amount, opened_at, status) VALUES ('u3','murabahah','Budi',9000000,'2026-10-03T00:00:00+07:00','active')"
      )
      .run(); // control: opened_at beda -> diterima
    eq('A8.2: u3 persist + u2 ditolak tak persist (total 2)', cnt0(db5, 'SELECT COUNT(*) c FROM akad'), 2);
    db5.close();

    // A8.3: pracheck 400 (NOTE 3 audit) -- gl_on + auto-post + kind tak
    // didukung type -> 400, BUKAN 500. Denda = tak dipost.
    eq('A8.3: ijarah+settlement TIDAK didukung', akadKindAllowed('ijarah', 'settlement'), false);
    eq('A8.3: murabahah+pencairan didukung', akadKindAllowed('murabahah', 'pencairan'), true);
    eq('A8.3: wakalah pencairan TIDAK didukung', akadKindAllowed('wakalah', 'pencairan'), false);
    eq('A8.3: wakalah settlement didukung (W3.4)', akadKindAllowed('wakalah', 'settlement'), true);
    eq('A8.3: type tak dikenal -> []', akadKindAllowed('consignment', 'pencairan'), false);
    eq('A8.3: AKAD_STATUS = active|settled (OQ 1)', JSON.stringify(AKAD_STATUS), '["active","settled"]');
  }

  // ===== A9: W3.4 wakalah bridge (settlement + ujrah + konsinyasi) =====
  {
    // A9.1: akadLines wakalah settlement (3 sisi; rate=20%)
    const Lw = akadLines('wakalah', 'settlement', 1000000, { rate: 20 });
    eq('A9.1: 3 baris', Lw.length, 3);
    eq('A9.1: D 1010 = bruto', val(Lw, '1010', 'debit'), 1000000);
    eq('A9.1: K 2020 = neto', val(Lw, '2020', 'credit'), 800000);
    eq('A9.1: K 4010 = uyrah', val(Lw, '4010', 'credit'), 200000);
    ok('A9.1: isBalanced', isBalanced(Lw));

    // A9.1b: rate=0 -> 2 baris (tanpa K4010)
    const Lw0 = akadLines('wakalah', 'settlement', 500000, { rate: 0 });
    eq('A9.1b: rate=0 -> 2 baris', Lw0.length, 2);
    eq('A9.1b: K 2020 = full', val(Lw0, '2020', 'credit'), 500000);
    eq('A9.1b: K 4010 absent', val(Lw0, '4010', 'credit'), 0);

    // A9.2: akadLines wakalah ujrah (2 sisi; helper, bukan production)
    const Lu = akadLines('wakalah', 'ujrah', 200000);
    eq('A9.2: D 1010', val(Lu, '1010', 'debit'), 200000);
    eq('A9.2: K 4040', val(Lu, '4040', 'credit'), 200000);
    ok('A9.2: isBalanced', isBalanced(Lu));

    // A9.3-9.5: DB (in-memory ke-6; akad + jurnal)
    const db6 = new mod.DatabaseSync(':memory:');
    db6.exec(DDL_AKAD);
    db6.exec(DDL_AKAD_EV);
    db6.exec(DDL_JE);
    db6.exec(DDL_JL);
    const tdb6 = toTxDb(db6);
    db6.prepare("INSERT INTO akad(id, type, counterparty, amount, terms_json, opened_at) VALUES ('aW','wakalah','Pemilik W',1000000,'{\"rate\":20}','2026-10-02T00:00:00+07:00')").run();

    // A9.3: recordAkadEventInTx wakalah settlement (gl-on -> posted)
    const eA9 = await recordAkadEventInTx(tdb6, {
      id: 'eA9w',
      akadId: 'aW',
      type: 'wakalah',
      kind: 'settlement',
      amount: 1000000,
      event_date: EV_D,
      gl_enabled: true,
      terms_json: '{"rate":20}',
    });
    ok('A9.3: entryId non-null', eA9.entryId != null, String(eA9.entryId));
    eq('A9.3: DB K 2020', lineVal(db6, eA9.entryId!, '2020', 'credit'), 800000);
    eq('A9.3: DB K 4010', lineVal(db6, eA9.entryId!, '4010', 'credit'), 200000);

    // A9.4: journalForConsignmentSettlement (pure builder; OQ-4 ref_id)
    const spec = journalForConsignmentSettlement({ consId: 99, cumPaid: 800000, amount: 800000, owner: 'W' });
    ok('A9.4: isBalanced', isBalanced(spec.lines));
    eq('A9.4: D 2020', val(spec.lines, '2020', 'debit'), 800000);
    eq('A9.4: K 1010', val(spec.lines, '1010', 'credit'), 800000);
    eq('A9.4: ref_table', spec.ref_table, 'konsinyasi');
    eq('A9.4: ref_id', spec.ref_id, 'kons:99:pay:800000');
    eq('A9.4: type', spec.type, 'consignment_settlement');

    // A9.5: Bridge reconciliation (K2020 from akad = D2020 from konsinyasi)
    await postJournalInTx(tdb6, spec);
    const bal2020 = Number(
      (db6.prepare(
        "SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) bal FROM journal_lines WHERE account_code='2020'"
      ).get() as { bal: number }).bal
    );
    eq('A9.5: acct 2020 reconciles to 0 (OQ-7)', bal2020, 0);
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
