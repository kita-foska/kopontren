/**
 * F3.4+ W2.2/W2.3 - test Laporan Posisi formal (posisi.ts) + Laba-Rugi
 * (lka.ts). Node langsung (type-stripping, Node >= 23.6/v24):
 * npm run test:laporan. Harness in-memory node:sqlite, pola
 * test-neraca.ts/test-gl.ts.
 * Cakupan Posisi: (A) ledger seimbang + invariant; (B) batas periode;
 * (C) tak seimbang -> flag_rekon15; (D) DB kosong.
 * Cakupan LKA: (LA) golden seimbang (neto/HPP/kotor/beban/sebelum ZIS/
 *   ZIS/bersih + netting 5010-5020 + MEMO tak dijumlahkan);
 *   (LB) batas periode; (LC) 5050 denda CLOSED tidak dihitung;
 *   (LD) MEMO eksplisit tak masuk laba_bersih.
 */
import { buildPosisi } from '../src/lib/laporan/posisi.ts';
import { buildLka } from '../src/lib/laporan/lka.ts';
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

// DDL mirror src/db.ts (v21): hanya kolom yang dipakai buildPosisi.
const DDL = [
  "CREATE TABLE IF NOT EXISTS journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z')",
  "CREATE TABLE IF NOT EXISTS journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))",
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
  db.prepare("INSERT INTO journal_entries (id, ref_table, ref_id, entry_date) VALUES (?, 'pos', ?, ?)").run(id, id, date);
  db.prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, ?, 0, 't')").run(id, da, amt);
  db.prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, 0, ?, 't')").run(id, ca, amt);
}

/** Jurnal TAK seimbang (uji rekon #15): hanya kaki debit. */
function postUnbalanced(db: SyncDb, id: string, date: string, acct: string, amt: number): void {
  db.prepare("INSERT INTO journal_entries (id, ref_table, ref_id, entry_date) VALUES (?, 'pos', ?, ?)").run(id, id, date);
  db.prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, ?, 0, 't')").run(id, acct, amt);
}

