/**
 * F3.4+ W1.1 - test skema GL (v21): COA seed 52 akun + tabel jurnal.
 * Node langsung (type-stripping, Node >= 23.6/v24): npm run test:gl.
 * Harness in-memory (node:sqlite), pola sama dgn scripts/test-neraca.ts.
 * Cakupan W1.1 (Phase 1, skema+seed): (1) DDL coa/journal_entries/
 * journal_lines + 2 index; (2) seed 52: COUNT=52, open=25/pending=26/
 * closed=1, needs_decision=1 total 26, 5050 closed, ON CONFLICT idempoten;
 * (3) jurnal UNIQUE(ref_table,ref_id,type) + composite PK.
 * (settings gl_enabled/coop_registered default '0' diverifikasi tsc+diff,
 *  bukan di harness ini agar tetap import-free / strip-only safe.)
 * W1.2: Phase 2 (engine jurnal: postJournal idempoten+tx, reversi, mapper
 * Wave-1) + Phase 3 (gl read: accountBalance/trialBalance/accountStatement
 * + openingBalance). Phase 2/3 db terpisah agar saldo tetap seimbang.
 * W1.3: Phase 4 (postJournalInTx -- varian async TxDb lapisan API:
 * posting seimbang tercatat di dalam "transaksi" pemanggil, idempoten
 * no-op, jurnal tak seimbang ditolak SEBELUM ada write).
 */
import {
  postJournal,
  reverseJournal,
  isBalanced,
  openingBalance,
  saleCashAccount,
  cashEntryCounterpart,
  journalForSale,
  journalForPurchase,
  journalForExpense,
  journalForCashEntry,
  postJournalInTx,
} from '../src/lib/jurnal.ts';
import type { JdB, TxDb } from '../src/lib/jurnal.ts';
import { accountBalance, trialBalance, accountStatement } from '../src/lib/gl.ts';
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

// DDL mirror dari src/db.ts (migrate v21).
const DDL = [
  "CREATE TABLE IF NOT EXISTS coa(code TEXT PRIMARY KEY, name TEXT NOT NULL, \"group\" TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', pap_ref TEXT, needs_decision INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
  "CREATE TABLE IF NOT EXISTS journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))",
  "CREATE TABLE IF NOT EXISTS journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))",
  'CREATE INDEX IF NOT EXISTS idx_jl_acct ON journal_lines(account_code, entry_id)',
  'CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(entry_date)',
];

