// Import produk dari CSV ke Turso (CLI, jalankan lokal dari root project).
// Usage (Node 22+):
//   1. Set env:  $env:DATABASE_URL='libsql://...' ; $env:DATABASE_AUTH_TOKEN='...'
//   2. node scripts/import-products.mjs path\ke\file.csv            (dry-run: preview saja)
//      node scripts/import-products.mjs path\ke\file.csv --apply    (lakukan import)
//
// Format kolom CSV (header opsional): name, category, unit, base_price, cost_price, stock, barcode
// Upsert: barcode ada  -> update baris dengan barcode sama, selain itu insert baru.
//         barcode kosong -> update berdasarkan nama (case-insensitive), selain itu insert baru.
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: node scripts/import-products.mjs <file.csv> [--apply]');
  process.exit(1);
}
// Dry-run (tanpa --apply) hanya parse + preview file, tidak butuh koneksi DB.
// (Dry-run (without --apply) only parses + previews the file, no DB connection needed.)
const url = process.env.DATABASE_URL || '';
const token = process.env.DATABASE_AUTH_TOKEN || '';
if (apply && !url) {
  console.error('Set DATABASE_URL dulu (URL database Turso) untuk --apply.');
  process.exit(1);
}

// ---- CSV parsing (sama seperti di src/lib/product-import.ts) ----
function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let cur = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      if (cur.length > 1 || cur[0] !== '') rows.push(cur);
      cur = [];
    } else field += ch;
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field);
    if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  }
  return rows;
}

const raw = parseCsv(readFileSync(file, 'utf8'));
let start = 0;
const first = raw[0]?.map((c) => String(c).trim().toLowerCase()) || [];
if (first[0] === 'name' && first.includes('base_price')) start = 1;

const rows = [];
const errors = [];
const seenBarcode = new Map();
for (let i = start; i < raw.length; i++) {
  const c = raw[i];
  const line = i + 1;
  const name = String(c[0] ?? '').trim();
  const barcode = String(c[6] ?? '').trim();
  const base = Number(String(c[3] ?? '').trim() || 0);
  const cost = Number(String(c[4] ?? '').trim() || 0);
  const stock = Number(String(c[5] ?? '').trim() || 0);
  if (!name) {
    errors.push(`Baris ${line}: name kosong`);
    continue;
  }
  let bad = false;
  for (const [label, v] of [
    ['base_price', base],
    ['cost_price', cost],
    ['stock', stock],
  ]) {
    if (!Number.isFinite(v)) {
      errors.push(`Baris ${line} (${name}): ${label} bukan angka`);
      bad = true;
    } else if (v < 0) {
      errors.push(`Baris ${line} (${name}): ${label} negatif (${v})`);
      bad = true;
    }
  }
  if (bad) continue;
  if (barcode) {
    if (seenBarcode.has(barcode)) {
      errors.push(`Baris ${line} (${name}): barcode ${barcode} duplikat (baris ${seenBarcode.get(barcode)})`);
      continue;
    }
    seenBarcode.set(barcode, line);
  }
  rows.push({
    line,
    name,
    category: String(c[1] ?? '').trim(),
    unit: String(c[2] ?? '').trim() || 'pcs',
    base_price: Math.round(base),
    cost_price: Math.round(cost),
    stock: Math.round(stock),
    barcode,
  });
}

console.log(`File: ${file}`);
console.log(`Baris valid: ${rows.length} | Bermasalah: ${errors.length}`);
if (errors.length) {
  console.log('\n--- ERROR (baris dilewati) ---');
  for (const e of errors.slice(0, 40)) console.log('  ' + e);
  if (errors.length > 40) console.log(`  … dan ${errors.length - 40} lagi`);
}
// ---- preview statistik (margin) ----
const costZero = rows.filter((r) => r.cost_price === 0);
const lowMargin = rows.filter((r) => {
  if (r.base_price <= 0 || r.cost_price <= 0) return false;
  return (r.base_price - r.cost_price) / r.base_price < 0.05;
});
console.log(`\nHarga modal = 0: ${costZero.length} (contoh: ${costZero.slice(0, 10).map((r) => r.name).join(', ') || '-'})`);
console.log(`Margin < 5%: ${lowMargin.length} (contoh: ${lowMargin.slice(0, 10).map((r) => r.name).join(', ') || '-'})`);

