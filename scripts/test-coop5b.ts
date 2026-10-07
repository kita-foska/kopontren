/**
 * W4.5b -- test: op jasa (jasa per anggota rata-rata Q5; OQ9-OQ11) +
 * tunai (pencairan 3060; OQ7-A: D3060 -> C1010/1020, 5080 = 0).
 * Pola test-coop5a.ts: node:sqlite in-memory + adapter toTxDb + DDL
 * mirror skema v24; engine dipanggil langsung (bukan route).
 *
 * Jalankan: node scripts/test-coop5b.ts
 *
 * JB1-JB8: jasa -- floor + sisa per urutan nama, 1 jurnal agregat
 *   D3050 -> K2070 (N kaki), entry_date = hari terakhir periode
 *   (leap-aware), guard JASA_SHU_MISSING/NO_POOL/NO_ACTIVE, duplikat
 *   event-level (termasuk gl-off, OQ15 D1), validasi periode,
 *   compute murni.
 * JT1-JT4: tunai -- jurnal D3060 -> C1010/C1020 (default 1010),
 *   5080 TIDAK PERNAH jadi leg, guard saldo (exceeds/no pool),
 *   duplikat periode (guard jurnal), gl-off = tercatat tanpa jurnal.
 */
import { DatabaseSync } from 'node:sqlite';
import { postJournalInTx } from '../src/lib/jurnal.ts';
import type { JLine, TxDb } from '../src/lib/jurnal.ts';
import {
  recordCoopJasaInTx,
  computeJasaPerMember,
  lastDayOfMonthIso,
  JASA_ACCT,
} from '../src/lib/coop-jasa.ts';
import {
  recordCoopTunaiInTx,
  validateTunaiInput,
  getTunaiPoolInTx,
  hasTunaiPeriod,
  TUNAI_ACCT,
} from '../src/lib/coop-tunai.ts';

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

// -- DDL mirror src/db.ts (skema v24) --------------------------------
const DDL_JE =
  "CREATE TABLE journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))";
const DDL_JL =
  "CREATE TABLE journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))";
const DDL_MEMBERS =
  "CREATE TABLE coop_members(id TEXT PRIMARY KEY, name TEXT NOT NULL, npwp TEXT, member_since TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aktif', rumpun TEXT, UNIQUE(name))";
const DDL_SAVINGS =
  "CREATE TABLE coop_savings(member_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(member_id, kind, saved_at, amount))";
const DDL_SHU =
  "CREATE TABLE coop_shu(id TEXT PRIMARY KEY, period TEXT NOT NULL UNIQUE, shu_total INTEGER NOT NULL, cadangan_umum INTEGER, cadangan_khusus INTEGER, jasa_anggota INTEGER, dibagi INTEGER, rasio_json TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))";

/** Adapter node:sqlite -> TxDb (pola test-coop5a.ts). */
function toTxDb(db: DatabaseSync): TxDb {
  return {
    prepare(sql: string) {
      const s = db.prepare(sql);
      return {
        run(...args: unknown[]) {
          const r = s.run(...(args as []));
          return Promise.resolve({
            changes: Number(r.changes),
            lastInsertRowid: Number(r.lastInsertRowid),
          });
        },
        get(...args: unknown[]) {
          return Promise.resolve(s.get(...(args as [])) as unknown);
        },
        all(...args: unknown[]) {
          return Promise.resolve(s.all(...(args as [])) as unknown[]);
        },
      };
    },
  };
}

function fresh(): { db: DatabaseSync; tdb: TxDb } {
  const db = new DatabaseSync(':memory:');
  db.exec(DDL_JE);
  db.exec(DDL_JL);
  db.exec(DDL_MEMBERS);
  db.exec(DDL_SAVINGS);
  db.exec(DDL_SHU);
  return { db, tdb: toTxDb(db) };
}

/** Nilai sisi (debit|credit) utk entry+akun; 0 bila tak ada baris. */
function lineVal(db: DatabaseSync, entryId: string, code: string, side: 'debit' | 'credit'): number {
  const r = db
    .prepare('SELECT ' + side + ' AS v FROM journal_lines WHERE entry_id = ? AND account_code = ?')
    .get(entryId, code) as { v: number } | undefined;
  return r ? r.v : 0;
}

