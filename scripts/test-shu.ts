/**
 * W4.4 - test distribusi SHU (src/lib/shu.ts): hitung (rasio input admin) +
 * posting distribusi (jurnal D3020 -> K3030/3040/3050/3060).
 *
 * Harness SELF-CONTAINED: in-memory node:sqlite, pola scripts/test-coop.ts
 * (adapter toTxDb + DDL journal/coop_shu mirror src/db.ts). Dipilih mandiri
 * karena scripts/test-coop.ts tak bisa dibaca/diedit saat sesi ini (shell &
 * file-read gagal di mid-file), jadi file ini tak bergantung harness lama.
 *
 * Jalankan: node scripts/test-shu.ts  (Node >= 23.6 type-stripping).
 *
 * Cakupan:
 *  S1: computeShuAllocation -- rasio -> 4 porsi rupiah; "dibagi" = residu
 *      sehingga SUM porsi = shu_total (garansi D=K), + shuDibagiPct.
 *  S2: guard input -- total <= 0 / rasio tak valid / SUM rasio > 100 /
 *      periode tak YYYY-MM (SHU_TOTAL_INVALID / SHU_RATIO_INVALID /
 *      SHU_RATIO_SUM / SHU_PERIOD_INVALID).
 *  S3: recordShuInTx (GL ON) -- INSERT coop_shu + jurnal D3020/K30xx;
 *      ref_id coop#shu#<period>, entry_date = awal periode, D=K.
 *  S3b: GL ON rasio 0/0/0 -> hanya 2 kaki (D3020 + K3060 residu).
 *  S4: UNIQUE(period) tolak duplikat (SHU_PERIOD_EXISTS) + GL idempoten.
 *  S5: GL OFF -- coop_shu tercatat, TIDAK ada journal_entries/lines.
 */
import {
  SHU_ACCT,
  buildShuAllocationSpec,
  computeShuAllocation,
  recordShuInTx,
  validateShuInput,
} from '../src/lib/shu.ts';
import type { ShuRasio } from '../src/lib/shu.ts';
import { postJournalInTx } from '../src/lib/jurnal.ts';
import type { TxDb } from '../src/lib/jurnal.ts';

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

/**
 * Mirr lokal persen "dibagi" (residu) utk menyusun ShuRasioFull yang
 * dibutuhkan recordShuInTx -- tak bergantung export helper shu.ts, supaya
 * file test ini tetap berdiri sendiri.
 */
function shuDibagiPct(r: ShuRasio): number {
  return 100 - (Number(r.cad_umum) || 0) - (Number(r.cad_khusus) || 0) - (Number(r.jasa) || 0);
}

// DDL journal mirror src/db.ts (skema W1.1, sama test-coop.ts/test-akad.ts;
// tanpa index -- tak diperlukan utk postJournalInTx).
const DDL_JE =
  "CREATE TABLE journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))";
const DDL_JL =
  "CREATE TABLE journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))";
// DDL coop_shu mirror src/db.ts (skema v24, Sek.7.1). created_at punya default
// karena recordShuInTx TIDAK mengirim created_at.
const DDL_SHU =
  "CREATE TABLE coop_shu(id TEXT PRIMARY KEY, period TEXT NOT NULL, shu_total INTEGER NOT NULL, cadangan_umum INTEGER, cadangan_khusus INTEGER, jasa_anggota INTEGER, dibagi INTEGER, rasio_json TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(period))";

/** Adapter node:sqlite -> TxDb (permukaan async jurnal.ts; mirror test-coop.ts). */
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

/** Nilai debit/credit akun tertentu pada entry (0 bila baris tak ada). */
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

/** Jumlah baris hasil COUNT(*) (0 bila tak ada). */
function cnt0(db: import('node:sqlite').DatabaseSync, sql: string, ...a: unknown[]): number {
  const vals = a as import('node:sqlite').SQLInputValue[];
  return Number((db.prepare(sql).get(...vals) as { c: number })?.c ?? 0);
}

