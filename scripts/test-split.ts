/**
 * Runtime test fitur 3 (pembayaran campur) — modul murni src/lib/pay-methods.ts.
 * Menjalankan SQL nyata (UNION ALL + json_each, args diulang 2x) terhadap
 * in-memory SQLite (node:sqlite) agar logika agregat terverifikasi.
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:split        (== node scripts/test-split.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 */
import {
  normalizeSaleImport,
  parsePaySplit,
  salesByMethod,
  salesCashPortion,
} from '../src/lib/pay-methods.ts';
import type { Db } from '../src/db.ts';

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

async function main(): Promise<void> {
  let sqliteErr = '';
  let db: import('node:sqlite').DatabaseSync | null = null;
  try {
    const mod = await import('node:sqlite');
    db = new mod.DatabaseSync(':memory:');
    db.exec(
      `CREATE TABLE sales (
        id INTEGER PRIMARY KEY,
        pay_method TEXT NOT NULL DEFAULT 'cash',
        pay_split TEXT,
        total INTEGER NOT NULL DEFAULT 0
      )`
    );
    // Baris legacy (single method): pay_split NULL / ''
    db.exec(
      `INSERT INTO sales (pay_method, pay_split, total) VALUES
        ('cash', NULL, 50000),
        ('tf', '', 40000),
        ('wa', NULL, 10000)`
    );
    // Baris mixed (fitur 3): Sigma split = total
    db.exec(
      `INSERT INTO sales (pay_method, pay_split, total) VALUES
        ('cash', '[{"m":"cash","a":30000},{"m":"tf","a":20000}]', 50000),
        ('wa', '[{"m":"wa","a":25000},{"m":"cash","a":5000}]', 30000)`
    );
  } catch (e) {
    sqliteErr = String(e);
  }

  // ── parsePaySplit ──
  ok(
    'parse: valid',
    JSON.stringify(parsePaySplit('[{"m":"cash","a":70000},{"m":"tf","a":30000}]')) ===
      JSON.stringify([
        { m: 'cash', a: 70000 },
        { m: 'tf', a: 30000 },
      ])
  );
  ok('parse: kosong -> []', parsePaySplit('').length === 0);
  ok('parse: null -> []', parsePaySplit(null).length === 0);
  ok('parse: rusak -> []', parsePaySplit('garbage').length === 0);
  ok('parse: filter metode tak dikenal', parsePaySplit('[{"m":"cc","a":5}]').length === 0);
  ok('parse: filter nominal<=0', parsePaySplit('[{"m":"cash","a":0}]').length === 0);

  // ── normalizeSaleImport (import backup /api/backup) ──
  // Split valid: JSON well-formed + whitelist + Sigma === total.
  ok(
    'import: split valid disimpan + total/0',
    JSON.stringify(normalizeSaleImport({ pay_method: 'cash', pay_split: '[{"m":"cash","a":200000},{"m":"tf","a":200000}]', total: 400000, amount_paid: 300000 })) ===
      JSON.stringify({ pay_method: 'cash', pay_split: '[{"m":"cash","a":200000},{"m":"tf","a":200000}]', amount_paid: 400000, change: 0 })
  );
  // JSON rusak -> null (legacy pay_method), amount_paid di-normalisasi.
  const broken = normalizeSaleImport({ pay_method: 'cash', pay_split: 'not-json', total: 100000, amount_paid: 150000 });
  ok('import: JSON rusak -> null (legacy)', broken.pay_split === null);
  ok('import: legacy cash paid>total dipertahankan', broken.amount_paid === 150000 && broken.change === 50000, JSON.stringify(broken));
  // Sigma != total -> null.
  ok(
    'import: Sigma!=total -> null',
    normalizeSaleImport({ pay_method: 'tf', pay_split: '[{"m":"tf","a":100000}]', total: 150000, amount_paid: 100000 }).pay_split === null
  );
  // Metode tak dikenal (alias qris) ter-filter -> parts kosong -> null.
  ok(
    'import: metode tak dikenal -> null',
    normalizeSaleImport({ pay_method: 'wa', pay_split: '[{"m":"qris","a":50000}]', total: 50000 }).pay_split === null
  );
  // Partial paid cash TANPA split: amount_paid tidak boleh < total, change 0.
  const partial = normalizeSaleImport({ pay_method: 'cash', total: 100000, amount_paid: 30000 });
  ok('import: partial paid -> dibulatkan total', partial.amount_paid === 100000 && partial.change === 0, JSON.stringify(partial));
  // pay_method kosong -> default cash.
  ok('import: pay_method default cash', normalizeSaleImport({ total: 1 }).pay_method === 'cash');

  if (!db) {
    console.error('  SKIP SQL — node:sqlite tidak tersedia: ' + sqliteErr);
    console.log(failures === 0 ? 'ALL_PASS (parse only)' : 'HAS_FAILURE');
    process.exit(failures === 0 ? 0 : 1);
  }

  // Shim DbShim: hanya .prepare(q).all/get + exec yang dipakai helper.
  // node:sqlite sinkron -> dibungkus Promise agar cocok dengan tipe Db.
  const shim = {
    prepare: (q: string) => ({
      all: async (...a: (string | number)[]) => db.prepare(q).all(...a),
      get: async (...a: (string | number)[]) => db.prepare(q).get(...a),
    }),
    exec: async (sql: string) => {
      db.exec(sql);
    },
  } as unknown as Db;

  // Rujukan manual (semua 5 baris):
  // cash = 50000(legacy) + 30000(mixed1) + 5000(mixed2) = 85000
  // tf   = 40000(legacy) + 20000(mixed1)               = 60000
  // wa   = 10000(legacy) + 25000(mixed2)                = 35000
  const bm = await salesByMethod(shim, '1=1');
  ok('byMethod cash=85000', bm['cash'] === 85000, 'got ' + bm['cash']);
  ok('byMethod tf=60000', bm['tf'] === 60000, 'got ' + bm['tf']);
  ok('byMethod wa=35000', bm['wa'] === 35000, 'got ' + bm['wa']);

  const cp = await salesCashPortion(shim, '1=1');
  ok('cashPortion=85000', cp === 85000, 'got ' + cp);

  // Dengan filter di WHERE (args diulang 2x) — total >= 30000 hapus baris wa=10000
  // cash tetap 85000, tf tetap 60000, wa = 25000 (hanya mixed2)
  const bm2 = await salesByMethod(shim, 'total >= ?', [30000]);
  ok('byMethod filtered wa=25000', bm2['wa'] === 25000, 'got ' + bm2['wa']);
  ok('byMethod filtered cash=85000', bm2['cash'] === 85000, 'got ' + bm2['cash']);

  const cp2 = await salesCashPortion(shim, 'total >= ?', [30000]);
  ok('cashPortion filtered=85000', cp2 === 85000, 'got ' + cp2);

  // Tabel kosong: hasil 0, bukan null/NaN.
  db.exec('DELETE FROM sales');
  const bmEmpty = await salesByMethod(shim, '1=1');
  ok('byMethod kosong -> {}', Object.keys(bmEmpty).length === 0, JSON.stringify(bmEmpty));
  const cpEmpty = await salesCashPortion(shim, '1=1');
  ok('cashPortion kosong -> 0', cpEmpty === 0, 'got ' + cpEmpty);

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();