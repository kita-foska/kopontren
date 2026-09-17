// Backup the live Turso (libSQL) database to a local SQL file (schema + data).
// Run before schema-changing work:  node scripts/backup-db.mjs [outfile]
// Reads DATABASE_URL / DATABASE_AUTH_TOKEN from process.env or .env.
import { createClient } from '@libsql/client';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 0) continue;
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    /* no .env */
  }
  return out;
}

const env = loadEnv(path.join(import.meta.dirname, '..', '.env'));
const url = process.env.DATABASE_URL || env.DATABASE_URL;
const token = process.env.DATABASE_AUTH_TOKEN || env.DATABASE_AUTH_TOKEN;
if (!url) {
  console.error('DATABASE_URL tidak ditemukan (.env / environment)');
  process.exit(1);
}

const client = createClient({ url, authToken: token || undefined });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath =
  process.argv[2] || path.join(import.meta.dirname, '..', 'data', `backup-${stamp}.sql`);

const tables = (
  await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
).rows.map((r) => String(r.name[0]));

let sql = `-- Kopontren database backup — ${new Date().toISOString()}\n`;
for (const t of tables) {
  const ddl = await client.execute(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='${t}'`
  );
  sql += `\n-- table: ${t}\n${String(ddl.rows[0]?.[0] ?? '')};\n`;
  const data = await client.execute(`SELECT * FROM "${t}"`);
  for (const row of data.rows) {
    const vals = row.map((v) => {
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number' || typeof v === 'bigint') return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    sql += `INSERT INTO "${t}" VALUES (${vals.join(', ')});\n`;
  }
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, sql, 'utf8');
console.log(
  `Backup ${tables.length} tabel (${tables.join(', ')}) -> ${outPath} ` +
    `(${(Buffer.byteLength(sql) / 1024).toFixed(1)} KB)`
);