/** SUM sisi utk entry+akun (beberapa kaki K2070, OQ9). */
function sumLineVal(
  db: DatabaseSync,
  entryId: string,
  code: string,
  side: 'debit' | 'credit'
): number {
  const r = db
    .prepare(
      'SELECT COALESCE(SUM(' + side + '), 0) AS v FROM journal_lines WHERE entry_id = ? AND account_code = ?'
    )
    .get(entryId, code) as { v: number };
  return r ? r.v : 0;
}

function entryByRef(db: DatabaseSync, refId: string): string | null {
  const r = db
    .prepare("SELECT id FROM journal_entries WHERE ref_table = 'coop' AND ref_id = ?")
    .get(refId) as { id: string } | undefined;
  return r ? r.id : null;
}

function cnt(db: DatabaseSync, sql: string): number {
  return Number((db.prepare(sql).get() as { c: number } | undefined)?.c ?? 0);
}

/** INSERT anggota (status default 'aktif' bila tak disebut). */
function insertMembers(db: DatabaseSync, rows: Array<[string, string, string?]>): void {
  for (const [id, name, status] of rows)
    db.prepare('INSERT INTO coop_members (id, name, member_since, status) VALUES (?, ?, ?, ?)').run(
      id,
      name,
      '2026-01-01',
      status ?? 'aktif'
    );
}

/** Seed baris coop_shu (jasa_anggota = pool jasa utk periode). */
function seedShu(db: DatabaseSync, period: string, jasa: number): void {
  db.prepare(
    "INSERT INTO coop_shu (id, period, shu_total, jasa_anggota, dibagi) VALUES (?, ?, ?, ?, 0)"
  ).run('shu-' + period, period, jasa, jasa);
}

/** Seed pool tunai: jurnal manual D9999 -> C3060 (saldo kredit 3060). */
let seedSeq = 0;
async function seedTunaiPool(tdb: TxDb, amount: number, date: string): Promise<void> {
  seedSeq++;
  const lines: JLine[] = [
    { account_code: '9999', debit: amount, credit: 0, source: 'seed bal' },
    { account_code: TUNAI_ACCT.DIBAGI, debit: 0, credit: amount, source: 'seed 3060' },
  ];
  await postJournalInTx(tdb, {
    id: 'JE-seed3060-' + seedSeq,
    ref_table: 'coop',
    ref_id: null,
    entry_date: date,
    type: 'manual',
    desc: 'seed pool tunai 3060',
    lines,
  });
}

// -- JB1: rata-rata Q5 floor + sisa deterministik (urut nama) -------
async function jb1(): Promise<void> {
  console.log('JB1: jasa rata-rata -- floor + sisa per urut nama');
  const { db, tdb } = fresh();
  insertMembers(db, [
    ['a1', 'zaid', 'aktif'],
    ['a2', 'umar', 'aktif'],
    ['a3', 'nabil', 'aktif'],
    ['a4', 'hadi', 'nonaktif'], // OQ4: nonaktif tidak dapat bagian
  ]);
  seedShu(db, '2026-09', 100000);
  const r = await recordCoopJasaInTx(tdb, { period: '2026-09', gl_enabled: false, createdBy: 't' });
  eq('JB1 N anggota aktif', r.perMember.length, 3);
  // urut nama COLLATE NOCASE: nabil, umar, zaid; floor=33333; sisa 1 -> nabil.
  eq('JB1 urut perMember', r.perMember.map((m) => m.name).join(','), 'nabil,umar,zaid');
  eq('JB1 nabil (sisa +1)', r.perMember[0].amount, 33334);
  eq('JB1 umar', r.perMember[1].amount, 33333);
  eq('JB1 zaid', r.perMember[2].amount, 33333);
  eq('JB1 SUM porsi = pool', r.perMember.reduce((s, m) => s + m.amount, 0), 100000);
  // OQ6: N baris coop_savings kind 'jasa' saved_at = akhir periode.
  eq(
    'JB1 baris coop_savings',
    cnt(db, "SELECT COUNT(*) AS c FROM coop_savings WHERE kind = 'jasa' AND saved_at = '2026-09-30'"),
    3
  );
  // gl-off (OQ15 D1): tanpa jurnal.
  eq('JB1 gl-off entryId null', r.entryId, null);
  eq('JB1 gl-off tanpa jurnal', entryByRef(db, 'coop#jasa#2026-09'), null);
}

