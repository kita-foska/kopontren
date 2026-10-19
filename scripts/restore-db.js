#!/usr/bin/env node
/**
 * ============================================================================
 * restore-db.js — PEMULIHAN DARURAT: 3 tabel Turso yang terhapus (2026-10-19)
 * ============================================================================
 * INSIDEN: kesalahan fatal (DeepSeek) menghapus tabel products, sale_items,
 * purchases di Turso produksi. Turso Free Plan tak punya Restore/Import,
 * Gus Fi tak punya Turso CLI.
 * PENYELESAIAN: skrip ini (semua via @libsql/client, tanpa CLI):
 *   1. BACA backup lokal (default C:/Users/baiti/Downloads/kopontren.db,
 *      terverifikasi: integrity OK, stamp v21, products 236 baris) via
 *      backend file: libsql — library SAMA dgn koneksi produksi.
 *   2. DROP 3 tabel di Turso (index ikut lenyap — normal).
 *   3. CREATE 3 tabel dgn DDL v31 PERSIS milik aplikasi
 *      (sumber kebenaran: src/db.ts rebuildTableV31 baris 1238-1243).
 *   4. INSERT data backup (interseksi kolom) via client.batch() BERTAHAP
 *      (DML-only batch — Turso melarang DDL di dalam batch()).
 *   5. Stempel schema_version -> 31. WAJIB: tanpa stempel, cold start
 *      berikutnya menjalankan migrate31() yg rebuild-nya dapat gagal
 *      (migrate() menambah kolom dead min_stock/expiry_date yang BUKAN
 *      bagian DDL v31 -> INSERT...SELECT * mismatch -> fullInit loop).
 *      Stempel 31 menghentikan loop; bentuk tabel = bentuk v31 final.
 *   6. VERIFY: COUNT per tabel (backup vs target) + integrity_check +
 *      schema_version + konteks sales (intact, tak di sentuh).
 * KESELAMATAN: default = DRY-RUN (read-only, hanya laporan).
 *   --execute = drop+create+insert+stempel+verifikasi (destructive!).
 *   Stempel hanya naik (<31 -> 31); target >= 31 tak diubah.
 * PENGGUNAAN:
 *   node scripts/restore-db.js
 *   set DATABASE_URL=libsql://<host>/<db>
 *   set DATABASE_AUTH_TOKEN=<token>
 *   node scripts/restore-db.js --execute
 *   Opsi: arg posisi = path backup alternatif (mis. "kopontren (1).db").
 * CATATAN: package.json tak punya "type":"module" -> .js ini CJS;
 *   @libsql/client (ESM) dimuat via dynamic import().
 * SETELAH BERHASIL: Redeploy Vercel. Cold start SKIP fullInit (stempel 31);
 *   login admin langsung normal; cek halaman Produk/Sales/Pembelian.
 * ============================================================================
 */
'use strict';

const DEFAULT_BACKUP = 'C:/Users/baiti/Downloads/kopontren.db';
const TABLES = ['products', 'sale_items', 'purchases'];

// ---- DDL v31: PERSIS dari src/db.ts rebuildTableV31 (baris 1238-1243) ----
// stock/qty/qty_per_base = REAL (tujuan bump v31). min_stock/expiry_date
// TIDAK termasuk: dead columns, tak pernah di-query aplikasi (terverifikasi
// via grep app/ & lib/).
const TABLE_DDL = {
  products:
    'CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT \'\', unit TEXT NOT NULL DEFAULT \'pcs\', base_price INTEGER NOT NULL DEFAULT 0, cost_price INTEGER NOT NULL DEFAULT 0, stock REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, barcode TEXT NOT NULL DEFAULT \'\', is_consignment INTEGER NOT NULL DEFAULT 0, image_url TEXT NOT NULL DEFAULT \'\', pack_units TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')))',
  sale_items:
    'CREATE TABLE sale_items (id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT NOT NULL, qty INTEGER NOT NULL, unit TEXT NOT NULL DEFAULT \'pcs\', unit_price INTEGER NOT NULL, subtotal INTEGER NOT NULL, discount REAL NOT NULL DEFAULT 0, cost_price INTEGER NOT NULL DEFAULT 0, unit_name TEXT NOT NULL DEFAULT \'\', qty_per_base REAL NOT NULL DEFAULT 1)',
  purchases:
    'CREATE TABLE purchases (id INTEGER PRIMARY KEY, product_id INTEGER, product_name TEXT NOT NULL, qty REAL NOT NULL, unit_cost INTEGER NOT NULL DEFAULT 0, supplier TEXT NOT NULL DEFAULT \'\', note TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')))'
};

