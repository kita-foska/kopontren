#!/usr/bin/env node
// 2026-10-19 (PIVOT RECOVERY F2): import backup local .db -> DB Turso.
// Konteks: Gus Fi TIDAK punya Turso CLI + Turso Studio tanpa tombol
// Import + Free Plan tanpa restore/PITR -> import via @libsql/client
// (dependensi yang sudah ada di repo). TIDAK memakai ATTACH (tidak
// didukung Turso remote).
//
// Cara kerja:
//   1. Buka SUMBER (file lokal SQLite) dengan backend file @libsql.
//   2. Baca DDL dari sqlite_master (table/index/trigger, selain
//      sqlite_%) + daftar FK (pragma_foreign_key_list) -> urutan
//      topological (FK-safe).
//   3. Tulis DDL ke TARGET dengan IF NOT EXISTS (idempoten aman).
//   4. Salin data per tabel (urut topological) dalam batch DML
//      (INSERT) via client.batch() -- batch Turso remote hanya boleh
//      berisi statement DML (bukan DDL), chunk 100 baris.
//   5. Validasi: hitungan baris per tabel (sumber vs target) +
//      PRAGMA integrity_check target + baca schema_version.
//
// Sumber default: C:/Users/baiti/Downloads/kopontren.db
// (valid 19 Okt: integrity ok, schema_version 21, users 4,
// products 236, sales 0, audit_log 74 -- data s.d. 2-3 Okt).
//
// ── PEMAKAIAN ──────────────────────────────────────────────────────────
//   node scripts/restore-turso.mjs <target-url> [opsi]
//
//   <target-url>
//     Turso : libsql://<db>.<region>.turso.io
//     uji   : file:./data/_restore-test.db   (backend lokal)
//
//   Opsi:
//     --source <file>  sumber (default: kopontren.db di Downloads)
//     --execute        TANPA flag ini = DRY-RUN (cetak rencana saja)
//     --fresh          DROP dulu objek target (reset import ulang)
//     --chunk <n>      ukuran batch INSERT (default 100)
//
//   Token Turso (WAJIB utk target libsql://, lewat environment,
//   jangan diketik di command line agar tak masuk riwayat):
//     Windows: set TURSO_TOKEN=rahasia
//     Token dibuat di Turso Studio: halaman database -> bagian
//     Settings -> Tokens -> Create Token (token write); catat
//     juga Database URL di sana: libsql://<nama-db>.<region>.turso.io
//
//   Contoh uji lokal dulu (aman, tanpa Turso):
//     node scripts/restore-turso.mjs file:./data/_restore-test.db --execute
//   Contoh produksi:
//     set TURSO_TOKEN=xxx
//     node scripts/restore-turso.mjs libsql://kopontren-r2.<region>.turso.io --execute
//
//   SETELAH import sukses: Vercel dashboard -> set env produksi
//   DATABASE_URL (libsql://... di atas) + DATABASE_AUTH_TOKEN,
//   Redeploy, lalu login pertama = cold start migrasi v21->v31
//   (<=90 detik, jangan tutup tab). Turso Studio: SELECT version
//   FROM schema_version; -> harus 31.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire(process.cwd() + '/');
const { createClient } = req('@libsql/client');

// ── argumen ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function opt(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const hasFlag = (n) => argv.includes(n);
const sourceVal = opt('--source');
const targetRaw = argv.find((a) => !a.startsWith('--') && a !== sourceVal);
if (!targetRaw) {
  console.log('pemakaian: node scripts/restore-turso.mjs <target-url> [--source <file>] [--execute] [--fresh] [--chunk <n>]');
  process.exit(1);
}
const SOURCE = sourceVal || 'C:/Users/baiti/Downloads/kopontren.db';
const EXECUTE = hasFlag('--execute');
const FRESH = hasFlag('--fresh');
const CHUNK = Number(opt('--chunk') || 100);

