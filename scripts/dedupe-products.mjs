// Dedup produk satu kali: gabungkan produk dengan nama sama (case-insensitive).
// Latar belakang: bug script import (affectedRowCount tidak tersedia di hasil
// execute() libSQL) membuat upsert selalu jadi INSERT -> 228 baris duplikat.
//
// Cara kerja: untuk tiap grup nama duplikat, simpan id terkecil; alihkan
// referensi (sales_items, sales_items_return, tabel lain yang punya
// product_id) ke produk yang disimpan, lalu hapus baris duplikat.
//
// Dry-run: node scripts/dedupe-products.mjs
// Apply:   node scripts/dedupe-products.mjs --apply
import { createClient } from '@libsql/client';

const url = process.env.DATABASE_URL || '';
const token = process.env.DATABASE_AUTH_TOKEN || '';
if (!url) {
  console.error('Set DATABASE_URL dulu (URL database Turso).');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const client = createClient({ url, authToken: token || undefined });

// Cari tabel yang punya kolom product_id
const allTables = (
  await client.execute(`SELECT name FROM sqlite_master WHERE type='table'`)
).rows.map((r) => String(r.name));
const refTables = [];
for (const t of allTables) {
  const cols = await client.execute(`PRAGMA table_info('${t}')`);
  if (cols.rows.some((c) => String(c.name) === 'product_id')) refTables.push(t);
}
console.log('Tabel yang merujuk product_id:', refTables.join(', ') || '(tidak ada)');

const groups = await client.execute(`
  SELECT
    CASE WHEN TRIM(barcode) != '' THEN 'bc:' || barcode ELSE 'nm:' || lower(name) END AS k,
    MIN(id) keep_id,
    GROUP_CONCAT(id) ids,
    COUNT(*) c
  FROM products
  GROUP BY k
  HAVING COUNT(*) > 1
`);
const totalDrop = groups.rows.reduce((a, g) => a + (Number(g.c) - 1), 0);
console.log(`Grup terduplikasi: ${groups.rows.length} | baris yang akan dihapus: ${totalDrop}`);
if (totalDrop === 0) {
  console.log('Tidak ada duplikat. Tidak ada yang dilakukan.');
  await client.close();
  process.exit(0);
}

if (!apply) {
  for (const g of groups.rows.slice(0, 10)) {
    console.log(`  "${g.k}": simpan id=${g.keep_id}, hapus: ${String(g.ids).split(',').filter((x) => x !== String(g.keep_id)).join(', ')}`);
  }
  console.log(`\nDRY-RUN: tidak ada yang diubah. Jalankan lagi dengan --apply.`);
  await client.close();
  process.exit(0);
}

let deleted = 0;
let moved = 0;
for (const g of groups.rows) {
  const ids = String(g.ids).split(',').map(Number);
  const keep = Math.min(...ids);
  for (const drop of ids.filter((x) => x !== keep)) {
    // Alihkan referensi penjualan ke produk yang disimpan
    for (const t of refTables) {
      const cnt = Number((await client.execute(`SELECT COUNT(*) c FROM ${t} WHERE product_id=?`, [drop])).rows[0].c);
      if (cnt > 0) {
        await client.execute(`UPDATE ${t} SET product_id=? WHERE product_id=?`, [keep, drop]);
        moved += cnt;
      }
    }
    await client.execute(`DELETE FROM products WHERE id=?`, [drop]);
    deleted++;
  }
}
const total = Number((await client.execute(`SELECT COUNT(*) c FROM products`)).rows[0].c);
const left = Number((await client.execute(`
  SELECT COUNT(*) c FROM (
    SELECT 1 FROM products
    GROUP BY CASE WHEN TRIM(barcode) != '' THEN 'bc:' || barcode ELSE 'nm:' || lower(name) END
    HAVING COUNT(*)>1
  )
`)).rows[0].c);
let orphans = 0;
for (const t of refTables) {
  orphans += Number(
    (await client.execute(
      `SELECT COUNT(*) c FROM ${t} si LEFT JOIN products p ON p.id = si.product_id WHERE p.id IS NULL`
    )).rows[0].c
  );
}
console.log(`\nDedup selesai: ${deleted} baris duplik dihapus, ${moved} referensi penjualan dialihkan.`);
console.log(`Total produk sekarang: ${total} | grup duplik tersisa: ${left} | referensi tanpa produk: ${orphans}`);
await client.close();
