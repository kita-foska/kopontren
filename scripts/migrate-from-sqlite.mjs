// One-off migration: local SQLite (data/kopontren.db, node:sqlite) -> Turso (libSQL).
// Usage (from project root, needs Node 22+):
//   1. Set env vars:  $env:DATABASE_URL='libsql://...'; $env:DATABASE_AUTH_TOKEN='...'
//   2. node scripts/migrate-from-sqlite.mjs
// It copies users + operational data (products, sales, sale_items, purchases,
// expenses, cash_entries, consignments) with explicit ids. Sessions are skipped
// (everyone logs in again on the new deploy - cleaner & safer).
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import path from 'node:path';
import process from 'node:process';

const srcPath =
  process.env.LOCAL_DB || path.join(process.cwd(), 'data', 'kopontren.db');
const url = process.env.DATABASE_URL || '';
const token = process.env.DATABASE_AUTH_TOKEN || '';
if (!url) {
  console.error('Set DATABASE_URL first (Turso database URL).');
  process.exit(1);
}

const src = new DatabaseSync(srcPath, { readOnly: true });
const dst = createClient({ url, authToken: token || undefined });

const TABLES = [
  'users',
  'products',
  'sales',
  'sale_items',
  'purchases',
  'expenses',
  'cash_entries',
  'consignments',
];

for (const t of TABLES) {
  const rows = src.prepare(`SELECT * FROM ${t}`).all();
  if (rows.length === 0) {
    console.log(`- ${t}: 0 rows (skipped)`);
    continue;
  }
  const cols = Object.keys(rows[0]);
  // insert in batches of 100 rows
  const chunk = 100;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const ph = part.map(() => '(' + cols.map(() => '?').join(',') + ')').join(',');
    const sql = `INSERT INTO ${t} (${cols.join(',')}) VALUES ${ph}`;
    const args = part.flatMap((r) =>
      cols.map((c) => {
        const v = r[c];
        if (typeof v === 'bigint') return Number(v);
        return v === undefined ? null : v;
      })
    );
    await dst.execute({ sql, args });
  }
  console.log(`- ${t}: ${rows.length} rows copied`);
}

// sanity check
const rs = await dst.execute('SELECT COUNT(*) x FROM sales');
console.log('Done. sales rows in destination:', rs.rows[0] ? rs.rows[0].x : '?');
try { src.close(); } catch {}
await dst.close();
