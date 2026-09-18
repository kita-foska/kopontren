// Import produk dari Excel ke Turso (CLI, jalankan lokal dari root project).
// PERLU: npm i xlsx  (sudah ditambahkan ke devDependencies; install dulu)
//
// Usage (Node 22+):
//   1. Set env:  $env:DATABASE_URL='libsql://...' ; $env:DATABASE_AUTH_TOKEN='...'
//   2. node scripts/import-excel.mjs nama\file.xlsx                 (dry-run)
//      node scripts/import-excel.mjs nama\file.xlsx --apply
//      node scripts/import-excel.mjs nama\file.xlsx --sheet atk-kita --apply
//
// Mapping kolom (header case-insensitive, alias didukung):
//   code | barcode                -> barcode
//   name | produk | item           -> name  (wajib)
//   UOM | satuan | unit            -> unit
//   cost | hpp | biaya | harga modal -> cost_price
//   unit price | hsl | harga       -> base_price
//   stock | stok                   -> stock (opsional, default 0)
//   category | kategori            -> category (opsional)
//
// Upsert sama seperti import-products.mjs: barcode -> update, selain itu insert;
// tanpa barcode -> update per nama (case-insensitive).
import * as XLSX from 'xlsx';
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const url = process.env.DATABASE_URL || '';
const token = process.env.DATABASE_AUTH_TOKEN || '';
if (!url) {
  console.error('Set DATABASE_URL dulu (URL database Turso).');
  process.exit(1);
}
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const sheetIdx = args.indexOf('--sheet');
const sheetName = sheetIdx >= 0 ? args[sheetIdx + 1] : undefined;
const file = args.find((a) => !a.startsWith('--') && a !== sheetName);
if (!file) {
  console.error('Usage: node scripts/import-excel.mjs <file.xlsx> [--sheet <nama> | --apply]');
  process.exit(1);
}

function normKey(k) {
  return String(k ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}
const ALIAS = {
  barcode: ['code', 'barcode'],
  name: ['name', 'produk', 'item', 'namaproduk'],
  unit: ['uom', 'satuan', 'unit'],
  cost_price: ['cost', 'hpp', 'biaya', 'hargamodal', 'costprice'],
  base_price: ['unitprice', 'hsl', 'harga', 'baseprice', 'salerec'],
  stock: ['stock', 'stok'],
  category: ['category', 'kategori'],
};
function findCol(keys, field) {
  const want = ALIAS[field] || [field];
  for (const k of keys) {
    const nk = normKey(k);
    if (want.includes(nk)) return k;
  }
  return null;
}

const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
const wsName = sheetName || wb.SheetNames[0];
const ws = wb.Sheets[wsName];
if (!ws) {
  console.error(`Sheet tidak ditemukan: ${sheetName}. Tersedia: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
console.log(`File: ${file} | Sheet: ${wsName} | Sheet lain: ${wb.SheetNames.join(', ')}`);

const all = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
if (all.length === 0) {
  console.log('Sheet kosong.');
  process.exit(0);
}
const keys = Object.keys(all[0]);
const map = {};
for (const f of ['barcode', 'name', 'unit', 'cost_price', 'base_price', 'stock', 'category']) {
  map[f] = findCol(keys, f);
}
console.log(
  `Mapping kolom: ${['barcode', 'name', 'unit', 'cost_price', 'base_price', 'stock', 'category']
    .map((f) => `${f}=${map[f] ?? '(tidak ketemu)'}`)
    .join(' | ')}`
);
if (!map.name) {
  console.error('Kolom nama produk tidak ketemu (coba: name / produk / item).');
  process.exit(1);
}
if (!map.base_price) {
  console.error('Kolom HSL (unit price / hsl / harga) tidak ketemu — import dibatalkan.');
  process.exit(1);
}
if (!map.cost_price) console.warn('PERHATIAN: kolom HPP (cost/hpp) tidak ketemu — semua cost_price akan 0.');

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/[^\d.-]/g, '')) || 0;
};

const rows = [];
const errors = [];
const seenBarcode = new Map();
all.forEach((o, i) => {
  const line = i + 2; // +2: header sheet
  const name = String(o[map.name] ?? '').trim();
  const barcode = String(o[map.barcode] ?? '').trim();
  const base = num(o[map.base_price]);
  const cost = num(o[map.cost_price]);
  const stock = num(o[map.stock]);
  let bad = false;
  if (!name) {
    errors.push(`Baris ${line}: nama kosong`);
    bad = true;
  }
  const fields = [
    ['base_price', base, map.base_price],
    ['cost_price', cost, map.cost_price],
    ['stock', stock, map.stock],
  ];
  for (const [label, v, col] of fields) {
    if (!Number.isFinite(v) || v < 0) {
      errors.push(`Baris ${line} (${name}): ${label} tidak valid (${col ? String(o[col]) : 'kolom tidak ditemukan'})`);
      bad = true;
    }
  }
  if (bad) return;
  if (barcode) {
    if (seenBarcode.has(barcode)) {
      errors.push(`Baris ${line} (${name}): barcode ${barcode} duplikat (baris ${seenBarcode.get(barcode)})`);
      return;
    }
    seenBarcode.set(barcode, line);
  }
  rows.push({
    line,
    name,
    category: map.category ? String(o[map.category] ?? '').trim() : '',
    unit: (map.unit ? String(o[map.unit] ?? '').trim() : '') || 'pcs',
    base_price: Math.round(base),
    cost_price: Math.round(cost),
    stock: Math.round(stock),
    barcode,
  });
});

console.log(`Baris valid: ${rows.length} | Bermasalah: ${errors.length}`);
if (errors.length) {
  console.log('--- ERROR ---');
  for (const e of errors.slice(0, 40)) console.log('  ' + e);
}
if (rows.length === 0 || !apply) {
  console.log('\nTidak ada yang ditulis. Jalankan ulang dengan --apply untuk import.');
  process.exit(0);
}

const client = createClient({ url, authToken: token || undefined });
const upd = client.prepare(
  `UPDATE products SET name=?, category=?, unit=?, base_price=?, cost_price=?, stock=? WHERE barcode=?`
);
const ins = client.prepare(
  `INSERT INTO products (name, category, unit, base_price, cost_price, stock, active, barcode)
   VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
);
const updName = client.prepare(
  `UPDATE products SET category=?, unit=?, base_price=?, cost_price=?, stock=? WHERE lower(name)=lower(?)`
);
const insPlain = client.prepare(
  `INSERT INTO products (name, category, unit, base_price, cost_price, stock, active, barcode)
   VALUES (?, ?, ?, ?, ?, ?, 1, '')`
);

let inserted = 0;
let updated = 0;
const failed = [];
for (const r of rows) {
  try {
    if (r.barcode) {
      const res = await upd.run(r.name, r.category, r.unit, r.base_price, r.cost_price, r.stock, r.barcode);
      if (res.rowsAffected > 0) updated++;
      else {
        await ins.run(r.name, r.category, r.unit, r.base_price, r.cost_price, r.stock, r.barcode);
        inserted++;
      }
    } else {
      const res = await updName.run(r.category, r.unit, r.base_price, r.cost_price, r.stock, r.name);
      if (res.rowsAffected > 0) updated++;
      else {
        await insPlain.run(r.name, r.category, r.unit, r.base_price, r.cost_price, r.stock);
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
await client.close();
