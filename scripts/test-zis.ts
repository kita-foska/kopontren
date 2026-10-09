/**
 * W2.7 (skema v22) -- test modul ZIS: tabel zis (Sek.8.2) + flip COA
 * 2090/5090/4040 + mapping OQ-1 + recordZisInTx + anti-campur #16.
 * Node langsung (type-stripping, Node >= 23.6/v24): npm run test:zis.
 * In-memory node:sqlite, DDL mirror src/db.ts (v22). Cakupan:
 *  - M1 (fresh install): seed v22 -> 3 akun flip 'open'; jumlah
 *    open=29/pending=22/closed=1, needs_decision=22, COUNT=52
 *    (6030 flip open W5.3b/v26).
 *  - M2 (upgrade v21->v22): state coa v21 (3 akun pending) + seed v22
 *    (DO NOTHING, baris lama tak ter-impa) + UPDATE flip -> 3 akun
 *    open; 6030/5050 & lainnya tidak berubah (idempoten).
 *  - Z1: mapping OQ-1 per jenis x arah (5 kombinasi auto):
 *    masuk (zakat/infak/sedekah) D1100/C2090; keluar zakat D5090/C1100;
 *    keluar infak/sedekah D5100/C1100. Wakaf in = D1120/C4100 (W3.5);
 *    wakaf out = tanpa auto-jurnal (D3).
 *  - Z2: anti-campur #16 -- HANYA akun 1100/2090/5090/5100 muncul
 *    (1010/1020 TIDAK PERNAH tersentuh).
 *  - Z3: D = K (JOURNAL_BAL #15 proxy) utk semua mapping.
 *  - Z4: recordZisInTx gl_on: baris zis + jurnal + posted_entry; jurnal
 *    idempoten (ulang spec sama = no-op); duplikat zis.id ditolak (PK).
 *  - Z5: gl_off: baris dicatat, posted_entry NULL, jurnal 0 (D1/D6).
 *  - Z6: wakaf in + gl_on: auto-jurnal D1120/C4100 + posted_entry (W3.5).
 *  - Z7: edge cases: amount <= 0 ditolak; kind/direction tak dikenal
 *    ditolak.
 *  - W10 (W3.5): COA verify 1120/4100/6020 'open'/0 + wakaf in auto-post
 *    (idempoten + D=K); wakaf out & gl_off = tercatat tanpa jurnal;
 *    anti-campur #16 (1120/4100 saja, tak pernah 1100/1010/1020).
 *  - Z8 (P3b): buildZisRekap -- by_kind zero-fill 4 jenis, bucket
 *    bulanan, c2090.gl_balance all-time (OQ-1: keluar tak kurangi 2090),
 *    posted/unposted (D6), filter periode (from inklusif / to eksklusif).
 */
import { recordZisInTx, zisLines, zisJournalFor, zisValidateAmount, ZIS_ACCT } from '../src/lib/zis.ts';
import { postJournalInTx } from '../src/lib/jurnal.ts';
import type { TxDb } from '../src/lib/jurnal.ts';
import { buildZisRekap } from '../src/lib/zis-rekap.ts';
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

/** Shim DatabaseSync (node:sqlite sync) -> QueryDb (libsql async) utk
 * buildZisRekap (Z8, P3b). Pola makeShim scripts/test-laporan.ts. */
function toQueryDb(db: unknown): QueryDb {
  const d = db as {
    prepare: (sql: string) => { get: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[] };
  };
  return {
    prepare(sql: string) {
      const stmt = d.prepare(sql);
      return {
        get: (...args: unknown[]) => Promise.resolve(stmt.get(...args)),
        all: (...args: unknown[]) => Promise.resolve(stmt.all(...args)),
      };
    },
  };
}

// DDL mirror src/db.ts (skema v22: coa + journal + zis; tanpa index).
const DDL_COA =
  'CREATE TABLE coa(code TEXT PRIMARY KEY, name TEXT NOT NULL, "group" TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'open\', pap_ref TEXT, needs_decision INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')))';
const DDL_JE =
  "CREATE TABLE journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))";
const DDL_JL =
  "CREATE TABLE journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))";
const DDL_ZIS =
  'CREATE TABLE zis(id TEXT PRIMARY KEY, kind TEXT NOT NULL, direction TEXT NOT NULL, amount INTEGER NOT NULL, payer TEXT, occurred_at TEXT NOT NULL, posted_entry TEXT, created_by TEXT, created_at TEXT NOT NULL)';