function val(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Uint8Array) return "X'" + Buffer.from(v).toString('hex') + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

console.log('=== RESTORE TURSO -- ' + (EXECUTE ? 'EXECUTE' : 'DRY-RUN') + ' ===');
console.log('sumber : ' + SOURCE);
console.log('target : ' + targetRaw);
if (!fs.existsSync(SOURCE)) { console.error('GAGAL: sumber tidak ada: ' + SOURCE); process.exit(1); }

// ── 1. sumber: DDL + daftar tabel + urut topological FK ─────────────────
const src = createClient({ url: 'file:' + SOURCE });
const objs = await src.execute(
  "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name"
);
const ddls = objs.rows.map((r) => ({ name: r.name, type: r.type, sql: r.sql }));
const tables = ddls.filter((d) => d.type === 'table').map((d) => d.name);
console.log('sumber: ' + ddls.length + ' objek, ' + tables.length + ' tabel');

// topological (Kahn); edge tabel -> tabel-lain dari FK; self-FK diabaikan
const fkOf = new Map();
for (const t of tables) {
  const fk = await src.execute("SELECT * FROM pragma_foreign_key_list('" + t + "')");
  const deps = new Set();
  for (const r of fk.rows) {
    const p = r.table;
    if (p && p !== t) deps.add(p);
  }
  fkOf.set(t, deps);
}
const remaining = new Set(tables);
const order = [];
let changed = true;
while (changed) {
  changed = false;
  for (const t of [...remaining]) {
    if ([...fkOf.get(t)].every((d) => !remaining.has(d))) {
      remaining.delete(t);
      order.push(t);
      changed = true;
    }
  }
}
// sisa = siklus (langka utk SQLite opsional); tambahkan berurutan
for (const t of [...remaining]) order.push(t);
const pos = new Map(order.map((t, i) => [t, i]));
const ddlOrder = [...ddls].sort((a, b) => {
  const rank = (t) => (t === 'table' ? 0 : 1); // tabel dulu, lalu index/trigger/view
  if (rank(a.type) !== rank(b.type)) return rank(a.type) - rank(b.type);
  if (a.type === 'table') return pos.get(a.name) - pos.get(b.name);
  return a.name < b.name ? -1 : 1;
});
const counts = new Map();
for (const t of order) {
  const r = await src.execute('SELECT COUNT(*) AS n FROM "' + t + '"');
  counts.set(t, Number(r.rows.length ? r.rows[0].n : 0));
}
console.log('data: ' + [...counts.entries()].map(([t, n]) => t + '=' + n).join(', '));
console.log('urutan import: ' + order.join(' -> '));

if (!EXECUTE) {
  console.log('\n[DRY-RUN] rencana: ' + ddls.length + ' DDL + ' + tables.length + ' tabel data.');
  console.log('[DRY-RUN] tidak ada penulisan. Tambah --execute untuk menjalankan.');
  src.close();
  process.exit(0);
}

// ── 2. target: buka + guard keamanan ─────────────────────────────────────
const targetIsFile = targetRaw.startsWith('file:');
const tgtUrl = targetRaw; // file: utk backend lokal, libsql:// utk Turso
if (!targetIsFile && !process.env.TURSO_TOKEN && !process.env.DATABASE_AUTH_TOKEN) {
  console.error('GAGAL: token Turso diperlukan. Set TURSO_TOKEN dulu.');
  console.error('  Windows: set TURSO_TOKEN=rahasia');
  console.error('  Token: Turso Studio -> halaman database -> Settings -> Tokens -> Create Token.');
  process.exit(1);
}
const tgt = createClient({
  url: tgtUrl,
  authToken: targetIsFile ? undefined : process.env.TURSO_TOKEN || process.env.DATABASE_AUTH_TOKEN,
});
const existingRows = await tgt.execute(
  "SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'"
);
if (existingRows.rows.length > 0 && !FRESH) {
  console.error('TARGET SUDAH terisi (' + existingRows.rows.length + ' objek) -- reset ulang pakai --fresh, atau target kosong.');
  process.exit(1);
}
if (FRESH && existingRows.rows.length > 0) {
  for (const d of [...ddlOrder].reverse()) {
    const kw = { table: 'DROP TABLE IF EXISTS ', index: 'DROP INDEX IF EXISTS ', trigger: 'DROP TRIGGER IF EXISTS ', view: 'DROP VIEW IF EXISTS ' }[d.type];
    try {
      await tgt.execute(kw + '"' + d.name + '"');
    } catch (e) {
      console.error('DROP GAGAL [' + d.type + ' ' + d.name + ']: ' + e.message);
    }
  }
  console.log('--fresh: ' + ddls.length + ' objek lama di-drop');
}