async function main(): Promise<void> {
  // (A) ledger seimbang, semua grup.
  {
    const db = await freshDb();
    const D = '2026-08-15';
    post(db, 'E01', D, '1010', '3010', 10_000_000);
    post(db, 'E02', D, '1050', '1010', 5_000_000);
    post(db, 'E03', D, '5040', '1060', 400_000);
    post(db, 'E04', D, '1080', '1010', 2_000_000);
    post(db, 'E05', D, '1010', '4010', 3_000_000);
    post(db, 'E06', D, '5010', '1010', 800_000);
    post(db, 'E07', D, '5030', '1010', 300_000);
    post(db, 'E08', D, '5010', '2010', 600_000);
    post(db, 'E09', D, '1010', '2050', 500_000);
    post(db, 'E10', D, '1100', '2090', 200_000);
    post(db, 'E11', D, '1120', '4100', 300_000);
    post(db, 'E12', D, '6020', '3010', 150_000);
    const p = await buildPosisi(makeShim(db), '2026-10-01');

    eq('A: aset_lancar = 5.600.000', p.sections.aset_lancar, 5_600_000);
    eq('A: aset_tetap_neto = 5.000.000 - 400.000', p.sections.aset_tetap_neto, 4_600_000);
    eq('A: investasi_syariah = 2.000.000', p.sections.investasi_syariah, 2_000_000);
    eq('A: total_aset = 12.200.000', p.totals.total_aset, 12_200_000);
    const w = p.sections.wakaf_memo;
    eq('A: wakaf_memo panjang = 2', w.length, 2);
    eq('A: wakaf 1120 = 300.000', w.find((r) => r.code === '1120')?.value, 300_000);
    eq('A: wakaf 6020 = 150.000', w.find((r) => r.code === '6020')?.value, 150_000);
    const wakafTotal = w.reduce((s, r) => s + r.value, 0);
    eq('A: wakaf_total = 450.000 (bukan total_aset)', wakafTotal, 450_000);

    eq('A: kewajiban_lancar = 600.000', p.sections.kewajiban_lancar, 600_000);
    eq('A: kewajiban_anggota = 500.000', p.sections.kewajiban_anggota, 500_000);
    eq('A: kewajiban_zis = 200.000', p.sections.kewajiban_zis, 200_000);
    eq('A: total_kewajiban = 1.300.000', p.totals.total_kewajiban, 1_300_000);

    eq('A: total_ekuitas = 10.150.000', p.totals.total_ekuitas, 10_150_000);
    eq('A: 3010 = 10.150.000', p.sections.ekuitas.find((r) => r.code === '3010')?.value, 10_150_000);
    eq('A: laba_rugi_berjalan = 1.200.000', p.totals.laba_rugi_berjalan, 1_200_000);
    eq('A: total_ekuitas_menutup = 11.350.000', p.totals.total_ekuitas_menutup, 11_350_000);

    eq('A: total_debit = 23.250.000', p.d_k.total_debit, 23_250_000);
    eq('A: total_credit = 23.250.000', p.d_k.total_credit, 23_250_000);
    ok('A: D=K seimbang (gap 0)', p.d_k.balanced === true && p.d_k.gap === 0);
    eq('A: flag_rekon15 = false', p.flag_rekon15, false);
    ok(
      'A: invariant aset+wakaf = kewajib+ekuitas_menutup',
      p.totals.total_aset + wakafTotal === p.totals.total_kewajiban + p.totals.total_ekuitas_menutup,
      p.totals.total_aset + wakafTotal + ' vs ' + (p.totals.total_kewajiban + p.totals.total_ekuitas_menutup)
    );
  }

  // (B) batas periode: entry_date < at (strict).
  {
    const db = await freshDb();
    post(db, 'B1', '2026-09-30', '1010', '3010', 100_000); // IN (< at)
    post(db, 'B2', '2026-10-01', '1010', '3010', 500_000); // OUT (= at)
    post(db, 'B3', '2026-10-02', '1010', '3010', 900_000); // OUT (> at)
    const p = await buildPosisi(makeShim(db), '2026-10-01');
    eq('B: aset_lancar hanya B1 = 100.000', p.sections.aset_lancar, 100_000);
    eq('B: total_ekuitas hanya B1 = 100.000', p.totals.total_ekuitas, 100_000);
    eq('B: total_debit hanya B1 = 100.000', p.d_k.total_debit, 100_000);
    ok('B: D=K tetap seimbang', p.d_k.balanced === true && p.flag_rekon15 === false);
  }

  // (C) ledger tak seimbang -> flag_rekon15.
  {
    const db = await freshDb();
    post(db, 'C1', '2026-08-01', '1010', '3010', 1_000_000); // seimbang
    postUnbalanced(db, 'C2', '2026-08-02', '1030', 250_000); // kaki debit saja
    const p = await buildPosisi(makeShim(db), '2026-10-01');
    eq('C: total_debit = 1.250.000', p.d_k.total_debit, 1_250_000);
    eq('C: total_credit = 1.000.000', p.d_k.total_credit, 1_000_000);
    eq('C: gap = 250.000', p.d_k.gap, 250_000);
    ok('C: D=K TIDAK seimbang', p.d_k.balanced === false);
    eq('C: flag_rekon15 = true', p.flag_rekon15, true);
  }

  // (D) DB kosong -> semua nol, 0=0 seimbang.
  {
    const db = await freshDb();
    const p = await buildPosisi(makeShim(db), '2026-10-01');
    eq('D: total_aset = 0', p.totals.total_aset, 0);
    eq('D: total_kewajiban = 0', p.totals.total_kewajiban, 0);
    eq('D: total_ekuitas_menutup = 0', p.totals.total_ekuitas_menutup, 0);
    eq('D: laba_rugi_berjalan = 0', p.totals.laba_rugi_berjalan, 0);
    eq('D: wakaf_memo 2 baris', p.sections.wakaf_memo.length, 2);
    eq('D: ekuitas 7 baris (3010..3070)', p.sections.ekuitas.length, 7);
    ok('D: 0=0 seimbang, flag_rekon15 = false', p.d_k.balanced === true && p.flag_rekon15 === false && p.d_k.total_debit === 0);
  }

  // (LA) LKA golden: ledger seimbang -> semua garis P&L Sek.5.2 benar,
  // netting HPP (5010 gross - 5020) benar, dan MEMO tidak ikut dijumlahkan.
  {
    const db = await freshDb();
    const D = '2026-08-15';
    // PENDAPATAN: 4010 bruto (kredit), 4020 diskon + 4030 retur (debit).
    post(db, 'LR1', D, '1010', '4010', 8_000_000); // CR 4010 = 8.000.000
    post(db, 'LR2', D, '4020', '1010', 500_000); // DR 4020 = 500.000
    post(db, 'LR3', D, '4030', '1010', 300_000); // DR 4030 = 300.000
    // HPP: 5010 gross (debit) + 5020 retur COGS (credit, RETUR_HPP; netting V2-2).
    // LC2 mirror live GL: journalForSalesReturn = DR 1040 / CR 5020.
    post(db, 'LC1', D, '5010', '1010', 4_000_000); // DR 5010 = 4.000.000 (gross)
    post(db, 'LC2', D, '1040', '5020', 400_000); // DR 1040 / CR 5020 (live GL)
    // BEBAN: 5030+5040+5060+5070+5080 (5050 denda sengaja TIDAK ada).
    post(db, 'LB1', D, '5030', '1010', 600_000);
    post(db, 'LB2', D, '5040', '1010', 350_000);
    post(db, 'LB3', D, '5060', '1010', 150_000);
    post(db, 'LB4', D, '5070', '1010', 50_000);
    post(db, 'LB5', D, '5080', '1010', 200_000);
    // ZIS: 5090+5100+6030.
    post(db, 'LZ1', D, '5090', '1010', 250_000);
    post(db, 'LZ2', D, '5100', '1010', 100_000);
    post(db, 'LZ3', D, '6030', '1010', 200_000);
    // MEMO (TIDAK dijumlahkan ke laba bersih): 4040 ujrah, 2030 cashback, 3020 SHU.
    post(db, 'LM1', D, '1010', '4040', 120_000); // CR 4040
    post(db, 'LM2', D, '1010', '2030', 80_000); // CR 2030
    post(db, 'LM3', D, '1010', '3020', 900_000); // CR 3020

    const p = await buildLka(makeShim(db), '2026-10-01');

    eq('LA: pendapatan.neto = 7.200.000', p.pendapatan.neto, 7_200_000);
    eq('LA: hpp.bruto (5010) = 4.000.000', p.hpp.bruto, 4_000_000);
    eq('LA: hpp.retur (5020) = 400.000', p.hpp.retur, 400_000);
    eq('LA: hpp.neto = 5010 - 5020 = 3.600.000', p.hpp.neto, 3_600_000);
    eq('LA: laba_kotor = 7.200.000 - 3.600.000', p.laba_kotor, 3_600_000);
    eq('LA: beban = 1.350.000', p.beban, 1_350_000);
    eq('LA: laba_sebelum_zis = 2.250.000', p.laba_sebelum_zis, 2_250_000);
    eq('LA: zis = 550.000', p.zis, 550_000);
    eq('LA: laba_bersih = 1.700.000', p.laba_bersih, 1_700_000);

    // MEMO tampil dengan nilainya TAPI tidak masuk pendapatan/laba_bersih.
    const memo4040 = p.memo.find((r) => r.code === '4040');
    const memo2030 = p.memo.find((r) => r.code === '2030');
    const memo3020 = p.memo.find((r) => r.code === '3020');
    eq('LA: memo 4040 (ujrah) = 120.000', memo4040?.value, 120_000);
    eq('LA: memo 2030 (cashback) = 80.000', memo2030?.value, 80_000);
    eq('LA: memo 3020 (SHU) = 900.000', memo3020?.value, 900_000);
    // Pendapatan neto TIDAK menambah ujrah 4040 (harus tetap 7.200.000).
    ok(
      'LA: memo TIDAK masuk pendapatan neto (bukan 7.320.000)',
      p.pendapatan.neto === 7_200_000 && p.laba_bersih === 1_700_000
    );
    ok('LA: D=K seimbang, flag_rekon15 = false', p.d_k.balanced === true && p.flag_rekon15 === false);
  }

  // (LB) LKA batas periode: entry_date < at (strict), sama dgn posisi.
  {
    const db = await freshDb();
    post(db, 'L1', '2026-09-30', '1010', '4010', 1_000_000); // IN (< at)
    post(db, 'L2', '2026-10-01', '1010', '4010', 5_000_000); // OUT (= at)
    const p = await buildLka(makeShim(db), '2026-10-01');
    eq('LB: pendapatan.neto hanya L1 = 1.000.000', p.pendapatan.neto, 1_000_000);
    eq('LB: laba_bersih hanya L1 = 1.000.000', p.laba_bersih, 1_000_000);
    ok('LB: D=K tetap seimbang', p.d_k.balanced === true && p.flag_rekon15 === false);
  }

  // (LC) LKA: 5050 (denda) CLOSED -> tercatat di jurnal, TIDAK masuk Beban.
  {
    const db = await freshDb();
    post(db, 'LD1', '2026-08-15', '1010', '4010', 2_000_000); // pendapatan
    post(db, 'LD2', '2026-08-15', '5030', '1010', 300_000); // beban aktif
    post(db, 'LD3', '2026-08-15', '5050', '1010', 700_000); // denda CLOSED
    const p = await buildLka(makeShim(db), '2026-10-01');
    eq('LC: beban hanya 5030 = 300.000 (5050 tidak dihitung)', p.beban, 300_000);
    eq('LC: laba_bersih = 2.000.000 - 300.000 = 1.700.000 (5050 tidak mengurangi)', p.laba_bersih, 1_700_000);
    ok('LC: D=K tetap seimbang (5050 di-posting seimbang)', p.d_k.balanced === true);
  }

  // (LD) LKA: MEMO eksplisit -- laba_bersih tidak berubah walau ada memo.
  {
    const db = await freshDb();
    const D = '2026-08-15';
    post(db, 'LE1', D, '1010', '4010', 5_000_000); // neto 5.000.000
    const tanpaMemo = await buildLka(makeShim(db), '2026-10-01');
    eq('LD: laba_bersih tanpa memo = 5.000.000', tanpaMemo.laba_bersih, 5_000_000);
    // Tambahkan MEMO besar (4040 ujrah + 3020 SHU) -> laba_bersih TETAP.
    post(db, 'LE2', D, '1010', '4040', 1_000_000);
    post(db, 'LE3', D, '1010', '3020', 1_000_000);
    const denganMemo = await buildLka(makeShim(db), '2026-10-01');
    eq('LD: laba_bersih TETAP 5.000.000 setelah memo ditambah', denganMemo.laba_bersih, 5_000_000);
    ok(
      'LD: memo bertambah (4040=1.000.000, 3020=1.000.000) tapi tidak mengubah laba_bersih',
      denganMemo.memo.find((r) => r.code === '4040')?.value === 1_000_000 &&
        denganMemo.memo.find((r) => r.code === '3020')?.value === 1_000_000
    );
  }

  console.log('');
  console.log('test:laporan (W2.2+W2.3) - ' + passes + ' ok, ' + failures + ' fail');
  process.exit(failures > 0 ? 1 : 0);
}

main();

