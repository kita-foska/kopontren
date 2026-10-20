/**
 * W8 Item 5 (suite #41) - test RAT (laporan tahunan, paparan only).
 * Node langsung (type-stripping, pola test-laporan.ts):
 * npm run test:rat. Harness in-memory node:sqlite.
 * Cakupan:
 *   (R1) golden tahun 2026: LKA per-tahun (neto/beban/ZIS/lain/bersih);
 *   (R2) LPE: pembuka = saldo 30xx akhir 2025 + SHU closing 2026 + alokasi;
 *   (R3) batas periode: entri 2025/2027 tidak ikut LKA/ZIS/SHU/LAK 2026;
 *   (R4) posisi = KUMULATIF s.d. 2027-01-01 (2025 ikut);
 *   (R5) SHU agregasi 2 periode + rasio_json (rusak -> 0);
 *   (R6) LAK: saldo awal 2026 = akhir 2025 + pergeseran kas sosial;
 *   (R7) tak seimbang -> flag_rekon15=true;
 *   (R8) tahun kosong -> payload nol, D=K tetap dihitung kumulatif;
 *   (R9) tahun invalid -> throw RAT_YEAR_INVALID.
 */
import { buildRat } from '../src/lib/laporan/rat.ts';
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

// DDL mirror skema v31: jurnal + coop_shu (hanya kolom yang dipakai buildRat;
// posisi reuses buildPosisi -- pola test-laporan.ts cukup journal_entries +
// journal_lines, di sini + coop_shu).
const DDL = [
  "CREATE TABLE IF NOT EXISTS journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z')",
  "CREATE TABLE IF NOT EXISTS journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))",
  "CREATE TABLE IF NOT EXISTS coop_shu(id TEXT PRIMARY KEY, period TEXT NOT NULL, shu_total INTEGER NOT NULL, cadangan_umum INTEGER, cadangan_khusus INTEGER, jasa_anggota INTEGER, dibagi INTEGER, rasio_json TEXT, created_by TEXT, created_at TEXT NOT NULL, UNIQUE(period))",
];

type SyncDb = import('node:sqlite').DatabaseSync;

async function freshDb(): Promise<SyncDb> {
  const mod = await import('node:sqlite');
  const db = new mod.DatabaseSync(':memory:');
  for (const s of DDL) db.exec(s);
  return db;
}

function makeShim(db: SyncDb): QueryDb {
  // node:sqlite sinkron -> dibungkus Promise agar cocok dgn QueryDb.
  return {
    prepare: (q: string) => ({
      all: async (...a: string[]) => db.prepare(q).all(...a),
      get: async (...a: string[]) => db.prepare(q).get(...a),
    }),
  } as unknown as QueryDb;
}

/** Jurnal seimbang 2 kaki: DR debitAcct / CR creditAcct, nominal sama. */
function post(db: SyncDb, id: string, date: string, da: string, ca: string, amt: number): void {
  db
    .prepare("INSERT INTO journal_entries (id, ref_table, ref_id, entry_date) VALUES (?, 'pos', ?, ?)")
    .run(id, id, date);
  db
    .prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, ?, 0, 't')")
    .run(id, da, amt);
  db
    .prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, 0, ?, 't')")
    .run(id, ca, amt);
}

/** Jurnal seimbang 2 kaki dgn type & ref_table eksplisit (bucket LPE). */
function postX(
  db: SyncDb,
  id: string,
  date: string,
  type: string,
  refTable: string,
  da: string,
  ca: string,
  amt: number
): void {
  db
    .prepare(
      "INSERT INTO journal_entries (id, ref_table, ref_id, entry_date, type) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, refTable, id, date, type);
  db
    .prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, ?, 0, 't')")
    .run(id, da, amt);
  db
    .prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, 0, ?, 't')")
    .run(id, ca, amt);
}

/** Jurnal TAK seimbang (uji rekon #15): hanya kaki debit. */
function postUnbalanced(db: SyncDb, id: string, date: string, acct: string, amt: number): void {
  db
    .prepare("INSERT INTO journal_entries (id, ref_table, ref_id, entry_date) VALUES (?, 'pos', ?, ?)")
    .run(id, id, date);
  db
    .prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, ?, 0, 't')")
    .run(id, acct, amt);
}

function shu(
  db: SyncDb,
  period: string,
  total: number,
  cadUmum: number,
  cadKhusus: number,
  jasa: number,
  dibagi: number,
  rasioJson: string | null = null
): void {
  db
    .prepare(
      "INSERT INTO coop_shu (id, period, shu_total, cadangan_umum, cadangan_khusus, jasa_anggota, dibagi, rasio_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '1970-01-01T00:00:00Z')"
    )
    .run(period, period, total, cadUmum, cadKhusus, jasa, dibagi, rasioJson);
}