// Seed COA v22 (mirror coaSeed src/db.ts + 3 flip W2.7: 2090/5090/4040
// kini 'open'/0). 52 akun.
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

/** Adapter node:sqlite -> TxDb (permukaan async jurnal.ts). */
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

  // ===== M1: fresh install skema v22 (seed v22 + flip) =====
  const db1 = new mod.DatabaseSync(':memory:');
  db1.exec(DDL_COA);
  const insCoa = db1.prepare(
    'INSERT INTO coa (code, name, "group", kind, status, needs_decision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING'
  );
  for (const r of COA_V22) insCoa.run(r[0], r[1], r[2], r[3], r[4], r[5]);
  // UPDATE flip (mirror seed() src/db.ts; fresh install = no-op).
  db1.exec(`UPDATE coa SET status = 'open', needs_decision = 0 WHERE code IN ('2090', '5090', '4040')`);
  db1.exec(`UPDATE coa SET status = 'closed', needs_decision = 0 WHERE code = '2080'`); // P3a (v28)
  eq('M1: coa COUNT(*) = 52', cnt('SELECT COUNT(*) c FROM coa', db1), 52);
  eq("M1: coa status open = 29", cnt("SELECT COUNT(*) c FROM coa WHERE status='open'", db1), 29);
  eq("M1: coa status pending = 21", cnt("SELECT COUNT(*) c FROM coa WHERE status='pending'", db1), 21);
  eq("M1: coa status closed = 2", cnt("SELECT COUNT(*) c FROM coa WHERE status='closed'", db1), 2);
  eq("M1: coa needs_decision=1 = 21", cnt('SELECT COUNT(*) c FROM coa WHERE needs_decision=1', db1), 21);
  for (const code of ['2090', '5090', '4040']) {
    const r = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
    ok(`M1: coa ${code} flip open/0`, r.s === 'open' && r.n === 0, `status=${r.s} nd=${r.n}`);
  }
  const r6030 = db1.prepare('SELECT status s, needs_decision n FROM coa WHERE code=\'6030\'').get() as { s: string; n: number };
  ok('M1: coa 6030 flip open/0 (W5.3b, OQ-13)', r6030.s === 'open' && r6030.n === 0);
  eq("M1: coa 5050 tetap closed", String((db1.prepare('SELECT status s FROM coa WHERE code=\'5050\'').get() as { s: string }).s), 'closed');
  db1.close();

  // ===== M2: upgrade v21 -> v22 (baris coa v21 ada; seed DO NOTHING + flip) =====
  const db2 = new mod.DatabaseSync(':memory:');
  db2.exec(DDL_COA);
  const ins2 = db2.prepare(
    'INSERT INTO coa (code, name, "group", kind, status, needs_decision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING'
  );
  // State v21: subset representatif (3 flip akun pending + kontrol).
  const V21_STATE: CoaRow[] = [
    ['1100', 'Kas ZIS', '10xx', 'aset', 'open', 0],
    ['2090', 'ZIS Terkumpul Belum Disalurkan', '20xx', 'kewajiban', 'pending', 1],
    ['4040', 'Ujrah Konsinyasi', '40xx', 'pendapatan', 'pending', 1],
    ['5090', 'Zakat Keluar', '50xx', 'beban', 'pending', 1],
    ['5050', 'Denda/Keterlambatan (clearing)', '50xx', 'beban', 'closed', 0],
    ['6030', 'Zakat Tijarah Dibayar', '60xx', 'syariah', 'pending', 1],
  ];
  for (const r of V21_STATE) ins2.run(r[0], r[1], r[2], r[3], r[4], r[5]);
  // seed v22 dijalankan ulang: baris v21 ada -> DO NOTHING (status lama);
  // 46 akun baru ditambahkan (upgrade DB: coa tumbuh ke 52).
  for (const r of COA_V22) ins2.run(r[0], r[1], r[2], r[3], r[4], r[5]);
  eq('M2: seed v22 -> COUNT 52 (6 lama + 46 baru)', cnt('SELECT COUNT(*) c FROM coa', db2), 52);
  const preFlip = db2.prepare('SELECT status s, needs_decision n FROM coa WHERE code=\'2090\'').get() as { s: string; n: number };
  ok('M2: pre-flip 2090 masih pending/1 (do-nothing tak menimpa)', preFlip.s === 'pending' && preFlip.n === 1);
  // Flip UPDATE (path upgrade; mutlak karena seed DO NOTHING).
  db2.exec(`UPDATE coa SET status = 'open', needs_decision = 0 WHERE code IN ('2090', '5090', '4040')`);
  for (const code of ['2090', '5090', '4040']) {
    const r = db2.prepare('SELECT status s, needs_decision n FROM coa WHERE code=?').get(code) as { s: string; n: number };
    ok(`M2: coa ${code} upgrade -> open/0`, r.s === 'open' && r.n === 0, `status=${r.s} nd=${r.n}`);
  }
  eq("M2: coa 6030 tetap pending (di luar flip)", String((db2.prepare('SELECT status s FROM coa WHERE code=\'6030\'').get() as { s: string }).s), 'pending');
  eq("M2: coa 5050 tetap closed", String((db2.prepare('SELECT status s FROM coa WHERE code=\'5050\'').get() as { s: string }).s), 'closed');
  db2.close();

  // ===== Z-engine: mapping OQ-1 + recordZisInTx (db3: jurnal + zis) =====
  const db3 = new mod.DatabaseSync(':memory:');
  db3.exec(DDL_JE);
  db3.exec(DDL_JL);
  db3.exec(DDL_ZIS);
  const tdb = toTxDb(db3);
  const TZ = '2026-10-02T08:00:00.000+07:00';
  const bal = (a: string): number =>
    cnt(`SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) c FROM journal_lines WHERE account_code='${a}'`, db3);

  // Z1: mapping OQ-1 (5 kombinasi auto).
  {
    const inLines = zisLines('zakat', 'in', 5000000);
    ok(
      'Z1: masuk D1100/C2090',
      inLines.length === 2 &&
        inLines[0].account_code === ZIS_ACCT.KAS &&
        inLines[0].debit === 5000000 &&
        inLines[0].credit === 0 &&
        inLines[1].account_code === ZIS_ACCT.TERKUMPUL &&
        inLines[1].debit === 0 &&
        inLines[1].credit === 5000000
    );
    for (const k of ['infak', 'sedekah']) {
      const l = zisLines(k, 'in', 100000);
      ok(
        `Z1: masuk ${k} D1100/C2090`,
        l[0].account_code === '1100' && l[0].debit === 100000 && l[1].account_code === '2090' && l[1].credit === 100000
      );
    }
    const outZ = zisLines('zakat', 'out', 2500000);
    ok(
      'Z1: keluar zakat D5090/C1100',
      outZ[0].account_code === ZIS_ACCT.ZAKAT_OUT &&
        outZ[0].debit === 2500000 &&
        outZ[1].account_code === ZIS_ACCT.KAS &&
        outZ[1].credit === 2500000
    );
    for (const k of ['infak', 'sedekah']) {
      const l = zisLines(k, 'out', 750000);
      ok(
        `Z1: keluar ${k} D5100/C1100`,
        l[0].account_code === ZIS_ACCT.INFAK_OUT && l[0].debit === 750000 && l[1].account_code === ZIS_ACCT.KAS && l[1].credit === 750000
      );
    }
  }

  // Z2: anti-campur #16 -- semua baris hanya di {1100,2090,5090,5100}.
  {
    const allowed = new Set(['1100', '2090', '5090', '5100']);
    const combos: Array<[string, string]> = [
      ['zakat', 'in'],
      ['infak', 'in'],
      ['sedekah', 'in'],
      ['zakat', 'out'],
      ['infak', 'out'],
      ['sedekah', 'out'],
    ];
    let clean = true;
    for (const [k, dir] of combos) {
      for (const l of zisLines(k, dir, 1000)) {
        if (!allowed.has(l.account_code)) clean = false;
      }
    }
    ok('Z2: anti-campur -- tak ada akun di luar 1100/2090/5090/5100 (1010/1020 tak tersentuh)', clean);
  }

  // Z3: D = K (JOURNAL_BAL #15 proxy) utk semua mapping.
  {
    let balanced = true;
    for (const k of ['zakat', 'infak', 'sedekah']) {
      for (const dir of ['in', 'out'] as const) {
        const l = zisLines(k, dir, 123456);
        const dSum = l.reduce((a, x) => a + x.debit, 0);
        const cSum = l.reduce((a, x) => a + x.credit, 0);
        if (dSum !== cSum) balanced = false;
      }
    }
    ok('Z3: D = K utk 6 kombinasi auto', balanced);
  }

  // Z4: recordZisInTx gl_on -- zis + jurnal + posted_entry; idempoten.
  {
    const r1 = await recordZisInTx(tdb, {
      id: 'z1',
      kind: 'zakat',
      direction: 'in',
      amount: 5000000,
      payer: 'Ahmad',
      occurred_at: TZ,
      created_by: '7',
      gl_enabled: true,
    });
    eq('Z4: entryId = JE-zis-z1', r1.entryId, 'JE-zis-z1');
    const zrow = db3.prepare('SELECT * FROM zis WHERE id=\'z1\'').get() as Record<string, unknown> | undefined;
    ok('Z4: baris zis tercatat + posted_entry ter-link', zrow != null && Number(zrow.amount) === 5000000 && String(zrow.posted_entry) === 'JE-zis-z1');
    eq("Z4: 1 journal_entries ref zis/z1", cnt("SELECT COUNT(*) c FROM journal_entries WHERE ref_table='zis' AND ref_id='z1'", db3), 1);
    eq("Z4: 2 jurnal baris", cnt("SELECT COUNT(*) c FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id WHERE je.ref_table='zis'", db3), 2);
    eq('Z4: saldo 1100 = +5000000', bal('1100'), 5000000);
    eq('Z4: saldo 2090 = -5000000', bal('2090'), -5000000);
    // Idempoten: ulang posting spec yang sama (ref zis/z1) = no-op.
    const spec = zisJournalFor({ id: 'z1', kind: 'zakat', direction: 'in', amount: 5000000, occurred_at: TZ, gl_enabled: true });
    const again = await postJournalInTx(tdb, spec);
    eq('Z4: ulang posting = no-op (id sama)', again, 'JE-zis-z1');
    eq("Z4: jurnal tetap 1", cnt("SELECT COUNT(*) c FROM journal_entries WHERE ref_table='zis'", db3), 1);
    // zis.id duplikat ditolak (PK) -- transaksi ulang = baris baru (id baru).
    let pkRejected = false;
    try {
      await recordZisInTx(tdb, { id: 'z1', kind: 'zakat', direction: 'in', amount: 5000000, occurred_at: TZ, gl_enabled: true });
    } catch {
      pkRejected = true;
    }
    ok('Z4: duplikat zis.id ditolak (PK)', pkRejected);
  }

  // Z4b: baris kedua (zakat keluar) -> akun 5090/1100; saldo net benar.
  {
    const r2 = await recordZisInTx(tdb, {
      id: 'z2',
      kind: 'zakat',
      direction: 'out',
      amount: 2500000,
      occurred_at: TZ,
      gl_enabled: true,
    });
    eq('Z4b: entryId = JE-zis-z2', r2.entryId, 'JE-zis-z2');
    eq('Z4b: saldo 1100 = +2500000 (net)', bal('1100'), 2500000);
    eq('Z4b: saldo 5090 = +2500000', bal('5090'), 2500000);
  }

  // Z5: gl_off -- dicatat, tanpa jurnal (D1/D6).
  {
    const r5 = await recordZisInTx(tdb, {
      id: 'z5',
      kind: 'infak',
      direction: 'in',
      amount: 100000,
      occurred_at: TZ,
      gl_enabled: false,
    });
    eq('Z5: gl_off entryId = null', r5.entryId, null);
    const zrow = db3.prepare('SELECT * FROM zis WHERE id=\'z5\'').get() as Record<string, unknown> | undefined;
    ok('Z5: baris zis tercatat, posted_entry NULL', zrow != null && zrow.posted_entry == null);
    eq('Z5: jurnal tetap 2 (tak berubah)', cnt('SELECT COUNT(*) c FROM journal_entries', db3), 2);
  }

  // Z6: wakaf in + gl_on -- auto-jurnal D1120/C4100 + posted_entry (W3.5).
  {
    const r6 = await recordZisInTx(tdb, {
      id: 'z6',
      kind: 'wakaf',
      direction: 'in',
      amount: 3000000,
      occurred_at: TZ,
      gl_enabled: true,
    });
    eq('Z6: wakaf in gl_on entryId = JE-zis-z6', r6.entryId, 'JE-zis-z6');
    const zrow = db3.prepare('SELECT * FROM zis WHERE id=\'z6\'').get() as Record<string, unknown> | undefined;
    ok('Z6: baris wakaf tercatat + posted_entry ter-link', zrow != null && Number(zrow.amount) === 3000000 && String(zrow.posted_entry) === 'JE-zis-z6');
    eq('Z6: saldo 1120 = +3000000', bal('1120'), 3000000);
    eq('Z6: saldo 4100 = -3000000 (kredit)', bal('4100'), -3000000);
    eq('Z6: 1 jurnal entry ref zis/z6', cnt("SELECT COUNT(*) c FROM journal_entries WHERE ref_table='zis' AND ref_id='z6'", db3), 1);
  }

  // Z7: edge cases.
  {
    let threw = 0;
    try {
      zisValidateAmount(0);
    } catch {
      threw++;
    }
    try {
      zisValidateAmount(-500);
    } catch {
      threw++;
    }
    try {
      zisValidateAmount('abc');
    } catch {
      threw++;
    }
    ok('Z7: amount <= 0 / non-numeric ditolak', threw === 3);
    threw = 0;
    try {
      zisLines('qurban', 'in', 1000);
    } catch {
      threw++;
    }
    try {
      zisLines('zakat', 'side', 1000);
    } catch {
      threw++;
    }
    ok('Z7: kind/direction tak dikenal ditolak', threw === 2);
    eq('Z7: pecahan dibulatkan (1.9 -> 2)', zisValidateAmount(1.9), 2);
    let t4 = 0;
    try {
      zisValidateAmount(0.4);
    } catch {
      t4++;
    }
    ok('Z7: 0.4 -> 0 -> ditolak', t4 === 1);
  }

  // ===== W10 (W3.5): wakaf COA verify + auto-post in + out/gl_off tak post =====
  {
    // W10a: COA verify -- 1120/4100/6020 ada & 'open'/0 di seed (mirror db.ts).
    for (const code of ['1120', '4100', '6020']) {
      const row = COA_V22.find((r) => r[0] === code);
      ok(
        'W10a: COA ' + code + " status 'open'/0",
        row != null && row[4] === 'open' && row[5] === 0,
        row ? 'status=' + row[4] + ' nd=' + row[5] : 'missing'
      );
    }

    // W10b..f: db4 fresh (jurnal + zis; COA tak perlu utk posting).
    const db4 = new mod.DatabaseSync(':memory:');
    db4.exec(DDL_JE);
    db4.exec(DDL_JL);
    db4.exec(DDL_ZIS);
    const tdb4 = toTxDb(db4);
    const bal4 = (a: string): number =>
      cnt(`SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) c FROM journal_lines WHERE account_code='${a}'`, db4);

    // W10b: wakaf in auto-post (D1120/K4100) + idempoten + D=K.
    const rIn = await recordZisInTx(tdb4, {
      id: 'w1',
      kind: 'wakaf',
      direction: 'in',
      amount: 7000000,
      occurred_at: TZ,
      gl_enabled: true,
    });
    eq('W10b: wakaf in entryId = JE-zis-w1', rIn.entryId, 'JE-zis-w1');
    eq('W10b: saldo 1120 = +7000000', bal4('1120'), 7000000);
    eq('W10b: saldo 4100 = -7000000 (kredit)', bal4('4100'), -7000000);
    eq('W10b: 6020 (memo) tak tersentuh, saldo 0', bal4('6020'), 0);
    eq('W10b: 1 jurnal entry ref zis/w1', cnt("SELECT COUNT(*) c FROM journal_entries WHERE ref_table='zis' AND ref_id='w1'", db4), 1);
    eq(
      'W10b: 2 jurnal baris (1120+4100)',
      cnt("SELECT COUNT(*) c FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id WHERE je.ref_table='zis'", db4),
      2
    );
    const spec4 = zisJournalFor({ id: 'w1', kind: 'wakaf', direction: 'in', amount: 7000000, occurred_at: TZ, gl_enabled: true });
    const again4 = await postJournalInTx(tdb4, spec4);
    eq('W10b: ulang posting = no-op (id JE-zis-w1)', again4, 'JE-zis-w1');
    eq('W10b: jurnal tetap 1', cnt("SELECT COUNT(*) c FROM journal_entries WHERE ref_table='zis'", db4), 1);

    // W10c: wakaf out + gl_on -- tercatat tanpa jurnal (D3).
    const rOut = await recordZisInTx(tdb4, {
      id: 'w2',
      kind: 'wakaf',
      direction: 'out',
      amount: 2000000,
      occurred_at: TZ,
      gl_enabled: true,
    });
    eq('W10c: wakaf out gl_on entryId = null', rOut.entryId, null);
    const zrow4 = db4.prepare("SELECT * FROM zis WHERE id='w2'").get() as Record<string, unknown> | undefined;
    ok('W10c: baris wakaf out tercatat, posted_entry NULL', zrow4 != null && Number(zrow4.amount) === 2000000 && zrow4.posted_entry == null);
    eq('W10c: jurnal tetap 1 (wakaf out tak post)', cnt('SELECT COUNT(*) c FROM journal_entries', db4), 1);

    // W10d: wakaf in + gl_off -- tercatat tanpa jurnal (D1/D6).
    const rOff = await recordZisInTx(tdb4, {
      id: 'w3',
      kind: 'wakaf',
      direction: 'in',
      amount: 1000000,
      occurred_at: TZ,
      gl_enabled: false,
    });
    eq('W10d: wakaf in gl_off entryId = null', rOff.entryId, null);
    eq('W10d: jurnal tetap 1 (gl-off tak post)', cnt('SELECT COUNT(*) c FROM journal_entries', db4), 1);

    // W10e: anti-campur #16 utk wakaf -- in hanya {1120,4100}, tak pernah
    // 1100/1010/1020; out = tanpa baris jurnal.
    {
      const wIn = zisLines('wakaf', 'in', 1000);
      const codes = wIn.map((l) => l.account_code);
      ok(
        'W10e: wakaf in hanya 1120/4100 (tak campur 1100/1010/1020)',
        codes.includes('1120') && codes.includes('4100') && !codes.includes('1100') && !codes.includes('1010') && !codes.includes('1020'),
        codes.join(',')
      );
      const wOut = zisLines('wakaf', 'out', 1000);
      ok('W10e: wakaf out = tanpa baris jurnal ([])', wOut.length === 0);
    }

    // W10f: D = K global (proxy JOURNAL_BAL #15) utk jurnal wakaf.
    {
      const g = db4.prepare('SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines').get() as {
        d: number;
        c: number;
      };
      ok('W10f: D = K global jurnal wakaf', Number(g.d) === Number(g.c), 'D=' + g.d + ' K=' + g.c);
    }

    db4.close();
  }

  // ===== Z8 (P3b): buildZisRekap -- by_kind zero-fill, bucket bulanan,
  // saldo 2090 (GL, all-time), filter periode, posted/unposted (D6).
  {
    const db5 = new mod.DatabaseSync(':memory:');
    db5.exec(DDL_JE);
    db5.exec(DDL_JL);
    db5.exec(DDL_ZIS);
    const tdb5 = toTxDb(db5);
    const qdb5 = toQueryDb(db5);
    const bal5 = (a: string): number =>
      cnt(`SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) c FROM journal_lines WHERE account_code='${a}'`, db5);

    // Z8a: DB kosong -> by_kind zero-fill 4 jenis, monthly kosong, c2090 nol.
    {
      const p = await buildZisRekap(qdb5);
      eq('Z8a: by_kind zero-fill 4 jenis', p.by_kind.length, 4);
      eq('Z8a: by_kind urut zakat...sedekah', p.by_kind[0]?.kind + '/' + p.by_kind[2]?.kind, 'zakat/sedekah');
      eq('Z8a: grand kosong = 0', p.grand.in_total + p.grand.out_total + p.grand.net, 0);
      eq('Z8a: monthly kosong', p.monthly.length, 0);
      eq('Z8a: c2090 nol (0/0/0)', p.c2090.gl_balance + p.c2090.posted_in + p.c2090.unposted_in, 0);
      ok('Z8a: period echo null (all-time)', p.period.from === null && p.period.to === null);
    }

    // Seed: 2 bulan (Sep+Oct), mix gl_on/gl_off, mix jenis/arah.
    await recordZisInTx(tdb5, { id: 'r1', kind: 'zakat', direction: 'in', amount: 4000000, occurred_at: '2026-09-10T08:00:00.000+07:00', gl_enabled: true });
    await recordZisInTx(tdb5, { id: 'r2', kind: 'infak', direction: 'in', amount: 1000000, occurred_at: '2026-10-05T09:00:00.000+07:00', gl_enabled: false });
    await recordZisInTx(tdb5, { id: 'r3', kind: 'zakat', direction: 'out', amount: 1500000, occurred_at: '2026-10-06T10:00:00.000+07:00', gl_enabled: true });
    await recordZisInTx(tdb5, { id: 'r4', kind: 'wakaf', direction: 'in', amount: 2000000, occurred_at: '2026-09-11T11:00:00.000+07:00', gl_enabled: true });

    // Z8b: all-time -- by_kind + grand + bucket bulanan + c2090 (OQ-1/D6).
    {
      const p = await buildZisRekap(qdb5);
      const z = p.by_kind.find((k) => k.kind === 'zakat');
      eq('Z8b: zakat in = 4000000', z?.in_total, 4000000);
      eq('Z8b: zakat out = 1500000', z?.out_total, 1500000);
      eq('Z8b: zakat net = 2500000', z?.net, 2500000);
      eq('Z8b: infak in = 1000000', p.by_kind.find((k) => k.kind === 'infak')?.in_total, 1000000);
      eq('Z8b: sedekah nol (zero-fill)', p.by_kind.find((k) => k.kind === 'sedekah')?.in_total, 0);
      eq('Z8b: wakaf in = 2000000', p.by_kind.find((k) => k.kind === 'wakaf')?.in_total, 2000000);
      eq('Z8b: grand in = 7000000', p.grand.in_total, 7000000);
      eq('Z8b: grand out = 1500000', p.grand.out_total, 1500000);
      eq('Z8b: grand net = 5500000', p.grand.net, 5500000);
      eq('Z8b: monthly 2 bucket (ASC)', p.monthly.length, 2);
      eq('Z8b: bucket 0 = 2026-09', p.monthly[0]?.month, '2026-09');
      eq('Z8b: Sep in = 6000000 (zakat 4jt + wakaf 2jt)', p.monthly[0]?.in_total, 6000000);
      eq('Z8b: Oct out = 1500000', p.monthly[1]?.out_total, 1500000);
      eq('Z8b: c2090.gl_balance = 4000000 (hanya zakat in gl-on; OQ-1)', p.c2090.gl_balance, 4000000);
      eq('Z8b: posted_in = 2 (r1+r4 in gl-on; r3 out tak ikut)', p.c2090.posted_in, 2);
      eq('Z8b: unposted_in = 1 (r2 gl-off, D6)', p.c2090.unposted_in, 1);
      eq('Z8b: saldo jurnal 2090 = -4000000 (kredit)', bal5('2090'), -4000000);
    }

    // Z8c: filter periode Oct (from inklusif / to eksklusif) + invariant
    // all-time c2090 (tidak ikut periode -- OQ-1).
    {
      const p = await buildZisRekap(qdb5, '2026-10-01T00:00:00.000+07:00', '2026-11-01T00:00:00.000+07:00');
      eq('Z8c: Oct zakat out = 1500000', p.by_kind.find((k) => k.kind === 'zakat')?.out_total, 1500000);
      eq('Z8c: Oct zakat in = 0 (r1 di Sep)', p.by_kind.find((k) => k.kind === 'zakat')?.in_total, 0);
      eq('Z8c: Oct infak in = 1000000', p.by_kind.find((k) => k.kind === 'infak')?.in_total, 1000000);
      eq('Z8c: Oct wakaf in = 0 (r4 di Sep)', p.by_kind.find((k) => k.kind === 'wakaf')?.in_total, 0);
      eq('Z8c: Oct grand in = 1000000', p.grand.in_total, 1000000);
      eq('Z8c: Oct grand net = -500000', p.grand.net, -500000);
      eq('Z8c: Oct monthly 1 bucket', p.monthly.length, 1);
      eq('Z8c: period.from ter-echo', p.period.from, '2026-10-01T00:00:00.000+07:00');
      eq('Z8c: c2090.gl_balance tetap all-time = 4000000', p.c2090.gl_balance, 4000000);
      eq('Z8c: c2090.posted_in tetap all-time = 2', p.c2090.posted_in, 2);
    }

    db5.close();
  }

  db3.close();
}

void main().then(() => {
  console.log(`\nDONE: ${passes} lulus, ${failures} gagal`);
  if (failures > 0) {
    console.log('HAS_FAILURE');
    process.exit(1);
  }
});