if (!apply) {
  console.log('\n[DRY RUN] Tidak ada data tertulis. Tambahkan flag --apply untuk melakukan import.');
  process.exit(0);
}

const client = createClient({ url, authToken: token || undefined });
// @libsql/client >= 0.15: client.prepare() sudah dihapus -> pakai execute(sql, args).
// Catatan: hasil execute(UPDATE) tidak menyediakan affectedRowCount,
// jadi upsert memakai eksistensi (SELECT 1) untuk menentukan update vs insert.
const updSql = `UPDATE products SET name=?, category=?, unit=?, base_price=?, cost_price=?, stock=? WHERE barcode=?`;
const insSql = `INSERT INTO products (name, category, unit, base_price, cost_price, stock, active, barcode)
   VALUES (?, ?, ?, ?, ?, ?, 1, ?)`;
const exBarcodeSql = `SELECT 1 FROM products WHERE barcode=?`;
const updNameSql = `UPDATE products SET category=?, unit=?, base_price=?, cost_price=?, stock=? WHERE lower(name)=lower(?)`;
const insPlainSql = `INSERT INTO products (name, category, unit, base_price, cost_price, stock, active, barcode)
   VALUES (?, ?, ?, ?, ?, ?, 1, '')`;
const exNameSql = `SELECT 1 FROM products WHERE lower(name)=lower(?)`;

let inserted = 0;
let updated = 0;
const failed = [];
for (const r of rows) {
  try {
    if (r.barcode) {
      const ex = await client.execute(exBarcodeSql, [r.barcode]);
      if (ex.rows.length > 0) {
        await client.execute(updSql, [
          r.name, r.category, r.unit, r.base_price, r.cost_price, r.stock, r.barcode
        ]);
        updated++;
      } else {
        await client.execute(insSql, [
          r.name, r.category, r.unit, r.base_price, r.cost_price, r.stock, r.barcode
        ]);
        inserted++;
      }
    } else {
      const ex = await client.execute(exNameSql, [r.name]);
      if (ex.rows.length > 0) {
        await client.execute(updNameSql, [
          r.category, r.unit, r.base_price, r.cost_price, r.stock, r.name
        ]);
        updated++;
      } else {
        await client.execute(insPlainSql, [
          r.name, r.category, r.unit, r.base_price, r.cost_price, r.stock
        ]);
        inserted++;
      }
    }
  } catch (e) {
    failed.push(`Baris ${r.line} (${r.name}): ${String((e && e.message) || e)}`);
  }
}
const count = await client.execute(`SELECT COUNT(*) c FROM products`);

console.log(`\nImport selesai: ${inserted} baru, ${updated} di-update, ${failed.length} gagal.`);
if (failed.length) {
  console.log('--- GAGAL ---');
  for (const f of failed.slice(0, 30)) console.log('  ' + f);
}
console.log(`Total produk di database sekarang: ${count.rows[0]?.c ?? '?'}`);

// post-import health report
const cz = await client.execute(
  `SELECT name FROM products WHERE cost_price = 0 ORDER BY name LIMIT 20`
);
const lm = await client.execute(
  `SELECT name, base_price, cost_price FROM products
   WHERE active = 1 AND base_price > 0 AND cost_price > 0
     AND (base_price - cost_price) * 100 < base_price * 5
   ORDER BY base_price DESC LIMIT 20`
);
console.log(`\nPeringatan: ${cz.rows.length} produk HPP=0: ${cz.rows.map((r) => String(r.name)).join(', ')}`);
console.log(`Peringatan: ${lm.rows.length} produk margin<5%: ${lm.rows.map((r) => `${r.name} (${Math.round(((Number(r.base_price) - Number(r.cost_price)) / Number(r.base_price)) * 100)}%)`).join(', ')}`);

await client.close();