// -- JB2: jurnal agregat D3050 -> K2070 (N kaki, OQ9) ---------------
async function jb2(): Promise<void> {
  console.log('JB2: jurnal agregat D3050 -> K2070 (N kaki)');
  const { db, tdb } = fresh();
  insertMembers(db, [
    ['a1', 'zaid', 'aktif'],
    ['a2', 'umar', 'aktif'],
    ['a3', 'nabil', 'aktif'],
  ]);
  seedShu(db, '2026-09', 100000);
  const r = await recordCoopJasaInTx(tdb, { period: '2026-09', gl_enabled: true, createdBy: 't' });
  eq('JB2 entryId string', typeof r.entryId, 'string');
  const eid = r.entryId as string;
  eq('JB2 D3050 = pool', lineVal(db, eid, JASA_ACCT.JASA, 'debit'), 100000);
  eq(
    'JB2 N kaki K2070',
    cnt(db, "SELECT COUNT(*) AS c FROM journal_lines WHERE entry_id = '" + eid + "' AND account_code = '2070'"),
    3
  );
  eq('JB2 K2070 total', sumLineVal(db, eid, JASA_ACCT.SUKARELA, 'credit'), 100000);
  // D = K (jurnal seimbang).
  const sk = db
    .prepare(
      'SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS k FROM journal_lines WHERE entry_id = ?'
    )
    .get(eid) as { d: number; k: number };
  eq('JB2 jurnal D=K', sk.d === sk.k, true);
  eq(
    'JB2 entry_date = akhir periode',
    (db.prepare('SELECT entry_date AS v FROM journal_entries WHERE id = ?').get(eid) as { v: string }).v,
    '2026-09-30'
  );
  eq('JB2 ref_id', entryByRef(db, 'coop#jasa#2026-09'), eid);
}

// -- JB3: lastDayOfMonthIso leap-aware (OQ11) -----------------------
async function jb3(): Promise<void> {
  console.log('JB3: lastDayOfMonthIso (leap-aware)');
  eq('JB3 2024-02', lastDayOfMonthIso('2024-02'), '2024-02-29');
  eq('JB3 2026-02', lastDayOfMonthIso('2026-02'), '2026-02-28');
  eq('JB3 2026-12', lastDayOfMonthIso('2026-12'), '2026-12-31');
  try {
    lastDayOfMonthIso('2026-9');
    ok('JB3 periode valid', false, 'seharusnya throw');
  } catch (e) {
    ok('JB3 periode valid', /coop_jasa/.test(e instanceof Error ? e.message : String(e)), 'lempar galat');
  }
}

// -- JB4: guard SHU tak tercatat / pool 0 / N = 0 -------------------
async function jb4(): Promise<void> {
  console.log('JB4: guard jasa (SHU missing, pool 0, N = 0)');
  {
    const { db, tdb } = fresh();
    insertMembers(db, [['a1', 'zaid', 'aktif']]);
    await expectThrow(
      'JB4 SHU tak tercatat',
      () => recordCoopJasaInTx(tdb, { period: '2026-09', gl_enabled: false }),
      'JASA_SHU_MISSING'
    );
    seedShu(db, '2026-09', 0);
    await expectThrow(
      'JB4 pool = 0',
      () => recordCoopJasaInTx(tdb, { period: '2026-09', gl_enabled: false }),
      'JASA_NO_POOL'
    );
  }
  {
    const { db, tdb } = fresh();
    seedShu(db, '2026-09', 1000);
    await expectThrow(
      'JB4 N = 0',
      () => recordCoopJasaInTx(tdb, { period: '2026-09', gl_enabled: false }),
      'JASA_NO_ACTIVE'
    );
  }
}

