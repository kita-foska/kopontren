// Backup Turso database via the raw HTTP protocol (no native libsql driver).
// Works even on machines where the @libsql prebuilt binary is broken.
// Usage: node scripts/backup-turso-http.mjs [outfile.sql]
// Reads DATABASE_URL / DATABASE_AUTH_TOKEN from process.env or .env.
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
if (!url || !url.startsWith('libsql://')) {
  console.error('DATABASE_URL (libsql://...) tidak ditemukan di .env / environment');
  process.exit(1);
}
const httpsUrl = url.replace('libsql://', 'https://');

async function q(stmt, args = []) {
  const r = await fetch(httpsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ stmt, args }),
  });
  if (!r.ok) throw new Error(`Turso HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  // hrana protocol: { result: { rows: { values }, columns } }; legacy: { rows, columns }
  const rows = j.result?.rows?.values ?? j.rows?.values ?? [];
  const columns = j.result?.columns ?? j.columns ?? [];
  return { rows, columns };
}

const outPath =
  process.argv[2] ||
  path.join(
    import.meta.dirname,
    '..',
    'data',
    `backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql`
  );

console.log('Koneksi ke Turso (HTTP)...');
const { rows: tableRows, columns } = await q(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
);
const tables = tableRows.map((r) => String(r[0]));
console.log(`Tabel (${tables.length}): ${tables.join(', ')}`);

let sql = `-- Kopontren database backup (HTTP) — ${new Date().toISOString()}\n`;
for (const t of tables) {
  const ddl = await q(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${t}'`);
  sql += `\n-- table: ${t}\n${String(ddl.rows[0]?.[0] ?? '')};\n`;
  const data = await q(`SELECT * FROM "${t}"`);
  for (const row of data.rows) {
    const vals = row.map((v) => {
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number' || typeof v === 'bigint') return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    sql += `INSERT INTO "${t}" VALUES (${vals.join(', ')});\n`;
  }
  console.log(`  ${t}: ${data.rows.length} baris`);
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, sql, 'utf8');
console.log(
  `OK -> ${outPath} (${(Buffer.byteLength(sql) / 1024).toFixed(1)} KB)`
);