// ── 3. salin DDL (dengan IF NOT EXISTS) ─────────────────────────────────
for (const d of ddlOrder) {
  let sql = d.sql;
  if (d.type === 'table') sql = sql.replace(/CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ');
  else if (d.type === 'index') sql = sql.replace(/CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ');
  else if (d.type === 'trigger') sql = sql.replace('CREATE TRIGGER ', 'CREATE TRIGGER IF NOT EXISTS ');
  else if (d.type === 'view') sql = sql.replace(/CREATE (MATERIALIZED )?VIEW /, 'CREATE $1VIEW IF NOT EXISTS ');
  try {
    await tgt.execute(sql);
    if (process.env.DEBUG_DDL) console.log('ddl ok: [' + d.type + ' ' + d.name + ']');
  } catch (e) {
    console.error('DDL GAGAL [' + d.type + ' ' + d.name + ']: ' + e.message + '\n' + sql);
    process.exit(3);
  }
}
console.log('DDL: ' + ddls.length + ' objek tersalin');

// ── 4. salin data per batch DML ──────────────────────────────────────────
for (const t of order) {
  const n = counts.get(t) || 0;
  if (n === 0) { console.log(t + ': 0 baris (skip)'); continue; }
  const all = await src.execute('SELECT * FROM "' + t + '"');
  const cols = all.columns && all.columns.length ? all.columns : (all.rows[0] ? Object.keys(all.rows[0]) : []);
  let done = 0;
  for (let i = 0; i < all.rows.length; i += CHUNK) {
    const chunk = all.rows.slice(i, i + CHUNK);
    const stmts = chunk.map((row) =>
      'INSERT INTO "' + t + '" ("' + cols.join('","') + '") VALUES (' + cols.map((col) => val(row[col])).join(',') + ')'
    );
    await tgt.batch(stmts, 'write');
    done += chunk.length;
    process.stdout.write('\r' + t + ': ' + done + '/' + n + ' ');
  }
  console.log('\n' + t + ': ' + done + ' baris OK');
}

// ── 5. validasi ──────────────────────────────────────────────────────────
let mismatch = 0;
for (const t of order) {
  const r = await tgt.execute('SELECT COUNT(*) AS n FROM "' + t + '"');
  const got = Number(r.rows.length ? r.rows[0].n : 0);
  if (got !== (counts.get(t) || 0)) {
    console.error('MISMATCH ' + t + ': target=' + got + ' sumber=' + (counts.get(t) || 0));
    mismatch++;
  }
}
const iv = await tgt.execute('PRAGMA integrity_check');
const sv = await tgt.execute('SELECT version FROM schema_version').catch(() => null);
console.log('integrity target: ' + JSON.stringify(iv.rows));
console.log('schema_version target: ' + (sv && sv.rows.length ? sv.rows[0].version : '(tidak ada)'));
console.log(mismatch === 0 ? 'VALIDASI LULUS: semua count cocok.' : 'VALIDASI GAGAL: ' + mismatch + ' tabel berbeda -- ulangi dengan --fresh.');
src.close();
tgt.close();
process.exit(mismatch === 0 ? 0 : 2);

