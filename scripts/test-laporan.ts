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
 *   (LD) MEMO eksplisit tak masuk laba_bersih;
 *   (LE) W3.5+ cross-report: 4050-4100 (akad/wakaf) SUMMED ke laba_bersih
 *     -> lka.laba_bersih === posisi.laba_rugi_berjalan (dataset tanpa
 *     4040/6030); (LE2) universal: DGN 4040 (owner income, dikecualikan) +
 *     6030 (zakat, beban; posisi di-align: 4040 keluar, 6030 masuk) -> sama
 *     (residual 5020/5050/5100 bila terisi di GL).
 * Cakupan LPE: (LP1) golden (pembuka opening + SHU closing ke 3020 +
 *   alokasi coop 3020->3030/3050/3060 - distribusi placeholder 0 + D=K);
 *   (LP2) simpanan 2050/2060 = memo kewajiban, TIDAK ke ekuitas;
 *   (LP3) batas periode + flag_rekon15 bila tak seimbang; (LP4) DB kosong.
 * Cakupan LAK (W2.5): (L1) golden (pembuka opening + 3 aktivitas +
 *   transfer antar-kas + pergeseran kas sosial + identitas footer +
 *   rincian ZIS terpisah); (L2) batas periode; (L3) tak seimbang ->
 *   flag_rekon15; (L4) DB kosong; (L5) jurnal pembalik offset arus.
 * Cakupan CALK (W2.6, Sek.5.5): (C1) golden GL-only (item 4-8:
 *   piutang/hutang per akun, ekuitas + simpanan memo TIDAK ikut total,
 *   ZIS per jenis + per periode + memo wakaf 1120/6020, akad berjalan);
 *   (C2) batas periode; (C3) tak seimbang -> flag_rekon15; (C4) DB kosong.
 *   (C5) W3.3 akad_ringkas: ringkasan per jenis dari tabel akad (aktif/
 *   settled/saldo_aktif, OQ3) + tabel akad DDL di harness (mirror DDL_AKAD
 *   skema v23, test-akad.ts) + update footer (W2.6 -> W3.3).
 *   (Item 1-3 = teks statis panel klien; item 9 = input manual -- tak di
 *   payload, tak diuji di sini.)
 */