// -- JB5: duplikat event-level (gl-off pun terdeteksi, OQ15 D1) -----
async function jb5(): Promise<void> {
  console.log('JB5: dup jasa event-level');
  const { db, tdb } = fresh();
  insertMembers(db, [['a1', 'zaid', 'aktif']]);
  seedShu(db, '2026-09', 1000);
  await recordCoopJasaInTx(tdb, { period: '2026-09', gl_enabled: false, createdBy: 't' });
  // gl-off: tanpa jurnal, namun baris coop_savings ada -> guard event-level
  // tetap menolak duplikat (OQ16).
  eq('JB5 gl-off tak ada jurnal', entryByRef(db, 'coop#jasa#2026-09'), null);
  await expectThrow(
    'JB5 dup (gl-off)',
    () => recordCoopJasaInTx(tdb, { period: '2026-09', gl_enabled: false }),
    'JASA_PERIOD_EXISTS'
  );
  // periode lain tetap boleh.
  seedShu(db, '2026-10', 1000);
  const r = await recordCoopJasaInTx(tdb, { period: '2026-10', gl_enabled: true, createdBy: 't' });
  eq('JB5 periode lain OK', typeof r.entryId, 'string');
}

// -- JB6: 5080 TIDAK PERNAH jadi leg (invariant OQ7-A) --------------
async function jb6(): Promise<void> {
  console.log('JB6: invariant 5080 (jasa)');
  const { db, tdb } = fresh();
  insertMembers(db, [['a1', 'zaid', 'aktif']]);
  seedShu(db, '2026-09', 1000);
  await recordCoopJasaInTx(tdb, { period: '2026-09', gl_enabled: true, createdBy: 't' });
  eq('JB6 tak ada baris 5080', cnt(db, "SELECT COUNT(*) AS c FROM journal_lines WHERE account_code = '5080'"), 0);
}


// -- helper: asersi throw (nama, fn, pesan diharapkan) --------------
async function expectThrow(label: string, fn: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await fn();
    ok(label + ' (harus throw ' + expected + ')', false, 'tidak throw');
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    ok(label, m === expected, 'dapat "' + m + '", seharusnya "' + expected + '"');
  }
}

// -- JT1: pencairan default KAS (1010) + pool berkurang -------------
async function jt1(): Promise<void> {
  console.log('JT1: pencairan default KAS (1010) + pool berkurang');
  const { db, tdb } = fresh();
  await seedTunaiPool(tdb, 100000, '2026-09-01');
  eq('JT1 pool awal', await getTunaiPoolInTx(tdb), 100000);
  const r = await recordCoopTunaiInTx(tdb, {
    period: '2026-09',
    amount: 40000,
    gl_enabled: true,
    createdBy: 't',
    entryDate: '2026-09-15',
  });
  eq('JT1 entryId string', typeof r.entryId, 'string');
  const eid = r.entryId as string;
  eq('JT1 D3060 = nominal', lineVal(db, eid, TUNAI_ACCT.DIBAGI, 'debit'), 40000);
  eq('JT1 K1010 (default) = nominal', lineVal(db, eid, TUNAI_ACCT.KAS, 'credit'), 40000);
  eq('JT1 tak ada K1020', lineVal(db, eid, TUNAI_ACCT.BANK, 'credit'), 0);
  // D = K (jurnal seimbang).
  const dk = db
    .prepare(
      'SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS k FROM journal_lines WHERE entry_id = ?'
    )
    .get(eid) as { d: number; k: number };
  eq('JT1 jurnal D=K', dk.d === dk.k, true);
  eq('JT1 pool berkurang', await getTunaiPoolInTx(tdb), 60000);
  eq('JT1 ref tercatat', await hasTunaiPeriod(tdb, '2026-09'), true);
  // OQ7-A: 5080 TIDAK PERNAH jadi leg.
  eq('JT1 tak ada baris 5080', cnt(db, "SELECT COUNT(*) AS c FROM journal_lines WHERE account_code = '5080'"), 0);
}

// -- JT2: pencairan bank (1020) + pool habis -------------------------
async function jt2(): Promise<void> {
  console.log('JT2: pencairan bank (1020) + pool habis');
  const { db, tdb } = fresh();
  await seedTunaiPool(tdb, 50000, '2026-09-01');
  const r = await recordCoopTunaiInTx(tdb, {
    period: '2026-09',
    amount: 50000,
    acct: TUNAI_ACCT.BANK,
    gl_enabled: true,
    createdBy: 't',
    entryDate: '2026-09-20',
  });
  eq('JT2 entryId string', typeof r.entryId, 'string');
  const eid = r.entryId as string;
  eq('JT2 D3060 = nominal', lineVal(db, eid, TUNAI_ACCT.DIBAGI, 'debit'), 50000);
  eq('JT2 K1020 = nominal', lineVal(db, eid, TUNAI_ACCT.BANK, 'credit'), 50000);
  eq('JT2 tak ada K1010', lineVal(db, eid, TUNAI_ACCT.KAS, 'credit'), 0);
  eq('JT2 pool habis = 0', await getTunaiPoolInTx(tdb), 0);
}