// Seed 52 COA (mirror src/db.ts v21): [code, nama, group, kind, status, nd].
const COA: Array<[string, string, string, string, string, number]> = [
  // 10xx aset
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
  // 20xx kewajiban
  ['2010', 'Hutang Pembelianan', '20xx', 'kewajiban', 'open', 0],
  ['2020', 'Hutang Ujrah Konsinyasi', '20xx', 'kewajiban', 'open', 0],
  ['2030', 'Utang Cashback Member', '20xx', 'kewajiban', 'open', 0],
  ['2040', 'Kewajiban Akad (Ujrah/Tijarah/Mudharabah)', '20xx', 'kewajiban', 'pending', 1],
  ['2050', 'Simpanan Pokok', '20xx', 'kewajiban', 'open', 0],
  ['2060', 'Simpanan Wajib', '20xx', 'kewajiban', 'open', 0],
  ['2070', 'Simpanan Sukarela', '20xx', 'kewajiban', 'open', 0],
  ['2080', 'SHU Berjalan', '20xx', 'kewajiban', 'pending', 1],
  ['2090', 'ZIS Terkumpul Belum Disalurkan', '20xx', 'kewajiban', 'pending', 1],
  ['2100', 'Kewajiban Lain-lain', '20xx', 'kewajiban', 'pending', 1],
  // 30xx ekuitas
  ['3010', 'Modal Penyertaan', '30xx', 'ekuitas', 'open', 0],
  ['3020', 'SHU Ditahan', '30xx', 'ekuitas', 'pending', 1],
  ['3030', 'SHU Cadangan Umum', '30xx', 'ekuitas', 'pending', 1],
  ['3040', 'SHU Cadangan Khusus', '30xx', 'ekuitas', 'pending', 1],
  ['3050', 'SHU Jasa Anggota', '30xx', 'ekuitas', 'pending', 1],
  ['3060', 'SHU Dibagi', '30xx', 'ekuitas', 'pending', 1],
  ['3070', 'Koreksi Saldo', '30xx', 'ekuitas', 'open', 0],
  // 40xx pendapatan
  ['4010', 'Pendapatan Penjualan', '40xx', 'pendapatan', 'open', 0],
  ['4020', 'Potongan & Diskon (kontra pendapatan)', '40xx', 'pendapatan', 'open', 0],
  ['4030', 'Retur Penjualan', '40xx', 'pendapatan', 'open', 0],
  ['4040', 'Ujrah Konsinyasi', '40xx', 'pendapatan', 'pending', 1],
  ['4050', 'Pendapatan Ijarah', '40xx', 'pendapatan', 'pending', 1],
  ['4060', 'Laba Murabahah', '40xx', 'pendapatan', 'pending', 1],
  ['4070', 'Bagi Hasil Mudharabah', '40xx', 'pendapatan', 'pending', 1],
  ['4080', 'Bagi Hasil Musyarakah', '40xx', 'pendapatan', 'pending', 1],
  ['4090', 'ZIS Masuk', '40xx', 'pendapatan', 'open', 0],
  ['4100', 'Wakaf Masuk', '40xx', 'pendapatan', 'open', 0],
  // 50xx beban
  ['5010', 'HPP (Beban Persediaan)', '50xx', 'beban', 'open', 0],
  ['5020', 'Retur COGS (reversal)', '50xx', 'beban', 'open', 0],
  ['5030', 'Beban Operasional', '50xx', 'beban', 'open', 0],
  ['5040', 'Beban Penyusutan Aset Tetap', '50xx', 'beban', 'pending', 1],
  ['5050', 'Denda/Keterlambatan (clearing)', '50xx', 'beban', 'closed', 0],
  ['5060', 'Bagi Hasil Partner Mudharabah', '50xx', 'beban', 'pending', 1],
  ['5070', 'Beban Ijarah', '50xx', 'beban', 'pending', 1],
  ['5080', 'Distribusi SHU', '50xx', 'beban', 'pending', 1],
  ['5090', 'Zakat Keluar', '50xx', 'beban', 'pending', 1],
  ['5100', 'Infak/Sedekah Keluar', '50xx', 'beban', 'open', 0],
  // 60xx syariah/PAP
  ['6010', 'Dana Pesantren (memo)', '60xx', 'syariah', 'pending', 1],
  ['6020', 'Aset Wakaf (memo)', '60xx', 'syariah', 'open', 0],
  ['6030', 'Zakat Tijarah Dibayar', '60xx', 'syariah', 'pending', 1],
];

