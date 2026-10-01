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
 * Phase 2/3 (post/reverse + gl reads) menyusul di W1.2.
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

  const cnt = (q: string): number => (db!.prepare(q).get() as { c: number } | undefined)?.c ?? 0;

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

  console.log('');
  console.log('test:gl (W1.1) - ' + passes + ' ok, ' + failures + ' fail');
  if (failures > 0) process.exit(1);
}

main();
