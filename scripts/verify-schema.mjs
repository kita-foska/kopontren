// Verify that every DDL/migration statement in src/db.ts is valid SQL and
// produces the expected indexes/columns — on a scratch in-memory SQLite
// (node:sqlite), so no Turso connection or native driver is needed.
// Usage: node scripts/verify-schema.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const src = readFileSync(path.join(import.meta.dirname, '..', 'src', 'db.ts'), 'utf8');

// ---- 1) extract the SCHEMA template literal ----
const mSchema = /const SCHEMA = `([\s\S]*?)`/.exec(src);
if (!mSchema) throw new Error('SCHEMA template literal tidak ditemukan di db.ts');

// ---- 2) extract SQL strings from d.exec('...') / execColumn(d, '...') lines ----
const stmts = [];
for (const line of src.split(/\r?\n/)) {
  const m = /^\s*await (?:d\.exec\(|execColumn\(\w+, )(['"])((?:[^'\\]|\\.)*)\1/.exec(line);
  if (m) {
    const quote = m[1];
    stmts.push(m[2].replace(new RegExp('\\\\' + quote, 'g'), quote));
  }
}

// Quote-aware SQL statement splitter ('' inside a literal is an escaped quote).
function splitSql(sql) {
  const out = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (sql[i + 1] === "'") {
          cur += "'";
          i++;
        } else inStr = false;
      }
      continue;
    }
    if (c === "'") {
      inStr = true;
      cur += c;
      continue;
    }
    if (c === ';') {
      const s = cur.trim();
      if (s) out.push(s);
      cur = '';
      continue;
    }
    cur += c;
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

const db = new DatabaseSync(':memory:');

// 3) apply base schema
for (const s of splitSql(mSchema[1])) db.exec(s);

// 4) apply migration statements (simulate execColumn: skip existing columns)
function columnExists(table, col) {
  return db
    .prepare(`PRAGMA table_info('${table}')`)
    .all()
    .some((r) => r.name === col);
}
for (const s of stmts) {
  const m = /^ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(s);
  if (m && columnExists(m[1], m[2])) {
    console.log(`skip (sudah ada): ${s}`);
    continue;
  }
  const head = s.trim().split(/\s+/)[0].toUpperCase();
  if (['ROLLBACK', 'COMMIT', 'BEGIN'].includes(head)) continue;
  db.exec(s);
}

// 5) verify expected indexes
const idx = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name`)
  .all()
  .map((r) => r.name);
console.log('index tersedia:', idx.join(', '));
const expected = [
  'idx_sales_created',
  'idx_sales_member',
  'idx_sales_status',
  'idx_shifts_kasir',
  'idx_audit_created',
  'idx_purchases_created',
  'idx_expenses_created',
  'idx_cash_entries_created',
];
const missingIdx = expected.filter((e) => !idx.includes(e));
if (missingIdx.length) {
  console.error('FAIL — index belum dibuat:', missingIdx.join(', '));
  process.exit(1);
}

// 6) verify sales columns needed by the code
const cols = db.prepare(`PRAGMA table_info(sales)`).all().map((r) => r.name);
const need = ['reported_at', 'member_id', 'amount_paid', 'change', 'discount', 'member_points'];
const missingCols = need.filter((c) => !cols.includes(c));
if (missingCols.length) {
  console.error('FAIL — kolom sales belum tersedia:', missingCols.join(', '));
  process.exit(1);
}

console.log('OK — semua index & kolom tersedia di scratch DB (node:sqlite)');