// Kolom v31 per tabel (interseksi dgn kolom backup; urutan = urutan DDL)
const V31_COLUMNS = {
  products: ['id','name','category','unit','base_price','cost_price','stock','active','barcode','is_consignment','image_url','pack_units','created_at'],
  sale_items: ['id','sale_id','product_id','product_name','qty','unit','unit_price','subtotal','discount','cost_price','unit_name','qty_per_base'],
  purchases: ['id','product_id','product_name','qty','unit_cost','supplier','note','created_at']
};

// Index WAJIB dibangun ulang: setelah DROP TABLE semua index pada 3 tabel
// lenyap; stempel 31 membuat fullInit tak akan menjalankan migrate() lagi
// -> skrip ini yang memulihkan state produksi (6 index, semua IF NOT EXISTS).
const INDEXES = [
  // migrate31 (db.ts 1291-1295): 4 index rebuild v31
  'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)',
  'CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, category)',
  'CREATE INDEX IF NOT EXISTS idx_si_sale ON sale_items(sale_id)',
  'CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id, product_id)',
  // migrate() (db.ts 410, 488): index produksi pra-insiden
  'CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_products_active_name ON products(active, name)'
];

// Chunk DML: 100 statement/tx (anti-timeout, sesuai "bertahap")
const CHUNK_SIZE = 100;
const PAGE_SIZE = 500; // baris baca per halaman dari backup

