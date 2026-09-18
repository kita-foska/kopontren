// Verification script: checks the new indexes & reported_at column against a
// scratch copy of the local database (never the original).
// Usage: node scripts/verify-schema.mjs
import { copyFileSync } from 'node:fs';
import { createClient } from '@libsql/client';

const LOCAL = 'D:/Ngudi Susilo/kopontren-app/data/kopontren.db';
const SCRATCH = 'D:/Ngudi Susilo/kopontren-app/data/scratch-verify.db';
const SCRATCH_URL = 'file:///D:/Ngudi Susilo/kopontren-app/data/scratch-verify.db';

copyFileSync(LOCAL, SCRATCH);
const client = createClient({ url: SCRATCH_URL });
const exec = async (sql, args = []) =>
  client.execute({ sql, args: args.length ? args : undefined });

// 1. The new indexes (same statements db.ts SCHEMA now contains)
await exec("CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at)");
await exec("CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at)");
await exec("CREATE INDEX IF NOT EXISTS idx_cash_created ON cash_entries(created_at)");
const idx = await exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name");
console.log('indexes:', idx.rows.map((r) => r.name).join(', '));

// 2. Check reported_at the same way migrate() adds it (idempotent ALTER)
const cols = await exec("SELECT name FROM pragma_table_info('sales')");
const hasCol = cols.rows.some((r) => r.name === 'reported_at');
console.log('reported_at present BEFORE migrate:', hasCol);
try {
  await exec("ALTER TABLE sales ADD COLUMN reported_at TEXT");
  console.log('ALTER applied on scratch copy');
} catch (e) {
  console.log('ALTER skipped/failed (expected when column already exists):', e.message);
}
const after = await exec("SELECT name FROM pragma_table_info('sales')");
console.log('reported_at present AFTER migrate:', after.rows.some((r) => r.name === 'reported_at'));

// 3. Dashboard-style query runs (the one from app/page.tsx), with args
const dayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
const r = await exec(`SELECT COALESCE(SUM(total),0) FROM sales WHERE created_at >= ?`, [dayStart]);
console.log('sales total since', dayStart, '=', Number(r.rows[0]?.[0] ?? 0));
const unreported = await exec(`SELECT COUNT(*) AS c FROM sales WHERE status = 'unreported'`);
console.log('unreported sales:', unreported.rows[0].c);

// 4. The exact UPDATE db() runs on every cold start — would 500 everything if the column is missing
await exec(`UPDATE sales SET reported_at = created_at WHERE status = 'unreported' AND reported_at IS NULL`);
console.log('db() cold-start UPDATE: OK');

console.log('VERIFY OK');
await client.close();