async function main(): Promise<void> {
  let mod: typeof import('node:sqlite');
  try {
    mod = await import('node:sqlite');
  } catch (e) {
    console.error('gagal import node:sqlite (butuh Node >= 22.5/23.6): ' + String(e));
    process.exit(1);
  }

  // ===== S1: computeShuAllocation (pure, tanpa DB) =====
  {
    const a = computeShuAllocation(1_000_000, { cad_umum: 10, cad_khusus: 5, jasa: 25 });
    eq('S1: cad_umum 10%', a.cad_umum, 100_000);
    eq('S1: cad_khusus 5%', a.cad_khusus, 50_000);
    eq('S1: jasa 25%', a.jasa, 250_000);
    eq('S1: dibagi (residu 60%)', a.dibagi, 600_000);
    eq('S1: SUM porsi = total', a.cad_umum + a.cad_khusus + a.jasa + a.dibagi, 1_000_000);
    eq('S1: shuDibagiPct = 60', shuDibagiPct({ cad_umum: 10, cad_khusus: 5, jasa: 25 }), 60);
    // Bulatkan + residu: total "tak bagus" pun SUM tetap = total.
    const b = computeShuAllocation(1_000_001, { cad_umum: 33, cad_khusus: 33, jasa: 33 });
    eq('S1b: SUM (residu serap pembulatan)', b.cad_umum + b.cad_khusus + b.jasa + b.dibagi, 1_000_001);
  }

  // ===== S2: guard input (throw) =====
  {
    let e1 = '';
    try {
      computeShuAllocation(0, { cad_umum: 10, cad_khusus: 0, jasa: 0 });
    } catch (x) {
      e1 = String(x);
    }
    ok('S2: total <= 0 -> SHU_TOTAL_INVALID', e1.includes('SHU_TOTAL_INVALID'));
    let e2 = '';
    try {
      computeShuAllocation(NaN, { cad_umum: 10, cad_khusus: 0, jasa: 0 });
    } catch (x) {
      e2 = String(x);
    }
    ok('S2: total NaN -> SHU_TOTAL_INVALID', e2.includes('SHU_TOTAL_INVALID'));
    let e3 = '';
    try {
      computeShuAllocation(1_000, { cad_umum: 5, cad_khusus: -1, jasa: 5 });
    } catch (x) {
      e3 = String(x);
    }
    ok('S2: rasio negatif -> SHU_RATIO_INVALID', e3.includes('SHU_RATIO_INVALID'));
    let e4 = '';
    try {
      computeShuAllocation(1_000, { cad_umum: 50, cad_khusus: 50, jasa: 50 });
    } catch (x) {
      e4 = String(x);
    }
    ok('S2: SUM rasio 150 > 100 -> SHU_RATIO_SUM', e4.includes('SHU_RATIO_SUM'));
    let e5 = '';
    try {
      validateShuInput({ period: '2026', shu_total: 1_000, rasio: { cad_umum: 10, cad_khusus: 0, jasa: 0 } });
    } catch (x) {
      e5 = String(x);
    }
    ok('S2: periode "2026" tak YYYY-MM -> SHU_PERIOD_INVALID', e5.includes('SHU_PERIOD_INVALID'));
    let e6 = '';
    try {
      validateShuInput({ period: '2026-13', shu_total: 1_000, rasio: { cad_umum: 10, cad_khusus: 0, jasa: 0 } });
    } catch (x) {
      e6 = String(x);
    }
    ok('S2: periode "2026-13" -> SHU_PERIOD_INVALID', e6.includes('SHU_PERIOD_INVALID'));
    // positif: periode sah lolos validasi.
    const v = validateShuInput({ period: '2026-07', shu_total: 1_200_000, rasio: { cad_umum: 10, cad_khusus: 10, jasa: 30 } });
    eq('S2: period lolos', v.period, '2026-07');
    eq('S2: shu_total', v.shu_total, 1_200_000);
    eq('S2: rasio.dibagi (residu 50)', v.rasio.dibagi, 50);
    eq('S2: SUM amounts = total', v.amounts.cad_umum + v.amounts.cad_khusus + v.amounts.jasa + v.amounts.dibagi, 1_200_000);
  }

  // ===== S3: recordShuInTx GL-ON (4 kaki) =====
  let db: import('node:sqlite').DatabaseSync;
  {
    db = new mod.DatabaseSync(':memory:');
    db.exec(DDL_JE);
    db.exec(DDL_JL);
    db.exec(DDL_SHU);
    const tdb = toTxDb(db);
    const rasio: ShuRasio = { cad_umum: 10, cad_khusus: 5, jasa: 25 };
    const amounts = computeShuAllocation(1_000_000, rasio);
    const res = await recordShuInTx(tdb, {
      id: 'shu-2026',
      period: '2026-07',
      shu_total: 1_000_000,
      rasio: { ...rasio, dibagi: shuDibagiPct(rasio) },
      amounts,
      glDate: '2026-07-01',
      glEnabled: true,
      createdBy: 'gus',
    });
    ok('S3: entryId ada', !!res.entryId, String(res.entryId));
    eq('S3: gl=true', res.gl, true);
    eq('S3: D3020 = total', lineVal(db, res.entryId!, SHU_ACCT.DITAHAN, 'debit'), 1_000_000);
    eq('S3: K3030 = 100000', lineVal(db, res.entryId!, SHU_ACCT.CAD_UMUM, 'credit'), 100_000);
    eq('S3: K3040 = 50000', lineVal(db, res.entryId!, SHU_ACCT.CAD_KHUSUS, 'credit'), 50_000);
    eq('S3: K3050 = 250000', lineVal(db, res.entryId!, SHU_ACCT.JASA, 'credit'), 250_000);
    eq('S3: K3060 (residu) = 600000', lineVal(db, res.entryId!, SHU_ACCT.DIBAGI, 'credit'), 600_000);
    eq(
      'S3: D=K utk entry',
      lineVal(db, res.entryId!, SHU_ACCT.DITAHAN, 'debit'),
      lineVal(db, res.entryId!, SHU_ACCT.CAD_UMUM, 'credit') +
        lineVal(db, res.entryId!, SHU_ACCT.CAD_KHUSUS, 'credit') +
        lineVal(db, res.entryId!, SHU_ACCT.JASA, 'credit') +
        lineVal(db, res.entryId!, SHU_ACCT.DIBAGI, 'credit')
    );
    eq(
      'S3: ref_id coop#shu#2026-07',
      String((db.prepare('SELECT ref_id r FROM journal_entries WHERE id=?').get(res.entryId!) as { r: string }).r),
      'coop#shu#2026-07'
    );
    eq(
      'S3: entry_date = awal periode',
      String((db.prepare('SELECT entry_date d FROM journal_entries WHERE id=?').get(res.entryId!) as { d: string }).d),
      '2026-07-01'
    );
    eq('S3: 1 baris coop_shu', cnt0(db, "SELECT COUNT(*) c FROM coop_shu WHERE period='2026-07'"), 1);
    const shuRow = db.prepare('SELECT rasio_json j FROM coop_shu WHERE period=?').get('2026-07') as { j: string };
    const rj = JSON.parse(shuRow.j) as Record<string, number>;
    ok('S3: rasio_json 4 kunci', 'cad_umum' in rj && 'cad_khusus' in rj && 'jasa' in rj && 'dibagi' in rj);
    eq('S3: rasio_json.dibagi = 60', rj.dibagi, 60);

    // S3b: GL-ON rasio 0/0/0 -> hanya 2 kaki (D3020 + K3060 residu).
    const z: ShuRasio = { cad_umum: 0, cad_khusus: 0, jasa: 0 };
    const za = computeShuAllocation(500_000, z);
    const rz = await recordShuInTx(tdb, {
      id: 'shu-2025',
      period: '2025-12',
      shu_total: 500_000,
      rasio: { ...z, dibagi: shuDibagiPct(z) },
      amounts: za,
      glDate: '2025-12-01',
      glEnabled: true,
      createdBy: 'gus',
    });
    ok('S3b: entryId ada (rasio 0)', !!rz.entryId, String(rz.entryId));
    eq('S3b: D3020 = total', lineVal(db, rz.entryId!, SHU_ACCT.DITAHAN, 'debit'), 500_000);
    eq('S3b: K3060 (residu) = total', lineVal(db, rz.entryId!, SHU_ACCT.DIBAGI, 'credit'), 500_000);
    eq('S3b: K3030 tak ada (0)', lineVal(db, rz.entryId!, SHU_ACCT.CAD_UMUM, 'credit'), 0);
    eq('S3b: 2 jurnal coop utk 2 periode', cnt0(db, "SELECT COUNT(*) c FROM journal_entries WHERE ref_table='coop' AND type='auto'"), 2);
  }

  // ===== S4: UNIQUE(period) + GL idempoten =====
  {
    const tdb = toTxDb(db);
    // Duplikat periode ditolak SHU_PERIOD_EXISTS.
    let eDup = '';
    try {
      await recordShuInTx(tdb, {
        id: 'shu-2026-dup',
        period: '2026-07',
        shu_total: 1_000_000,
        rasio: { cad_umum: 10, cad_khusus: 5, jasa: 25, dibagi: 60 },
        amounts: computeShuAllocation(1_000_000, { cad_umum: 10, cad_khusus: 5, jasa: 25 }),
        glDate: '2026-07-01',
        glEnabled: true,
        createdBy: 'gus',
      });
    } catch (x) {
      eDup = String(x);
    }
    ok('S4: periode duplikat -> SHU_PERIOD_EXISTS', eDup.includes('SHU_PERIOD_EXISTS'));
    eq('S4: coop_shu tetap 1 baris utk 2026-07', cnt0(db, "SELECT COUNT(*) c FROM coop_shu WHERE period='2026-07'"), 1);

    // GL idempoten: re-post spec sama = no-op (kembalikan id yang sama,
    // jumlah journal_entries tak bertambah).
    const spec = buildShuAllocationSpec(
      '2026-07',
      1_000_000,
      computeShuAllocation(1_000_000, { cad_umum: 10, cad_khusus: 5, jasa: 25 }),
      '2026-07-01',
      'gus'
    );
    const jid1 = await postJournalInTx(tdb, spec);
    const jid2 = await postJournalInTx(tdb, spec);
    eq('S4: GL idempoten (id sama)', jid1, jid2);
    eq(
      'S4: journal_entries tetap 1 utk ref',
      cnt0(db, "SELECT COUNT(*) c FROM journal_entries WHERE ref_table='coop' AND ref_id='coop#shu#2026-07'"),
      1
    );
  }

  // ===== S5: GL-OFF (coop_shu tercatat, tanpa jurnal) =====
  {
    const db2 = new mod.DatabaseSync(':memory:');
    db2.exec(DDL_JE);
    db2.exec(DDL_JL);
    db2.exec(DDL_SHU);
    const tdb2 = toTxDb(db2);
    const rasio: ShuRasio = { cad_umum: 20, cad_khusus: 10, jasa: 20 };
    const amounts = computeShuAllocation(500_000, rasio);
    const res = await recordShuInTx(tdb2, {
      id: 'shu-2024',
      period: '2024-09',
      shu_total: 500_000,
      rasio: { ...rasio, dibagi: shuDibagiPct(rasio) },
      amounts,
      glDate: '2024-09-01',
      glEnabled: false,
      createdBy: 'gus',
    });
    ok('S5: entryId null (GL off)', res.entryId === null);
    eq('S5: gl=false', res.gl, false);
    eq('S5: coop_shu tercatat (1 baris)', cnt0(db2, "SELECT COUNT(*) c FROM coop_shu WHERE period='2024-09'"), 1);
    eq('S5: TIDAK ada journal_entries', cnt0(db2, 'SELECT COUNT(*) c FROM journal_entries'), 0);
    eq('S5: TIDAK ada journal_lines', cnt0(db2, 'SELECT COUNT(*) c FROM journal_lines'), 0);
    // amounts tetap dihitung walau GL off (rasio disimpan).
    eq('S5: amounts.dibagi dihitung (residu 250000)', res.amounts.dibagi, 250_000);
    db2.close();
  }

  db.close();

  console.log('');
  console.log('test:shu (W4.4) - ' + passes + ' ok, ' + failures + ' fail');
  if (failures > 0) process.exit(1);
}

main();