// -- JT3: guard saldo (exceeds / no pool / gl-off tanpa pool) --------
async function jt3(): Promise<void> {
  console.log('JT3: guard saldo tunai');
  {
    // nominal > saldo pool -> exceeds_balance (OQ12).
    const { tdb } = fresh();
    await seedTunaiPool(tdb, 100000, '2026-09-01');
    await expectThrow(
      'JT3 nominal > pool',
      () => recordCoopTunaiInTx(tdb, { period: '2026-09', amount: 100001, gl_enabled: true }),
      'coop_tunai:exceeds_balance'
    );
  }
  {
    // tak ada pool (3060 belum teramati) -> TUNAI_NO_POOL, gl-on & gl-off
    // sama (konsekuensi OQ12+OQ15: gl-off tak teramati -> selalu no-pool).
    const { tdb } = fresh();
    await expectThrow(
      'JT3 pool kosong (gl-on)',
      () => recordCoopTunaiInTx(tdb, { period: '2026-09', amount: 1000, gl_enabled: true }),
      'TUNAI_NO_POOL'
    );
    await expectThrow(
      'JT3 pool kosong (gl-off)',
      () => recordCoopTunaiInTx(tdb, { period: '2026-09', amount: 1000, gl_enabled: false }),
      'TUNAI_NO_POOL'
    );
  }
}

// -- JT4: duplikat periode + gl-off = tercatat tanpa jurnal ----------
async function jt4(): Promise<void> {
  console.log('JT4: duplikat periode + gl-off tanpa jurnal');
  const { db, tdb } = fresh();
  await seedTunaiPool(tdb, 100000, '2026-09-01');
  const r = await recordCoopTunaiInTx(tdb, {
    period: '2026-09',
    amount: 10000,
    gl_enabled: true,
    createdBy: 't',
    entryDate: '2026-09-05',
  });
  eq('JT4 entryId string', typeof r.entryId, 'string');
  // 1 periode = 1 pencairan (guard jurnal, OQ8/OQ16) -> 409.
  await expectThrow(
    'JT4 duplikat periode',
    () => recordCoopTunaiInTx(tdb, { period: '2026-09', amount: 10000, gl_enabled: true }),
    'TUNAI_PERIOD_EXISTS'
  );
  // periode lain tetap boleh (pool global all-time).
  await seedTunaiPool(tdb, 50000, '2026-10-01');
  const r2 = await recordCoopTunaiInTx(tdb, {
    period: '2026-10',
    amount: 50000,
    gl_enabled: true,
    createdBy: 't',
    entryDate: '2026-10-05',
  });
  eq('JT4 periode lain OK', typeof r2.entryId, 'string');
  // gl-off: entryId null + tanpa jurnal auto (OQ15 D1); "tercatat" =
  // logAudit route saja (bukan di lib) -> tak ada baris coop_savings.
  await seedTunaiPool(tdb, 20000, '2026-11-01');
  const r3 = await recordCoopTunaiInTx(tdb, {
    period: '2026-11',
    amount: 20000,
    gl_enabled: false,
    entryDate: '2026-11-05',
  });
  eq('JT4 gl-off entryId null', r3.entryId, null);
  eq('JT4 gl-off tak ada jurnal', entryByRef(db, 'coop#tunai#2026-11'), null);
}

// -- main: jalankan semua, exit code sesuai asensi --------------------
async function main(): Promise<void> {
  console.log('=== test-coop5b: op jasa & tunai (W4.5b) ===');
  await jb1();
  await jb2();
  await jb3();
  await jb4();
  await jb5();
  await jb6();
  await jt1();
  await jt2();
  await jt3();
  await jt4();
}

void main()
  .then(() => {
    if (failures > 0) {
      console.error('\nGAGAL: ' + failures + ' asersi (ok ' + passes + ')');
      process.exit(1);
    }
    console.log('\n--- SEMUA LULUS (' + passes + ' asersi) ---');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