async function main(): Promise<void> {
  let db: import('node:sqlite').DatabaseSync | null = null;
  try {
    const mod = await import('node:sqlite');
    db = new mod.DatabaseSync(':memory:');
    for (const s of DDL) db.exec(s);
  } catch (e) {
    console.error('  SKIP - node:sqlite tak tersedia: ' + String(e));
    console.log('HAS_FAILURE');
    process.exit(1);
  }

  const cnt = (q: string, d?: typeof db): number => ((d ?? db!)!.prepare(q).get() as { c: number } | undefined)?.c ?? 0;

  // 2. seed + idempoten (ON CONFLICT DO NOTHING -> seed ulang tetap 52).
  const insCoa = db!.prepare(
    'INSERT INTO coa (code, name, "group", kind, status, needs_decision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING'
  );
  for (const r of COA) insCoa.run(r[0], r[1], r[2], r[3], r[4], r[5]);
  for (const r of COA) insCoa.run(r[0], r[1], r[2], r[3], r[4], r[5]);
  eq('coa COUNT(*) = 52', cnt('SELECT COUNT(*) c FROM coa'), 52);
  eq('coa DISTINCT code = 52', cnt('SELECT COUNT(DISTINCT code) c FROM coa'), 52);
  eq('coa status open = 25', cnt("SELECT COUNT(*) c FROM coa WHERE status='open'"), 25);
  eq('coa status pending = 26', cnt("SELECT COUNT(*) c FROM coa WHERE status='pending'"), 26);
  eq('coa status closed = 1', cnt("SELECT COUNT(*) c FROM coa WHERE status='closed'"), 1);
  eq('coa needs_decision=1 = 26', cnt('SELECT COUNT(*) c FROM coa WHERE needs_decision=1'), 26);
  eq('coa 5050 = closed', (db!.prepare("SELECT status FROM coa WHERE code='5050'").get() as { status: string }).status, 'closed');

  // 3. constraint jurnal (fungsional).
  const TZ = '2026-10-01T00:00:00.000+07:00';
  const je = db!.prepare('INSERT INTO journal_entries (id, ref_table, ref_id, entry_date, type) VALUES (?, ?, ?, ?, ?)');
  je.run('e1', 'sales', '100', TZ, 'normal');
  let dupRejected = false;
  try {
    je.run('e2', 'sales', '100', TZ, 'normal'); // ref sama -> UNIQUE tolak
  } catch {
    dupRejected = true;
  }
  ok('journal_entries UNIQUE(ref_table,ref_id,type) tolak duplikat', dupRejected);
  let manualOk = true;
  try {
    je.run('m1', 'manual', null, TZ, 'manual'); // ref_id NULL -> bebas
    je.run('m2', 'manual', null, TZ, 'manual');
  } catch {
    manualOk = false;
  }
  ok('journal_entries ref_id NULL (manual) bebas duplikat', manualOk);
  const jl = db!.prepare('INSERT INTO journal_lines (entry_id, account_code, debit, credit, balance_running, source) VALUES (?, ?, ?, ?, ?, ?)');
  jl.run('e1', '1010', 1000, 0, 1000, 'sales#100');
  let pkRejected = false;
  try {
    jl.run('e1', '1010', 5, 0, 1005, 'sales#100'); // composite PK duplikat -> tolak
  } catch {
    pkRejected = true;
  }
  ok('journal_lines composite PK tolak duplikat', pkRejected);

  // ===== Phase 2 (W1.2): engine jurnal (postJournal/reverseJournal) =====
  // db2: in-memory baru + tabel jurnal saja -> saldo bersih utk engine.
  const mod2 = await import('node:sqlite');
  const db2 = new mod2.DatabaseSync(':memory:');
  db2.exec('CREATE TABLE journal_entries (id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT \'normal\', desc TEXT NOT NULL DEFAULT \'\', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))');
  db2.exec('CREATE TABLE journal_lines (entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT \'\', PRIMARY KEY(entry_id, account_code, source))');
  const jdb = db2 as unknown as JdB;
  // J1: posting seimbang 2 kaki (1010 D / 4010 C).
  postJournal(jdb, {
    id: 'j1', ref_table: 'sales', ref_id: '999', entry_date: TZ, type: 'auto', desc: 'uji',
    lines: [
      { account_code: '1010', debit: 50000, credit: 0, source: 's1' },
      { account_code: '4010', debit: 0, credit: 50000, source: 's1' },
    ],
  });
  eq('j1: 1 entry tercatat', cnt('SELECT COUNT(*) c FROM journal_entries WHERE id = \'j1\'', db2), 1);
  eq('j1: 2 baris tercatat', cnt('SELECT COUNT(*) c FROM journal_lines WHERE entry_id = \'j1\'', db2), 2);
  eq(
    'j1: balance_running 1010 = 50000',
    Number((db2.prepare('SELECT balance_running b FROM journal_lines WHERE entry_id=\'j1\' AND account_code=\'1010\'').get() as { b: number | null }).b ?? -1),
    50000
  );
  // J2: tak seimbang -> tolak + rollback (entry tak tersisa).
  let threw = false;
  try {
    postJournal(jdb, {
      id: 'j2', ref_table: 'sales', ref_id: '998', entry_date: TZ, type: 'auto',
      lines: [
        { account_code: '1010', debit: 10, credit: 0, source: 'a' },
        { account_code: '4010', debit: 0, credit: 20, source: 'a' },
      ],
    });
  } catch {
    threw = true;
  }
  ok('j2: jurnal tak seimbang ditolak', threw);
  eq('j2: tak ada sisa entry setelah rollback', cnt('SELECT COUNT(*) c FROM journal_entries WHERE id = \'j2\'', db2), 0);
  // J3: idempoten -- posting ulang (ref_table,ref_id,type) sama = no-op.
  const r3 = postJournal(jdb, {
    id: 'j1', ref_table: 'sales', ref_id: '999', entry_date: TZ, type: 'auto',
    lines: [
      { account_code: '1010', debit: 50000, credit: 0, source: 's1' },
      { account_code: '4010', debit: 0, credit: 50000, source: 's1' },
    ],
  });
  eq('j3: post ulang -> no-op, id lama', r3, 'j1');
  eq('j3: baris tetap 2', cnt('SELECT COUNT(*) c FROM journal_lines WHERE entry_id = \'j1\'', db2), 2);
  // J4: balance_running akumulasi LINTAS HARI (saldo pembuka hari + mutasi).
  // Catatan semantik: baris sehari tak kumulatif satu sama lain (prior =
  // entry_date < hari ini); saldo berjalan intraday dijamin accountStatement
  // (gl.ts) dari debit/credit mentah.
  const TZ2 = '2026-10-02T00:00:00.000+07:00';
  postJournal(jdb, {
    id: 'j1b', ref_table: 'sales', ref_id: '997', entry_date: TZ2, type: 'auto',
    lines: [
      { account_code: '1010', debit: 10000, credit: 0, source: 's2' },
      { account_code: '4010', debit: 0, credit: 10000, source: 's2' },
    ],
  });
  eq(
    'j4: balance_running 1010 akumulasi = 60000',
    Number((db2.prepare('SELECT balance_running b FROM journal_lines WHERE entry_id=\'j1b\' AND account_code=\'1010\'').get() as { b: number | null }).b ?? -1),
    60000
  );
  // J5: reversi (koreksi) -- reversed_by dua arah + kaki terbalik + ref baru.
  const revId = reverseJournal(jdb, 'j1', 'koreksi uji', 'tester');
  eq('j5: id pembalikan = j1#rev1', revId, 'j1#rev1');
  eq(
    'j5: reversed_by di entry asli',
    String((db2.prepare('SELECT reversed_by v FROM journal_entries WHERE id=\'j1\'').get() as { v: string | null }).v ?? ''),
    'j1#rev1'
  );
  eq(
    'j5: kaki pembalik 1010 = credit 50000',
    Number((db2.prepare('SELECT credit c FROM journal_lines WHERE entry_id=\'j1#rev1\' AND account_code=\'1010\'').get() as { c: number }).c ?? -1),
    50000
  );
  eq('j5: ref_id baru ...#rev1', String((db2.prepare('SELECT ref_id v FROM journal_entries WHERE id=\'j1#rev1\'').get() as { v: string }).v), '999#rev1');
  eq('j5: reversi ulang idempoten', reverseJournal(jdb, 'j1', 'ulang', 'tester'), 'j1#rev1');
  // J6: posting pasca-reversal = ref_id baru (pola #rev1) -> entry baru.
  eq('j6: posting ulang pasca-reversal tercatat baru', postJournal(jdb, {
    id: 'j1r', ref_table: 'sales', ref_id: '999#rev1', entry_date: TZ, type: 'auto',
    lines: [
      { account_code: '1010', debit: 50000, credit: 0, source: 's1r' },
      { account_code: '4010', debit: 0, credit: 50000, source: 's1r' },
    ],
  }), 'j1r');

  // ===== Phase 2b (W1.2): mapper Wave-1 (murni, tanpa DB) =====
  const s1 = journalForSale({ id: 5, total: 100000, discount: 10000, pay_method: 'cash', cogs: 40000 });
  ok('M1: mapper sale seimbang', isBalanced(s1.lines));
  eq('M1: sale bruto 4010 = 110000', s1.lines.find((l) => l.account_code === '4010')?.credit ?? -1, 110000);
  eq('M1: sale potongan 4020 D = 10000', s1.lines.find((l) => l.account_code === '4020')?.debit ?? -1, 10000);
  eq('M1: sale HPP 5010 D = 40000', s1.lines.find((l) => l.account_code === '5010')?.debit ?? -1, 40000);
  eq('M1: sale persediaan 1040 C = 40000', s1.lines.find((l) => l.account_code === '1040')?.credit ?? -1, 40000);
  eq('M1: sale cash -> 1010', s1.lines[0].account_code, '1010');
  eq('M2: tf -> 1020', saleCashAccount('tf'), '1020');
  eq('M2: qris -> 1010', saleCashAccount('qris'), '1010');
  eq('M2: credit -> 1030', saleCashAccount('credit'), '1030');
  const p1 = journalForPurchase({ id: 2, qty: 2, unit_cost: 50000 });
  ok('M3: mapper purchase seimbang', isBalanced(p1.lines));
  eq('M3: purchase 1040 D = 100000', p1.lines[0].debit, 100000);
  eq('M3: purchase lunas -> 1010 C', p1.lines[1].account_code, '1010');
  eq('M3: purchase tempo -> 2010 C', journalForPurchase({ id: 3, qty: 1, unit_cost: 99999, on_account: true }).lines[1].account_code, '2010');
  const e1 = journalForExpense({ id: 1, amount: 50000 });
  ok('M4: mapper expense seimbang', isBalanced(e1.lines));
  eq('M4: expense 5030 D', e1.lines[0].account_code, '5030');
  eq('M4: expense default 1010 C', e1.lines[1].account_code, '1010');
  eq('M4: expense pay_acct 1020', journalForExpense({ id: 2, amount: 1000, pay_acct: '1020' }).lines[1].account_code, '1020');
  eq('M5: cash Ujrah -> 4040', cashEntryCounterpart('income', 'Ujrah Kon. #7'), '4040');
  eq('M5: cash ZIS -> 4090', cashEntryCounterpart('income', 'Zakat emas haul'), '4090');
  eq('M5: cash modal -> 3010', cashEntryCounterpart('income', 'Modal awal'), '3010');
  eq('M5: cash retur -> 4030', cashEntryCounterpart('expense', 'Retur #3 - biskuit'), '4030');
  eq('M5: cash beban -> 5030', cashEntryCounterpart('expense', 'Belanja air'), '5030');
  const c1 = journalForCashEntry({ id: 9, type: 'income', label: 'Modal awal', amount: 200000 });
  ok('M5: mapper cash seimbang', isBalanced(c1.lines));
  eq('M5: cash income -> 1010 D', c1.lines[0].account_code, '1010');

  // ===== Phase 3 (W1.2): GL read-side (gl.ts + openingBalance) =====
  // db3 sendiri (state bersih): hanya lewat postJournal -> jurnal
  // selamanya seimbang -> trial balance totalDiff = 0 (JOURNAL_BAL).
  const db3 = new mod2.DatabaseSync(':memory:');
  for (const s of DDL) db3.exec(s);
  const jdb3 = db3 as unknown as JdB;
  const D1 = '2026-10-05T00:00:00.000+07:00';
  const D2 = '2026-10-06T00:00:00.000+07:00';
  const D3 = '2026-10-07T00:00:00.000+07:00';
  const D4 = '2026-10-08T00:00:00.000+07:00';
  postJournal(jdb3, { ...journalForSale({ id: 5, total: 100000, discount: 0, pay_method: 'cash', cogs: 40000 }), entry_date: D1 });
  postJournal(jdb3, { ...journalForPurchase({ id: 2, qty: 2, unit_cost: 50000, on_account: true }), entry_date: D2 });
  postJournal(jdb3, { ...journalForExpense({ id: 1, amount: 30000 }), entry_date: D3 });
  postJournal(jdb3, { ...journalForCashEntry({ id: 9, type: 'income', label: 'Modal awal', amount: 200000 }), entry_date: D3 });

  const qdb3: QueryDb = {
    prepare: (sql: string) => {
      const st = db3.prepare(sql);
      return {
        get: (...a: unknown[]) => Promise.resolve(st.get(...(a as never[]))),
        all: (...a: unknown[]) => Promise.resolve(st.all(...(a as never[]))),
      };
    },
  };
  // G1: accountBalance (saldo normal per jenis akun).
  eq('G1: 1010 saldo < D4 = 270000', await accountBalance(qdb3, '1010', D4), 270000);
  eq('G1: 4010 saldo normal-credit = 100000', await accountBalance(qdb3, '4010', D4), 100000);
  eq('G1: akun kosong = 0', await accountBalance(qdb3, '1120', D4), 0);
  // G2: trialBalance total selamanya seimbang (posting seimbang).
  const tb = await trialBalance(qdb3, D4);
  eq('G2: trial totalDiff = 0', tb.reduce((n, r) => n + r.debit - r.credit, 0), 0);
  eq('G2: trial baris 4010 credit = 100000', tb.find((r) => r.account_code === '4010')?.credit ?? -1, 100000);
  // G3: accountStatement (mutasi + saldo berjalan).
  const stt = await accountStatement(qdb3, '1010', D2, '2026-10-09T00:00:00.000+07:00');
  eq('G3: 1010 2 mutasi di interval', stt.length, 2);
  eq('G3: saldo akhir berjalan = 270000', stt[stt.length - 1].balance, 270000);
  eq('G3: debit interval = 200000', stt.reduce((n, r) => n + r.debit, 0), 200000);
  eq('G3: credit interval = 30000', stt.reduce((n, r) => n + r.credit, 0), 30000);
  // G4: openingBalance (jurnal.ts, QueryDb) -- saldo MENTAH (debit - credit).
  const ob = await openingBalance(qdb3, D2);
  eq('G4: opening 1010 < D2 = 100000', ob['1010'], 100000);
  eq('G4: opening 1040 < D2 = -40000', ob['1040'], -40000);
  eq('G4: opening 4010 < D2 = -100000', ob['4010'], -100000);
  eq('G4: opening 5010 < D2 = 40000', ob['5010'], 40000);

  // ===== Phase 4 (W1.3): postJournalInTx (varian async TxDb lapisan API) =====
  // TxDb palsu meng-wrap node:sqlite in-memory (db4 terpisah; pola sama
  // dgn QueryDb palsu Phase 3): semua method return Promise, TANPA
  // BEGIN/COMMIT sendiri (postJournalInTx tidak buka tx).
  const db4 = new mod2.DatabaseSync(':memory:');
  db4.exec('CREATE TABLE journal_entries (id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT \'normal\', desc TEXT NOT NULL DEFAULT \'\', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))');
  db4.exec('CREATE TABLE journal_lines (entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT \'\', PRIMARY KEY(entry_id, account_code, source))');
  const txdb: TxDb = {
    prepare: (sql: string) => {
      const st = db4.prepare(sql);
      return {
        get: (...a: unknown[]) => Promise.resolve(st.get(...(a as never[]))),
        all: (...a: unknown[]) => Promise.resolve(st.all(...(a as never[]))),
        run: async (...a: unknown[]) => {
          const r = st.run(...(a as never[]));
          // TxDb mendeklarasikan changes/lastInsertRowid: number, padahal
          // node:sqlite bisa bigint -> normalisasi.
          return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
        },
      };
    },
  };
  const TZ4 = '2026-10-10T00:00:00.000+07:00';
  const saleSpec = () =>
    journalForSale({ id: 7, total: 50000, discount: 5000, pay_method: 'tf', cogs: 20000, created_at: TZ4 });
  // T1: posting seimbang tercatat (entry + 5 baris: dgn discount>0 &
  // cogs>0 -> kaki kas D, 4010 C bruto, 4020 D diskon, 5010 D HPP, 1040
  // C persediaan).
  eq('T1: posting sale -> id', await postJournalInTx(txdb, saleSpec()), 'JE-sale-7');
  eq('T1: 1 entry tercatat', cnt('SELECT COUNT(*) c FROM journal_entries WHERE id=\'JE-sale-7\'', db4), 1);
  eq('T1: 5 baris tercatat', cnt('SELECT COUNT(*) c FROM journal_lines WHERE entry_id=\'JE-sale-7\'', db4), 5);
  // T2: idempoten -- (sales, 7, auto) sudah ada -> no-op, id lama.
  eq('T2: posting ulang -> no-op id lama', await postJournalInTx(txdb, saleSpec()), 'JE-sale-7');
  eq('T2: baris tetap 5', cnt('SELECT COUNT(*) c FROM journal_lines WHERE entry_id=\'JE-sale-7\'', db4), 5);
  // T3: jurnal tak seimbang ditolak SEBELUM ada write (JOURNAL_BAL).
  let aThrew = false;
  try {
    await postJournalInTx(txdb, {
      id: 'JE-bad-1',
      ref_table: 'sales',
      ref_id: 900,
      entry_date: TZ4,
      type: 'auto',
      lines: [
        { account_code: '1010', debit: 10, credit: 0, source: 's' },
        { account_code: '4010', debit: 0, credit: 20, source: 's' },
      ],
    });
  } catch {
    aThrew = true;
  }
  ok('T3: jurnal tak seimbang ditolak', aThrew);
  eq('T3: tak ada sisa entry', cnt('SELECT COUNT(*) c FROM journal_entries WHERE id=\'JE-bad-1\'', db4), 0);
  // T4: mapper lainnya jalan di TxDb (purchase/expense/cash).
  eq('T4: purchase posting tercatat', await postJournalInTx(txdb, journalForPurchase({ id: 8, qty: 2, unit_cost: 25000, created_at: TZ4 })), 'JE-purchase-8');
  eq('T4: expense posting tercatat', await postJournalInTx(txdb, journalForExpense({ id: 4, amount: 30000, created_at: TZ4 })), 'JE-expense-4');
  eq('T4: cash posting tercatat', await postJournalInTx(txdb, journalForCashEntry({ id: 11, type: 'income', label: 'Ujrah Konsinyasi', amount: 150000, created_at: TZ4 })), 'JE-cash-11');
  eq('T4: 4 entry total di db4', cnt('SELECT COUNT(*) c FROM journal_entries', db4), 4);

  console.log('');
  console.log('test:gl (W1.3) - ' + passes + ' ok, ' + failures + ' fail');
  if (failures > 0) process.exit(1);
}

main();