async function main(): Promise<void> {
  // (R1)-(R8) golden: tahun buku 2025 (pembuka) + 2026 + 2027 (batas).
  {
    const db = await freshDb();
    const shim = makeShim(db);

    // Saldo pembuka 2025 (s.d. akhir 2025):
    post(db, 'O01', '2025-03-01', '1010', '3010', 10_000_000); // modal -> kas toko
    post(db, 'O02', '2025-06-15', '1010', '4010', 2_000_000); // omzet 2025
    post(db, 'O03', '2025-11-01', '1100', '4090', 500_000); // ZIS masuk 2025 (kas sosial debet)
    post(db, 'X02', '2025-02-02', '5030', '1010', 700_000); // beban 2025 (beban debet)

    // Tahun 2026:
    post(db, 'E01', '2026-02-01', '1010', '4010', 5_000_000); // omzet
    post(db, 'E02', '2026-02-01', '4020', '1010', 200_000); // diskon
    post(db, 'E03', '2026-03-05', '1020', '4010', 1_000_000); // omzet bank
    post(db, 'E04', '2026-03-05', '5010', '1010', 3_000_000); // HPP bruto (5010 debet)
    post(db, 'E05', '2026-04-01', '1020', '5020', 100_000); // retur COGS (KREDIT 5020)
    post(db, 'E06', '2026-05-01', '5030', '1010', 400_000); // beban (5030 debet)
    post(db, 'E07', '2026-06-01', '5040', '1020', 150_000); // beban (5040 debet)
    post(db, 'E08', '2026-07-01', '1100', '4090', 300_000); // ZIS masuk (kas sosial debet)
    post(db, 'E09', '2026-08-01', '5100', '1100', 150_000); // infak keluar (5100 debet)
    post(db, 'E11', '2026-10-01', '1010', '4050', 250_000); // ijarah (pendapatan lain)
    post(db, 'E12', '2026-11-01', '1010', '1020', 500_000); // transfer antar-kas
    // Alokasi SHU ke cadangan/jasa/dibagi (3020 -> 3030/3050/3060, W4.4 jurnal).
    postX(db, 'A01', '2026-12-31', 'normal', 'coop', '3020', '3030', 40_000);
    postX(db, 'A02', '2026-12-31', 'normal', 'coop', '3020', '3050', 60_000);
    postX(db, 'A03', '2026-12-31', 'normal', 'coop', '3020', '3060', 50_000);

    // Batas: entri 2027 (di luar jendela 2026).
    post(db, 'X01', '2027-01-05', '1010', '4010', 9_000_000);

    // SHU input admin: 2 periode 2026 + 1 periode 2025 (di luar).
    shu(db, '2026-Q1', 100_000, 30_000, 10_000, 40_000, 20_000, '{"cad_umum":30,"cad_khusus":10,"jasa":40,"dibagi":20}');
    shu(db, '2026-Q4', 80_000, 0, 0, 0, 80_000, null);
    shu(db, '2025-AWAL', 50_000, 50_000, 0, 0, 0, null);

    const p = await buildRat(shim, '2026');

    // (R0) payload dasar.
    eq('R0: tahun', p.tahun, '2026');
    eq('R0: period_from', p.period_from, '2026-01-01');
    eq('R0: period_to', p.period_to, '2027-01-01');

    // (R1) LKA per-tahun: neto = (5.0jt + 1.0jt) - 200rb - 0 = 5.8jt;
    //   HPP neto = 3.0jt - 0.1jt = 2.9jt; kotor = 2.9jt;
    //   beban = 400rb + 150rb = 550rb (5030+5040; 5050 closed);
    //   sebelum ZIS = 2.35jt; ZIS (5090+5100+6030) = 150rb;
    //   lain (4050 250rb + 4090 300rb, BOTH credit-side, SUMMED) = 550rb;
    //   bersih = 2.35jt - 150rb + 550rb = 2.75jt.
    eq('R1: pendapatan bruto', p.lka.pendapatan.bruto, 6_000_000);
    eq('R1: pendapatan neto', p.lka.pendapatan.neto, 5_800_000);
    eq('R1: HPP neto', p.lka.hpp.neto, 2_900_000);
    eq('R1: laba kotor', p.lka.laba_kotor, 2_900_000);
    eq('R1: beban', p.lka.beban, 550_000);
    eq('R1: laba sebelum ZIS', p.lka.laba_sebelum_zis, 2_350_000);
    eq('R1: ZIS (GL)', p.lka.zis, 150_000);
    eq('R1: pendapatan lain (4050+4090)', p.lka.pendapatan_lainnya.total, 550_000);
    eq('R1: laba bersih', p.lka.laba_bersih, 2_750_000);

    // (R2) LPE: pembuka 3010 = 10jt (akhir 2025); alokasi 2026; distribusi 0.
    //   Alokasi total = NETTING per-30xx (3020 debet -150rb, 3030+3050+3060
    //   kredit +150rb) -> total kolom = 0 (konsisten pola lpe.ts).
    const col = (code: string) => p.lpe.columns.find((c) => c.code === code)!;
    eq('R2: 3010 pembuka', col('3010').pembuka, 10_000_000);
    eq('R2: 3030 penutup', col('3030').penutup, 40_000);
    eq('R2: 3050 penutup', col('3050').penutup, 60_000);
    eq('R2: 3060 penutup', col('3060').penutup, 50_000);
    eq('R2: 3020 alokasi (debet)', col('3020').alokasi, -150_000);
    eq('R2: total alokasi (netting 30xx)', p.lpe.totals.alokasi, 0);
    eq('R2: distribusi (placeholder)', p.lpe.totals.distribusi, 0);
    eq('R2: full_balance_ekuitas (kumulatif)', p.lpe.full_balance_ekuitas, 10_000_000);

    // (R3) batas periode: X01 (2027) + X02/O02 (2025) tidak ikut LKA 2026.
    ok('R3: 4010 tak memuat 9jt (2027)', p.lka.pendapatan.bruto === 6_000_000);
    ok('R3: 5030 tak memuat beban 2025 (700rb)', p.lka.beban === 550_000);

    // (R4) posisi KUMULATIF s.d. 2027-01-01 (ikut 2025 + 2026, tak 2027).
    ok('R4: posisi seimbang (kumulatif)', p.posisi.d_k.balanced === true);
    eq('R4: laba_rugi_berjalan kumulatif', p.posisi.totals.laba_rugi_berjalan, 4_550_000);

    // (R5) SHU: 2 periode 2026 (100rb + 80rb) + rasio (Q4 null -> 0).
    eq('R5: shu counts', p.shu.counts, 2);
    eq('R5: shu total', p.shu.total_shu, 180_000);
    eq('R5: cadangan umum', p.shu.totals.cadangan_umum, 30_000);
    eq('R5: cadangan khusus', p.shu.totals.cadangan_khusus, 10_000);
    eq('R5: jasa anggota', p.shu.totals.jasa_anggota, 40_000);
    eq('R5: dibagi', p.shu.totals.dibagi, 100_000);
    eq('R5: rasio Q1 (json)', p.shu.rows[0].rasio.jasa, 40);
    eq('R5: rasio Q4 (null -> 0)', p.shu.rows[1].rasio.jasa, 0);

    // (R6) LAK: pembuka = saldo akhir 2025; kas sosial 2026 pergeseran.
    const k1010 = p.lak.kas.find((k) => k.code === '1010')!;
    const k1020 = p.lak.kas.find((k) => k.code === '1020')!;
    eq('R6: 1010 pembuka (akhir 2025)', k1010.pembuka, 11_300_000);
    eq('R6: 1020 pembuka (akhir 2025)', k1020.pembuka, 0);
    eq('R6: 1100 pembuka', p.lak.kas_sosial.pembuka, 500_000);
    eq('R6: 1100 penutup', p.lak.kas_sosial.penutup, 650_000);
    ok(
      'R6: footer seimbang',
      p.lak.footer.saldo_awal + p.lak.footer.neto_aktivitas + p.lak.footer.pergeseran_kas_sosial === p.lak.footer.saldo_akhir
    );

    // (R7) D=K global: semua entri seimbang -> balanced.
    ok('R7: D=K balanced', p.d_k.balanced === true);
    eq('R7: gap = 0', p.d_k.gap, 0);
    eq('R7: flag_rekon15 = false', p.flag_rekon15 ? 1 : 0, 0);

    // (R8) ZIS per-tahun: diterima 4090 kredit 2026 = 300rb; disalurkan 5100 = 150rb.
    eq('R8: zis diterima', p.zis.diterima, 300_000);
    eq('R8: zis disalurkan', p.zis.disalurkan, 150_000);
  }

  // (R7b) tak seimbang -> flag_rekon15=true (proxy rekon #15 kumulatif).
  {
    const db = await freshDb();
    const shim = makeShim(db);
    post(db, 'E01', '2026-02-01', '1010', '4010', 1_000_000);
    postUnbalanced(db, 'U01', '2026-03-01', '5030', 400_000);
    const p = await buildRat(shim, '2026');
    ok('R7b: tak seimbang -> flag_rekon15', p.flag_rekon15 === true);
    eq('R7b: gap', p.d_k.gap, 400_000);
  }

  // (R8b) tahun kosong (tanpa entri, tanpa shu): payload nol, D=K seimbang.
  {
    const db = await freshDb();
    const shim = makeShim(db);
    const p = await buildRat(shim, '2026');
    eq('R8b: laba bersih = 0', p.lka.laba_bersih, 0);
    eq('R8b: shu counts = 0', p.shu.counts, 0);
    eq('R8b: zis diterima = 0', p.zis.diterima, 0);
    ok('R8b: D=K tetap balanced (kosong)', p.d_k.balanced === true);
    eq('R8b: posisi total aset = 0', p.posisi.totals.total_aset, 0);
  }

  // (R9) tahun invalid -> throw RAT_YEAR_INVALID.
  {
    const db = await freshDb();
    const shim = makeShim(db);
    for (const bad of ['202', '20265', 'abc', '', '20 26']) {
      let threw = false;
      let msg = '';
      try {
        await buildRat(shim, bad);
      } catch (e) {
        threw = true;
        msg = e instanceof Error ? e.message : '';
      }
      ok('R9: tahun invalid "' + bad + '" -> throw RAT_YEAR_INVALID', threw && msg.includes('RAT_YEAR_INVALID'), 'msg=' + msg);
    }
  }

  console.log('\n' + passes + ' lolos, ' + failures + ' gagal.');
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