import { buildPosisi } from '../src/lib/laporan/posisi.ts';
import { buildLka } from '../src/lib/laporan/lka.ts';
import { buildLpe } from '../src/lib/laporan/lpe.ts';
import { buildLak } from '../src/lib/laporan/lak.ts';
import { buildCalk } from '../src/lib/laporan/calk.ts';
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
// W3.3: + tabel akad (DDL_AKAD skema v23, mirror test-akad.ts) utk
// buildCalk.akad_ringkas (item 8; QueryDb hanya baca -- butuh tabel ada).
const DDL = [
  "CREATE TABLE IF NOT EXISTS journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z')",
  "CREATE TABLE IF NOT EXISTS journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))",
  "CREATE TABLE IF NOT EXISTS akad(id TEXT PRIMARY KEY, type TEXT NOT NULL, counterparty TEXT NOT NULL, amount INTEGER NOT NULL, terms_json TEXT, status TEXT NOT NULL DEFAULT 'active', opened_at TEXT NOT NULL, settled_at TEXT, note TEXT, UNIQUE(type, counterparty, opened_at, amount))",
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

/** Jurnal seimbang 2 kaki dengan type & ref_table eksplisit (untuk bucket LPE:
 *  pembuka=opening, SHU=closing, alokasi=normal+coop). */
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
  db.prepare("INSERT INTO journal_entries (id, ref_table, ref_id, entry_date, type) VALUES (?, ?, ?, ?, ?)").run(id, refTable, id, date, type);
  db.prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, ?, 0, 't')").run(id, da, amt);
  db.prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES (?, ?, 0, ?, 't')").run(id, ca, amt);
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

  // (LE) W3.5+ cross-report: pendapatan lain koperasi 4050-4100 (akad/wakaf)
  // SUMMED ke lka.laba_bersih -> lka.laba_bersih == posisi.laba_rugi_berjalan.
  // Dataset: akad + wakaf income; TANPA 4040/6030/5050 -> equality holds.
  // (Residual: bila 4040 owner-ujrah atau 6030 zakat != 0, keduanya divergensi
  //  posisi -- di luar cakupan fix ini; lihat catatan header + route note.)
  {
    const db = await freshDb();
    const D = '2026-08-15';
    post(db, 'LE1', D, '1010', '4010', 1_000_000); // pendapatan neto 1.000.000
    post(db, 'LE2', D, '1010', '4050', 500_000); // ijarah (akad)
    post(db, 'LE3', D, '2040', '4060', 400_000); // laba murabahah
    post(db, 'LE4', D, '1080', '4070', 300_000); // bagi hasil mudharabah
    post(db, 'LE5', D, '1090', '4080', 200_000); // bagi hasil musyarakah
    post(db, 'LE6', D, '1010', '4090', 100_000); // ZIS masuk
    post(db, 'LE7', D, '1120', '4100', 600_000); // wakaf masuk (D1120/K4100)
    const at = '2026-10-01';
    const lka = await buildLka(makeShim(db), at);
    const pos = await buildPosisi(makeShim(db), at);
    eq('LE: pendapatan_lainnya.total = 2.100.000', lka.pendapatan_lainnya.total, 2_100_000);
    eq('LE: 4050 ijarah = 500.000', lka.pendapatan_lainnya.rows.find((r) => r.code === '4050')?.value, 500_000);
    eq('LE: 4060 laba murabahah = 400.000', lka.pendapatan_lainnya.rows.find((r) => r.code === '4060')?.value, 400_000);
    eq('LE: 4070 bagi hasil mudharabah = 300.000', lka.pendapatan_lainnya.rows.find((r) => r.code === '4070')?.value, 300_000);
    eq('LE: 4080 bagi hasil musyarakah = 200.000', lka.pendapatan_lainnya.rows.find((r) => r.code === '4080')?.value, 200_000);
    eq('LE: 4090 ZIS masuk = 100.000', lka.pendapatan_lainnya.rows.find((r) => r.code === '4090')?.value, 100_000);
    eq('LE: 4100 wakaf masuk = 600.000', lka.pendapatan_lainnya.rows.find((r) => r.code === '4100')?.value, 600_000);
    eq('LE: lka.laba_bersih = 3.100.000 (1.000.000 + 2.100.000)', lka.laba_bersih, 3_100_000);
    eq('LE: posisi.laba_rugi_berjalan = 3.100.000', pos.totals.laba_rugi_berjalan, 3_100_000);
    ok(
      'LE: lka.laba_bersih === posisi.laba_rugi_berjalan (akad+wakaf, tanpa 4040/6030/5050)',
      lka.laba_bersih === pos.totals.laba_rugi_berjalan,
      lka.laba_bersih + ' vs ' + pos.totals.laba_rugi_berjalan
    );
    ok('LE: D=K seimbang, flag_rekon15 = false', lka.d_k.balanced === true && lka.flag_rekon15 === false);
  }

  // (LE2) W3.5+ universal: DGN 4040 (owner income, dikecualikan) + 6030
  // (zakat, beban). Posisi di-align (PENDAPATAN tanpa 4040, BEBAN dgn 6030)
  // -> lka.laba_bersih MAH == posisi.laba_rugi_berjalan (residual 5020/5100/5050).
  {
    const db = await freshDb();
    const D = '2026-08-15';
    post(db, 'L2A', D, '1010', '4010', 1_000_000); // pendapatan neto
    post(db, 'L2B', D, '1010', '4040', 200_000); // ujrah konsinyasi (owner income)
    post(db, 'L2C', D, '1010', '4050', 100_000); // ijarah (akad)
    post(db, 'L2D', D, '6030', '1010', 30_000); // zakat tijarah (beban)
    const at = '2026-10-01';
    const lka = await buildLka(makeShim(db), at);
    const pos = await buildPosisi(makeShim(db), at);
    // lka: (1.000.000 - 0 - 0) - zis(6030=30.000) + other(4050=100.000)
    //      = 1.070.000; 4040 (200.000) TIDAK ikut (memo owner income).
    eq('LE2: lka.laba_bersih = 1.070.000 (4040 excluded, 6030 beban)', lka.laba_bersih, 1_070_000);
    // posisi: SUM 4xxx (tanpa 4040) - SUM beban (dgn 6030)
    //        = (1.000.000 + 100.000) - 30.000 = 1.070.000.
    eq('LE2: posisi.laba_rugi_berjalan = 1.070.000 (4040 excluded, 6030 beban)', pos.totals.laba_rugi_berjalan, 1_070_000);
    ok(
      'LE2: lka.laba_bersih === posisi.laba_rugi_berjalan (UNIVERSAL: dgn 4040 + 6030)',
      lka.laba_bersih === pos.totals.laba_rugi_berjalan,
      lka.laba_bersih + ' vs ' + pos.totals.laba_rugi_berjalan
    );
    ok('LE2: D=K seimbang, flag_rekon15 = false', lka.d_k.balanced === true && lka.flag_rekon15 === false && pos.d_k.balanced === true);
  }

  // (LP1) LPE golden: pembuka (opening) + SHU (closing ke 3020) + Alokasi
  // (coop normal: 3020 -> 3030/3050/3060) - distribusi (placeholder 0).
  {
    const db = await freshDb();
    const D = '2026-08-15';
    // Pembuka (opening): 3010 modal anggota = 10.000.000 (kredit).
    postX(db, 'P1', D, 'opening', 'coop', '1010', '3010', 10_000_000);
    // SHU (closing): 3020 = 900.000 (kredit).
    postX(db, 'P2', D, 'closing', 'pos', '1010', '3020', 900_000);
    // Alokasi SHU (coop normal): 3020 turun, 3030/3050/3060 naik.
    postX(db, 'P3', D, 'normal', 'coop', '3020', '3030', 400_000);
    postX(db, 'P4', D, 'normal', 'coop', '3020', '3050', 300_000);
    postX(db, 'P5', D, 'normal', 'coop', '3020', '3060', 200_000);
    const p = await buildLpe(makeShim(db), '2026-10-01');
    const c3010 = p.columns.find((c) => c.code === '3010')!;
    const c3020 = p.columns.find((c) => c.code === '3020')!;
    const c3030 = p.columns.find((c) => c.code === '3030')!;
    const c3050 = p.columns.find((c) => c.code === '3050')!;
    const c3060 = p.columns.find((c) => c.code === '3060')!;
    eq('LP1: 3010 pembuka = 10.000.000', c3010.pembuka, 10_000_000);
    eq('LP1: 3010 penutup = 10.000.000', c3010.penutup, 10_000_000);
    eq('LP1: 3020 shu = 900.000', c3020.shu, 900_000);
    eq('LP1: 3020 alokasi = -900.000 (turun)', c3020.alokasi, -900_000);
    eq('LP1: 3020 penutup = 0 (SHU seluruhnya dialokasikan)', c3020.penutup, 0);
    eq('LP1: 3030 penutup = 400.000', c3030.penutup, 400_000);
    eq('LP1: 3050 penutup = 300.000', c3050.penutup, 300_000);
    eq('LP1: 3060 penutup = 200.000', c3060.penutup, 200_000);
    eq('LP1: totals.pembuka = 10.000.000', p.totals.pembuka, 10_000_000);
    eq('LP1: totals.shu = 900.000', p.totals.shu, 900_000);
    eq('LP1: totals.alokasi = 0 (wash antar akun ekuitas)', p.totals.alokasi, 0);
    eq('LP1: totals.distribusi = 0 (placeholder)', p.totals.distribusi, 0);
    eq('LP1: totals.penutup = 10.900.000 (pembuka + SHU)', p.totals.penutup, 10_900_000);
    ok(
      'LP1: full_balance_ekuitas = totals.penutup = 10.900.000 (SHU naik ekuitas)',
      p.full_balance_ekuitas === p.totals.penutup && p.full_balance_ekuitas === 10_900_000,
      p.full_balance_ekuitas + ' vs ' + p.totals.penutup
    );
    ok('LP1: distribusi semua kolom = 0 (placeholder)', p.columns.every((c) => c.distribusi === 0));
    ok('LP1: D=K seimbang, flag_rekon15 = false', p.d_k.balanced === true && p.flag_rekon15 === false);
  }

  // (LP2) LPE: simpanan 2050/2060 = kewajiban -> memo saja, TIDAK ke ekuitas.
  {
    const db = await freshDb();
    const D = '2026-08-15';
    post(db, 'M1', D, '1010', '2050', 500_000); // CR 2050
    post(db, 'M2', D, '1010', '2060', 200_000); // CR 2060
    const p = await buildLpe(makeShim(db), '2026-10-01');
    eq('LP2: memo simpanan 2050 = 500.000', p.memos.simpanan.find((s) => s.code === '2050')?.value, 500_000);
    eq('LP2: memo simpanan 2060 = 200.000', p.memos.simpanan.find((s) => s.code === '2060')?.value, 200_000);
    eq('LP2: memo simpanan 2070 = 0', p.memos.simpanan.find((s) => s.code === '2070')?.value, 0);
    eq('LP2: simpanan_total = 700.000', p.memos.simpanan_total, 700_000);
    eq('LP2: totals.penutup ekuitas = 0 (simpanan bukan ekuitas)', p.totals.penutup, 0);
    eq('LP2: full_balance_ekuitas = 0', p.full_balance_ekuitas, 0);
    ok('LP2: 7 kolom ekuitas (30xx) di LPE', p.columns.length === 7);
  }

  // (LP3) LPE batas periode (entry_date < at) + rekon #15 (flag_rekon15).
  {
    const db = await freshDb();
    postX(db, 'B1', '2026-09-30', 'opening', 'coop', '1010', '3010', 100_000); // IN (< at)
    postX(db, 'B2', '2026-10-01', 'opening', 'coop', '1010', '3010', 500_000); // OUT (= at)
    let p = await buildLpe(makeShim(db), '2026-10-01');
    eq('LP3: 3010 pembuka hanya B1 = 100.000', p.columns.find((c) => c.code === '3010')!.pembuka, 100_000);
    ok('LP3: D=K seimbang', p.d_k.balanced === true && p.flag_rekon15 === false);
    // Tak seimbang -> flag_rekon15.
    postUnbalanced(db, 'U1', '2026-08-02', '1030', 250_000);
    p = await buildLpe(makeShim(db), '2026-10-01');
    eq('LP3: gap = 250.000', p.d_k.gap, 250_000);
    ok('LP3: D=K TIDAK seimbang, flag_rekon15 = true', p.d_k.balanced === false && p.flag_rekon15 === true);
  }

  // (LP4) LPE DB kosong -> semua kolom 0, balanced true (0=0).
  {
    const db = await freshDb();
    const p = await buildLpe(makeShim(db), '2026-10-01');
    eq('LP4: 7 kolom', p.columns.length, 7);
    ok('LP4: semua penutup 0', p.columns.every((c) => c.penutup === 0));
    eq('LP4: simpanan_total = 0', p.memos.simpanan_total, 0);
    ok('LP4: 0=0 seimbang, flag_rekon15 = false', p.d_k.balanced === true && p.flag_rekon15 === false && p.d_k.total_debit === 0);
  }

  // (L1) LAK golden: pembuka opening + 3 aktivitas + transfer antar-kas
  // + pergeseran kas sosial + identitas footer (Sek.5.4).
  {
    const db = await freshDb();
    const D = '2026-08-15';
    // Pembuka (type='opening') -> saldo awal, BUKAN arus.
    postX(db, 'L-O1', '2026-08-01', 'opening', 'coop', '1010', '3010', 10_000_000);
    postX(db, 'L-O2', '2026-08-01', 'opening', 'coop', '1020', '3010', 500_000);
    postX(db, 'L-O3', '2026-08-01', 'opening', 'coop', '1100', '2090', 200_000);
    // Arus usaha: operasional / investasi / pendanaan.
    post(db, 'L-K1', D, '1010', '4010', 3_000_000); // DR 1010: op masuk 3.000.000
    post(db, 'L-K2', D, '5030', '1010', 500_000); // CR 1010: op keluar 500.000
    post(db, 'L-I1', D, '1050', '1010', 2_000_000); // CR 1010: inv keluar 2.000.000
    post(db, 'L-P1', D, '1010', '3010', 1_000_000); // DR 1010: pendanaan masuk 1.000.000
    // Transfer antar-kas 1010->1020 (bukan aktivitas).
    post(db, 'L-T1', D, '1020', '1010', 500_000);
    // Kas sosial 1100: ZIS masuk/keluar + pergeseran 1010->1100.
    post(db, 'L-Z1', D, '1100', '4090', 300_000); // ZIS masuk (4090 infak)
    post(db, 'L-Z2', D, '5090', '1100', 150_000); // zakat keluar (5090)
    post(db, 'L-Z3', D, '1100', '1010', 200_000); // pergeseran 1010->1100 (200.000)
    const l = await buildLak(makeShim(db), '2026-10-01');
    const k1010 = l.kas.find((r) => r.code === '1010')!;
    const k1020 = l.kas.find((r) => r.code === '1020')!;
    eq('L1: 1010 pembuka = 10.000.000', k1010.pembuka, 10_000_000);
    eq('L1: 1010 masuk = 4.000.000 (op 3.000.000 + pend 1.000.000)', k1010.masuk, 4_000_000);
    eq('L1: 1010 keluar = 2.500.000 (op 500.000 + inv 2.000.000)', k1010.keluar, 2_500_000);
    eq('L1: 1010 transfer = -700.000 (T1 -500.000, Z3 -200.000)', k1010.transfer, -700_000);
    eq('L1: 1010 neto = 800.000', k1010.neto, 800_000);
    eq('L1: 1010 penutup = 10.800.000', k1010.penutup, 10_800_000);
    eq('L1: 1020 pembuka = 500.000', k1020.pembuka, 500_000);
    eq('L1: 1020 transfer = 500.000', k1020.transfer, 500_000);
    eq('L1: 1020 penutup = 1.000.000', k1020.penutup, 1_000_000);
    eq('L1: op masuk = 3.000.000', l.aktivitas.operasional.masuk, 3_000_000);
    eq('L1: op keluar = 500.000', l.aktivitas.operasional.keluar, 500_000);
    eq('L1: inv keluar = 2.000.000', l.aktivitas.investasi.keluar, 2_000_000);
    eq('L1: inv neto = -2.000.000', l.aktivitas.investasi.neto, -2_000_000);
    eq('L1: pend masuk = 1.000.000', l.aktivitas.pendanaan.masuk, 1_000_000);
    eq('L1: kas_sosial pembuka = 200.000', l.kas_sosial.pembuka, 200_000);
    eq('L1: kas_sosial masuk = 300.000 (ZIS 4090)', l.kas_sosial.masuk, 300_000);
    eq('L1: kas_sosial keluar = 150.000 (zakat 5090)', l.kas_sosial.keluar, 150_000);
    eq('L1: kas_sosial transfer = 200.000', l.kas_sosial.transfer, 200_000);
    eq('L1: kas_sosial neto = 350.000', l.kas_sosial.neto, 350_000);
    eq('L1: kas_sosial penutup = 550.000', l.kas_sosial.penutup, 550_000);
    eq('L1: rincian ZIS 4090 masuk = 300.000', l.kas_sosial.rincian.find((r) => r.code === '4090')?.masuk, 300_000);
    eq('L1: rincian ZIS 5090 keluar = 150.000', l.kas_sosial.rincian.find((r) => r.code === '5090')?.keluar, 150_000);
    eq('L1: rincian ZIS tetap 4 baris (tanpa "(lain)")', l.kas_sosial.rincian.length, 4);
    eq('L1: footer saldo_awal = 10.500.000', l.footer.saldo_awal, 10_500_000);
    eq('L1: footer neto_aktivitas = 1.500.000', l.footer.neto_aktivitas, 1_500_000);
    eq('L1: footer pergeseran_kas_sosial = -200.000', l.footer.pergeseran_kas_sosial, -200_000);
    eq('L1: footer saldo_akhir = 11.800.000', l.footer.saldo_akhir, 11_800_000);
    ok(
      'L1: identitas footer (awal + neto + pergeseran = akhir)',
      l.footer.saldo_awal + l.footer.neto_aktivitas + l.footer.pergeseran_kas_sosial === l.footer.saldo_akhir
    );
    ok('L1: D=K seimbang, flag_rekon15 = false', l.d_k.balanced === true && l.flag_rekon15 === false);
  }

  // (L2) LAK batas periode: entry_date < at (strict).
  {
    const db = await freshDb();
    post(db, 'L-B1', '2026-09-30', '1010', '4010', 100_000); // IN (< at)
    post(db, 'L-B2', '2026-10-01', '1010', '4010', 900_000); // OUT (= at)
    const l = await buildLak(makeShim(db), '2026-10-01');
    eq('L2: op masuk hanya B1 = 100.000', l.aktivitas.operasional.masuk, 100_000);
    eq('L2: footer saldo_akhir = 100.000', l.footer.saldo_akhir, 100_000);
    eq('L2: D=K total_debit hanya B1 = 100.000', l.d_k.total_debit, 100_000);
  }

  // (L3) LAK tak seimbang -> flag_rekon15 (kaki non-kas tak mengubah arus).
  {
    const db = await freshDb();
    post(db, 'L-C1', '2026-08-01', '1010', '4010', 1_000_000); // seimbang
    postUnbalanced(db, 'L-C2', '2026-08-02', '1030', 250_000); // kaki debit saja
    const l = await buildLak(makeShim(db), '2026-10-01');
    eq('L3: footer saldo_akhir = 1.000.000', l.footer.saldo_akhir, 1_000_000);
    eq('L3: D=K gap = 250.000', l.d_k.gap, 250_000);
    ok('L3: D=K TIDAK seimbang, flag_rekon15 = true', l.d_k.balanced === false && l.flag_rekon15 === true);
  }

  // (L4) LAK DB kosong -> semua nol, kas 2 baris, rincian ZIS 4 baris.
  {
    const db = await freshDb();
    const l = await buildLak(makeShim(db), '2026-10-01');
    eq('L4: 2 baris kas (1010+1020)', l.kas.length, 2);
    ok(
      'L4: semua kas 0',
      l.kas.every((r) => r.pembuka === 0 && r.masuk === 0 && r.keluar === 0 && r.transfer === 0 && r.penutup === 0)
    );
    eq('L4: kas_sosial neto = 0', l.kas_sosial.neto, 0);
    eq('L4: rincian ZIS tetap 4 baris', l.kas_sosial.rincian.length, 4);
    ok(
      'L4: footer semua 0',
      l.footer.saldo_awal === 0 && l.footer.neto_aktivitas === 0 && l.footer.pergeseran_kas_sosial === 0 && l.footer.saldo_akhir === 0
    );
    ok('L4: 0=0 seimbang, flag_rekon15 = false', l.d_k.balanced === true && l.flag_rekon15 === false);
  }

  // (L5) LAK jurnal pembalik (type='reversal'): meng-ofset arus normal.
  {
    const db = await freshDb();
    post(db, 'L-R1', '2026-08-15', '5030', '1010', 200_000); // normal: op keluar
    postX(db, 'L-R2', '2026-08-15', 'reversal', 'pos', '1010', '5030', 200_000); // pembalik: op masuk
    const l = await buildLak(makeShim(db), '2026-10-01');
    eq('L5: op masuk = 200.000 (pembalik)', l.aktivitas.operasional.masuk, 200_000);
    eq('L5: op keluar = 200.000 (normal)', l.aktivitas.operasional.keluar, 200_000);
    eq('L5: op neto = 0 (offset penuh)', l.aktivitas.operasional.neto, 0);
    eq('L5: footer saldo_akhir = 0', l.footer.saldo_akhir, 0);
    ok('L5: D=K seimbang, flag_rekon15 = false', l.d_k.balanced === true && l.flag_rekon15 === false);
  }

  // (C1) CALK golden GL-only s.d. at (Sek.5.5 item 4-8) + D=K.
  {
    const db = await freshDb();
    const D = '2026-08-15';
    // Pembuka (type='opening') -> saldo, BUKAN aliran.
    postX(db, 'C-O1', '2026-08-01', 'opening', 'coop', '1010', '3010', 10_000_000);
    postX(db, 'C-O2', '2026-08-01', 'opening', 'coop', '1100', '2090', 200_000);
    // ZIS (GL-only): infak masuk 4090, zakat keluar 5090, wakaf masuk 4100 + aset 1120.
    post(db, 'C-Z1', D, '1100', '4090', 300_000); // infak diterima
    post(db, 'C-Z2', D, '5090', '1100', 150_000); // zakat disalurkan
    post(db, 'C-W1', D, '1120', '4100', 500_000); // wakaf booking (aset + pendapatan)
    // Simpanan (kewajiban anggota, BUKAN ekuitas).
    post(db, 'C-S1', D, '1010', '2050', 100_000);
    // Akad berjalan (per akun COA).
    post(db, 'C-A1', D, '1070', '1010', 800_000); // piutang murabahah
    const c = await buildCalk(makeShim(db), '2026-10-01');
    // Item 4: komponen kas (saldo penutup wajar-debit).
    eq('C1: kas 1010 penutup = 10.000.000 + 100.000 (setor simpanan) - 800.000 (akad)', c.kas.find((k) => k.code === '1010')?.value, 9_300_000);
    eq('C1: kas 1020 penutup = 0', c.kas.find((k) => k.code === '1020')?.value, 0);
    eq('C1: kas 1100 penutup = 200.000 + 300.000 - 150.000', c.kas.find((k) => k.code === '1100')?.value, 350_000);
    // Item 5: piutang & hutang per akun.
    eq('C1: piutang 1070 = 800.000', c.piutang.find((r) => r.code === '1070')?.value, 800_000);
    eq('C1: piutang 1030 = 0', c.piutang.find((r) => r.code === '1030')?.value, 0);
    eq('C1: hutang 2090 = 200.000 (pembuka)', c.hutang.find((r) => r.code === '2090')?.value, 200_000);
    // Item 6: ekuitas + simpanan memo TIDAK ikut total.
    eq('C1: ekuitas total = 10.000.000 (3010)', c.ekuitas_total, 10_000_000);
    eq('C1: simpanan memo 2050 = 100.000', c.ekuitas_memo.find((r) => r.code === '2050')?.value, 100_000);
    ok('C1: simpanan TIDAK dihitung ke ekuitas_total', c.ekuitas_total === 10_000_000);
    // Item 7: ZIS per jenis (GL-only) + memo wakaf.
    eq('C1: zis = 4 baris jenis', c.zis.length, 4);
    eq('C1: zakat disalurkan = 150.000 (5090)', c.zis.find((z) => z.jenis === 'zakat')?.disalurkan, 150_000);
    eq('C1: zakat diterima = 0 (tak ada akun penerimaan zakat)', c.zis.find((z) => z.jenis === 'zakat')?.diterima, 0);
    eq('C1: infak diterima = 300.000 (4090)', c.zis.find((z) => z.jenis === 'infak')?.diterima, 300_000);
    eq('C1: infak disalurkan = 0 (5100)', c.zis.find((z) => z.jenis === 'infak')?.disalurkan, 0);
    eq('C1: sedekah lumps -> 0/0', (c.zis.find((z) => z.jenis === 'sedekah')?.diterima ?? 0) + (c.zis.find((z) => z.jenis === 'sedekah')?.disalurkan ?? 0), 0);
    eq('C1: wakaf diterima = 500.000 (4100)', c.zis.find((z) => z.jenis === 'wakaf')?.diterima, 500_000);
    eq('C1: zis_memo aset_wakaf_1120 = 500.000', c.zis_memo.aset_wakaf_1120, 500_000);
    eq('C1: zis_memo memo_6020 = 0', c.zis_memo.memo_6020, 0);
    // Item 7 (periode): aliran non-pembuka per bulan.
    eq('C1: zis_periode = 1 bulan (2026-08)', c.zis_periode.length === 1 && c.zis_periode[0].periode, '2026-08');
    eq('C1: zis_periode 2026-08 diterima = 800.000 (4090 300.000 + 4100 500.000)', c.zis_periode[0].diterima, 800_000);
    eq('C1: zis_periode 2026-08 disalurkan = 150.000 (5090)', c.zis_periode[0].disalurkan, 150_000);
    // Item 8: akad berjalan per akun.
    eq('C1: akad 1070 = 800.000', c.akad_berjalan.find((r) => r.code === '1070')?.value, 800_000);
    eq('C1: akad 1080 = 0', c.akad_berjalan.find((r) => r.code === '1080')?.value, 0);
    ok('C1: D=K seimbang, flag_rekon15 = false', c.d_k.balanced === true && c.flag_rekon15 === false);
  }

  // (C2) CALK batas periode: entry_date < at (strict) -- saldo & aliran.
  {
    const db = await freshDb();
    post(db, 'C-B1', '2026-09-30', '1100', '4090', 100_000); // IN (< at)
    post(db, 'C-B2', '2026-10-01', '1100', '4090', 900_000); // OUT (= at)
    const c = await buildCalk(makeShim(db), '2026-10-01');
    eq('C2: infak diterima hanya B1 = 100.000', c.zis.find((z) => z.jenis === 'infak')?.diterima, 100_000);
    ok('C2: zis_periode = [2026-09] saja', c.zis_periode.length === 1 && c.zis_periode[0].periode === '2026-09');
    eq('C2: zis_periode 2026-09 diterima = 100.000', c.zis_periode[0].diterima, 100_000);
    eq('C2: kas 1100 penutup = 100.000', c.kas.find((k) => k.code === '1100')?.value, 100_000);
  }

  // (C3) CALK tak seimbang -> flag_rekon15 (nilai akun ikut, gap terlihat).
  {
    const db = await freshDb();
    post(db, 'C-K1', '2026-08-01', '1010', '3010', 1_000_000); // seimbang
    postUnbalanced(db, 'C-U1', '2026-08-02', '1030', 250_000); // kaki debit saja
    const c = await buildCalk(makeShim(db), '2026-10-01');
    eq('C3: piutang 1030 = 250.000 (kaki debit)', c.piutang.find((r) => r.code === '1030')?.value, 250_000);
    eq('C3: D=K gap = 250.000', c.d_k.gap, 250_000);
    ok('C3: D=K TIDAK seimbang, flag_rekon15 = true', c.d_k.balanced === false && c.flag_rekon15 === true);
  }

  // (C4) CALK DB kosong -> semua nol, zis 4 baris jenis, zis_periode kosong.
  {
    const db = await freshDb();
    const c = await buildCalk(makeShim(db), '2026-10-01');
    eq('C4: 4 baris zis jenis', c.zis.length, 4);
    ok('C4: zis_periode kosong', c.zis_periode.length === 0);
    ok('C4: semua kas 0', c.kas.every((k) => k.value === 0));
    eq('C4: ekuitas_total = 0', c.ekuitas_total, 0);
    eq('C4: zis_memo semua 0', c.zis_memo.aset_wakaf_1120 + c.zis_memo.memo_6020, 0);
    ok('C4: 0=0 seimbang, flag_rekon15 = false', c.d_k.balanced === true && c.flag_rekon15 === false && c.d_k.total_debit === 0);
  }

  // (C5) W3.3: akad_ringkas -- ringkasan per jenis dari tabel akad (OQ3).
  // at = '2026-10-01' (strict opened_at < at); seed: a1 aktif 9/1 (1jt),
  // a2 settled 9/5 (2jt), a3 aktif 9/10 (5jt), a4 aktif 10/1 (OUT: = at).
  {
    const db = await freshDb();
    function ins(id: string, type: string, cp: string, amount: number, status: string, opened: string): void {
      db
        .prepare("INSERT INTO akad(id, type, counterparty, amount, status, opened_at) VALUES (?,?,?,?,?,?)")
        .run(id, type, cp, amount, status, opened);
    }
    ins('a1', 'murabahah', 'Nas A', 1_000_000, 'active', '2026-09-01');
    ins('a2', 'murabahah', 'Nas B', 2_000_000, 'settled', '2026-09-05');
    ins('a3', 'mudharabah', 'Ptn C', 5_000_000, 'active', '2026-09-10');
    ins('a4', 'ijarah', 'Nas D', 7_000_000, 'active', '2026-10-01'); // OUT (= at)
    const c = await buildCalk(makeShim(db), '2026-10-01');
    eq('C5: ringkas = 2 jenis (ijarah tak masuk s.d. at)', c.akad_ringkas.length, 2);
    eq('C5: mudharabah aktif = 1', c.akad_ringkas.find((a) => a.type === 'mudharabah')?.aktif, 1);
    eq('C5: mudharabah saldo_aktif = 5.000.000', c.akad_ringkas.find((a) => a.type === 'mudharabah')?.saldo_aktif, 5_000_000);
    eq('C5: murabahah aktif = 1', c.akad_ringkas.find((a) => a.type === 'murabahah')?.aktif, 1);
    eq('C5: murabahah settled = 1', c.akad_ringkas.find((a) => a.type === 'murabahah')?.settled, 1);
    eq('C5: murabahah saldo_aktif = 1.000.000 (settled tak ikut)', c.akad_ringkas.find((a) => a.type === 'murabahah')?.saldo_aktif, 1_000_000);
    ok('C5: D=K tak terpengaruh tabel akad (0=0)', c.d_k.balanced === true && c.flag_rekon15 === false);
    // Tabel akad kosong -> ringkas kosong (tak ada jenis).
    const db0 = await freshDb();
    const c0 = await buildCalk(makeShim(db0), '2026-10-01');
    eq('C5: tabel akad kosong -> ringkas kosong', c0.akad_ringkas.length, 0);
  }

  console.log('');
  console.log('test:laporan (W2.2+W2.3+W2.4+W2.5+W2.6+W3.3) - ' + passes + ' ok, ' + failures + ' fail');
  process.exit(failures > 0 ? 1 : 0);
}

main();