function log(msg) { process.stdout.write(msg + '\n'); }
function fail(msg) { log('\n✖ ' + msg); process.exit(1); }
function normFileUrl(p) {
  // C:\Users\... -> file:C:/Users/... (libsql file backend: forward slash)
  let path = String(p).replace(/\\/g, '/');
  if (!/^file:/.test(path)) path = 'file:' + path;
  return path;
}
function toArg(v) {
  if (v instanceof Uint8Array) return v; // BLOB (tak ada di 3 tabel ini)
  if (typeof v === 'bigint') return Number(v);
  return v;
}
// ---------------------------------------------------------------------------
// inspeksi backup (sumber, read-only)
// ---------------------------------------------------------------------------
async function inspectSource(libsql, sourceUrl) {
  const c = libsql.createClient({ url: sourceUrl });
  const integ = await c.execute('PRAGMA integrity_check');
  if (!integ.rows.length || integ.rows[0].integrity_check !== 'ok') {
    fail('Backup GAGAL integrity_check: ' + JSON.stringify(integ.rows[0]));
  }
  let stamped = null;
  try {
    const r = await c.execute('SELECT version FROM schema_version LIMIT 1');
    if (r.rows.length) stamped = Number(r.rows[0].version);
  } catch { /* backup pra-erastempel */ }

  const out = { stamped, counts: {}, cols: {} };
  for (const t of TABLES) {
    const info = await c.execute(`PRAGMA table_info(${t})`);
    if (!info.rows.length) fail(`Tabel ${t} tidak ada di backup — periksa file backup!`);
    out.cols[t] = info.rows.map((r) => r.name);
    out.counts[t] = Number((await c.execute(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
  }
  c.close();
  return out;
}

// Mapping kolom: irisan (kolom backup yg ada di skema v31), urut DDL v31
function columnMapping(t, srcCols) {
  const dst = V31_COLUMNS[t];
  return {
    use: dst.filter((c) => srcCols.includes(c)),
    dropped: srcCols.filter((c) => !dst.includes(c)),
    defaulted: dst.filter((c) => !srcCols.includes(c))
  };
}

// ---------------------------------------------------------------------------
// inspeksi target (Turso, read-only)
// ---------------------------------------------------------------------------
async function inspectTarget(libsql, targetUrl, auth) {
  const c = libsql.createClient({ url: targetUrl, authToken: auth });
  await c.execute('SELECT 1'); // reachable + token valid
  const out = { exists: {}, counts: {}, stamped: null, salesCount: null };
  const names = (await c.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','sale_items','purchases')"
  )).rows.map((r) => r.name);
  for (const t of TABLES) {
    out.exists[t] = names.includes(t);
    if (out.exists[t]) out.counts[t] = Number((await c.execute(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
  }
  try {
    const r = await c.execute('SELECT version FROM schema_version LIMIT 1');
    if (r.rows.length) out.stamped = Number(r.rows[0].version);
  } catch { /* belum ada stempel */ }
  try { out.salesCount = Number((await c.execute('SELECT COUNT(*) AS n FROM sales')).rows[0].n); } catch {}
  c.close();
  return out;
}

// ---------------------------------------------------------------------------
// RESTORE (mutating) — urutan: DROP -> CREATE -> INSERT(batch) -> INDEX -> stempel
// ---------------------------------------------------------------------------
async function doRestore(libsql, targetUrl, auth, sourceUrl, srcMeta) {
  const c = libsql.createClient({ url: targetUrl, authToken: auth });

  log('\n[1/5] DROP 3 tabel (index ikut lenyap — akan dibangun ulang)...');
  for (const t of TABLES) {
    await c.execute(`DROP TABLE IF EXISTS ${t}`);
    log('  - DROP ' + t);
  }

  log('\n[2/5] CREATE 3 tabel dgn DDL v31 (rebuildTableV31 / db.ts)...');
  for (const t of TABLES) {
    await c.execute(TABLE_DDL[t]);
    log('  - CREATE ' + t + ' (' + V31_COLUMNS[t].length + ' kolom)');
  }

  log('\n[3/5] INSERT data dari backup (bertahap, chunk ' + CHUNK_SIZE + ' statement/tx)...');
  const src = libsql.createClient({ url: sourceUrl });
  let insertedTotal = 0;
  for (const t of TABLES) {
    const map = columnMapping(t, srcMeta.cols[t]);
    if (!map.use.length) fail('SAFETY: ' + t + ' tidak punya kolom cocok dgn v31 — abort.');
    log('  ' + t + ': ' + srcMeta.counts[t] + ' baris, ' + map.use.length + ' kolom' +
        (map.dropped.length ? '  (skip: ' + map.dropped.join(',') + ')' : '') +
        (map.defaulted.length ? '  (default: ' + map.defaulted.join(',') + ')' : ''));
    const cols = map.use.join(', ');
    let lastId = 0;
    let pages = 0;
    while (true) {
      // Keyset pagination pada PK id (3 tabel ini semua punya id PK)
      const res = await src.execute(
        { sql: `SELECT * FROM ${t} WHERE id > ? ORDER BY id LIMIT ?`, args: [lastId, PAGE_SIZE] }
      );
      if (!res.rows.length) break;
      pages++;
      const ph = Array(map.use.length).fill('?').join(', ');
      const stmts = res.rows.map((row) => ({
        sql: `INSERT INTO ${t} (${cols}) VALUES (${ph})`,
        args: map.use.map((cn) => toArg(row[cn]))
      }));
      for (let i = 0; i < stmts.length; i += CHUNK_SIZE) {
        const chunk = stmts.slice(i, i + CHUNK_SIZE);
        await c.batch(chunk, 'write'); // 1 tx Turso per chunk (pola C7 terverifikasi)
        insertedTotal += chunk.length;
      }
      lastId = Number(res.rows[res.rows.length - 1].id);
      if (res.rows.length < PAGE_SIZE) break;
    }
    log('    halaman baca=' + pages + ' ok');
  }
  src.close();
  log('  Total INSERT: ' + insertedTotal);

  log('\n[4/5] Bangun ulang ' + INDEXES.length + ' index produksi...');
  for (const sql of INDEXES) await c.execute(sql);
  log('  ' + INDEXES.length + ' index dibuat');

  log('\n[5/5] Stempel schema_version -> 31 (hanya naik; MAX menjaga tak turun)...');
  await c.execute(
    'CREATE TABLE IF NOT EXISTS schema_version(id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)'
  );
  await c.execute(
    'INSERT INTO schema_version(id, version) VALUES (1, 31) ON CONFLICT(id) DO UPDATE SET version = MAX(version, 31)'
  );
  c.close();
}

// ---------------------------------------------------------------------------
// verifikasi (post-restore, read-only)
// ---------------------------------------------------------------------------
async function verify(libsql, targetUrl, auth, srcMeta) {
  const c = libsql.createClient({ url: targetUrl, authToken: auth });
  log('\n===== VERIFIKASI AKHIR =====');
  let ok = true;
  for (const t of TABLES) {
    const n = Number((await c.execute(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
    const match = n === srcMeta.counts[t];
    ok = ok && match;
    log('  COUNT ' + t.padEnd(11) + ' : backup=' + String(srcMeta.counts[t]).padStart(4) +
        '  target=' + String(n).padStart(4) + '  ' + (match ? '✔ SAMA' : '✖ BEDA'));
  }
  const integ = await c.execute('PRAGMA integrity_check');
  const integOk = integ.rows.length && integ.rows[0].integrity_check === 'ok';
  ok = ok && integOk;
  log('  integrity_check : ' + (integOk ? '✔ ok' : '✖ ' + JSON.stringify(integ.rows[0])));
  const sv = await c.execute('SELECT version FROM schema_version LIMIT 1');
  const stamp = sv.rows.length ? Number(sv.rows[0].version) : null;
  const stampOk = stamp === 31;
  ok = ok && stampOk;
  log('  schema_version  : ' + stamp + '  ' + (stampOk ? '✔ = 31' : '✖ harapan 31'));
  let salesN = null;
  try { salesN = Number((await c.execute('SELECT COUNT(*) AS n FROM sales')).rows[0].n); } catch {}
  if (salesN !== null) {
    log('  (info) sales     : ' + salesN + ' baris INTACT (skrip tak menyentuh)');
    if (salesN > 0 && srcMeta.counts.sale_items === 0) {
      log('  (info) PERHATIAN : backup era v21 sale_items-nya kosong. Detail item ' +
        'transaksi lama (sale_items) yg hilang akibat insiden TIDAK bisa dipulihkan ' +
        'dari backup ini — row sales-nya tetap ada tanpa detail item.');
    }
  }
  c.close();
  return ok;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  const args = process.argv.slice(2);
  const EXECUTE = args.includes('--execute');
  const pos = args.filter((a) => !a.startsWith('--'));
  const sourceUrl = normFileUrl(pos[0] || DEFAULT_BACKUP);

  if (!process.env.DATABASE_URL)
    fail('DATABASE_URL tidak diset.\n  set DATABASE_URL=libsql://<host>/<db>  (env Vercel / Turso)');
  if (EXECUTE && !process.env.DATABASE_AUTH_TOKEN)
    fail('DATABASE_AUTH_TOKEN tidak diset (wajib utk --execute).\n' +
         '  Buat write token di Turso, lalu set env var DATABASE_AUTH_TOKEN ke nilai token itu.');

  log('================================================================');
  log(' RESTORE 3 TABEL (products, sale_items, purchases) — ' +
      (EXECUTE ? 'MODE EKSEKUSI (destructive: drop!)' : 'MODE DRY-RUN (aman, read-only)'));
  log('================================================================');
  log('Backup : ' + sourceUrl);
  log('Target : ' + String(process.env.DATABASE_URL).replace(/token=[^&]*/g, 'token=***'));

  const libsql = await import('@libsql/client');

  log('\n----- 1. INSPEKSI BACKUP (read-only) -----');
  const srcMeta = await inspectSource(libsql, sourceUrl);
  log('  integrity_check OK, stamp backup = ' + (srcMeta.stamped ?? 'N/A'));
  for (const t of TABLES) {
    const map = columnMapping(t, srcMeta.cols[t]);
    log('  ' + t + ' : ' + srcMeta.counts[t] + ' baris');
    log('    kolom backup : ' + srcMeta.cols[t].join(', '));
    log('    -> dipakai   : ' + map.use.join(', '));
    if (map.dropped.length) log('    - di-skip    : ' + map.dropped.join(', ') + ' (bukan skema v31)');
    if (map.defaulted.length) log('    + default    : ' + map.defaulted.join(', ') + ' (nilai default v31)');
  }

  log('\n----- 2. INSPEKSI TARGET TURSO (read-only) -----');
  const tgt = await inspectTarget(libsql, process.env.DATABASE_URL, process.env.DATABASE_AUTH_TOKEN);
  for (const t of TABLES) {
    log('  ' + t + ' : ' + (tgt.exists[t]
      ? 'ADA, ' + (tgt.counts[t] ?? 0) + ' baris -> AKAN DI-DROP + dibuat ulang v31'
      : 'TIDAK ADA -> akan dibuat (v31)'));
  }
  log('  stamp target : ' + (tgt.stamped ?? 'belum ada') +
      (tgt.stamped === null || tgt.stamped < 31 ? '  (akan di-set 31)' : '  (sudah >= 31, tak diubah)'));
  if (tgt.salesCount !== null) log('  sales (intact) : ' + tgt.salesCount + ' baris');
  if (!EXECUTE) {
    for (const t of TABLES) {
      if (tgt.exists[t] && (tgt.counts[t] ?? 0) > 0)
        log('  ⚠ ' + t + ' masih berisi ' + tgt.counts[t] + ' baris — --execute akan MENGGANTInya.');
    }
  }

  if (!EXECUTE) {
    log('\n[DRY-RUN selesai] Tak ada perubahan apa pun di backup maupun target.\n' +
      'Untuk memulihkan:\n' +
      '  1. Set env DATABASE_AUTH_TOKEN (write token Turso)\n' +
      '  2. node scripts/restore-db.js ' + (pos[0] ? JSON.stringify(pos[0]) + ' ' : '') + '--execute\n' +
      '  3. Setelah berhasil: Redeploy Vercel -> login admin -> cek halaman Produk/Sales/Pembelian.');
    return;
  }

  log('\n----- 3-5. EKSEKUSI RESTORE -----');
  await doRestore(libsql, process.env.DATABASE_URL, process.env.DATABASE_AUTH_TOKEN, sourceUrl, srcMeta);

  log('\n----- 6. VERIFIKASI -----');
  const ok = await verify(libsql, process.env.DATABASE_URL, process.env.DATABASE_AUTH_TOKEN, srcMeta);

  log('\n' + '='.repeat(60));
  if (ok) {
    log(' ✔ RESTORE BERHASIL — semua verifikasi lolos.');
    log(' Langkah selanjutnya: (1) Redeploy Vercel, (2) login admin');
    log(' (cold start skip fullInit, stempel 31), (3) cek Produk/Sales/Pembelian,');
    log(' (4) laporkan hasil ke Gus Fi & DeepSeek.');
  } else {
    log(' ✖ RESTORE TIDAK LULUS verifikasi — JANGAN redeploy dulu.');
    log('   Ulangi --execute (idempoten: drop+create+insert dari backup).');
    process.exit(1);
  }
})().catch((e) => fail(e.stack || String(e)));

