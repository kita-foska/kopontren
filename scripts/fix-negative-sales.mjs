// Perbaiki item/penjualan NEGATIF yang terlanjur masuk (legacy).
// Default = LAPORAN SAJA (read-only). Flag --fix WAJIB untuk menulis apa pun.
//
// Usage (Node 22+, jalankan dari root project):
//   1. Set env:  $env:DATABASE_URL='libsql://...' ; $env:DATABASE_AUTH_TOKEN='...'
//   2. node scripts/fix-negative-sales.mjs                    (laporan saja)
//      node scripts/fix-negative-sales.mjs --fix              (balik tanda item negatif + hitung ulang total)
//      node scripts/fix-negative-sales.mjs --fix --delete      (hapus item negatif + hitung ulang total)
//
// Efek --fix:
//   - qty/unit_price/subtotal negatif di sale_items di-ABS (default) atau dihapus (--delete)
//   - total penjualan yang tersandung dihitung ulang: SUM(subtotal item) - discount
//   - Aman dijalankan ulang (idempotent): setelah bersih, tidak ada yang diubah.
import { createClient } from '@libsql/client';
import process from 'node:process';

const url = process.env.DATABASE_URL || '';
const token = process.env.DATABASE_AUTH_TOKEN || '';
if (!url) {
  console.error('Set DATABASE_URL dulu (URL database Turso).');
  process.exit(1);
}
const fix = process.argv.includes('--fix');
const del = process.argv.includes('--delete');

const client = createClient({ url, authToken: token || undefined });
const q = async (sql) => {
  const r = await client.execute(sql);
  return r.rows ?? [];
};

console.log('=== LAPORAN ITEM / PENJUALAN NEGATIF ===');
const badItems = await q(
  `SELECT COUNT(*) c FROM sale_items WHERE qty < 0 OR subtotal < 0`
);
console.log(`Item bermasalah (qty<0 atau subtotal<0): ${badItems[0].c}`);

const negProducts = await q(
  `SELECT product_name, SUM(subtotal) net, COUNT(*) n
   FROM sale_items GROUP BY product_name
   HAVING SUM(subtotal) < 0
   ORDER BY net LIMIT 30`
);
if (negProducts.length) {
  console.log('\n--- Produk dengan total bersih NEGATIF (contoh dari laporan "top produk") ---');
  for (const p of negProducts) {
    console.log(`  ${p.product_name}  ->  ${Number(p.net).toLocaleString('id-ID')} (${p.n} item)`);
  }
}

const negSales = await q(`SELECT COUNT(*) c, SUM(total) s FROM sales WHERE total < 0`);
console.log(
  `\nPenjualan dengan total negatif: ${negSales[0].c} (jumlah total: ${Number(negSales[0].s ?? 0).toLocaleString('id-ID')})`
);

const samples = await q(
  `SELECT si.id, si.sale_id, si.product_name, si.qty, si.unit_price, si.subtotal,
          s.status, s.created_at
   FROM sale_items si JOIN sales s ON s.id = si.sale_id
   WHERE si.qty < 0 OR si.subtotal < 0
   LIMIT 25`
);
if (samples.length) {
  console.log('\n--- Contoh item bermasalah ---');
  for (const r of samples) {
    console.log(
      `  sale#${r.sale_id} (${r.status}, ${r.created_at}) ${r.product_name} qty=${r.qty} x ${r.unit_price} = ${Number(r.subtotal).toLocaleString('id-ID')}`
    );
  }
}

if (!fix) {
  console.log(
    `\n[LAPORAN SAJA] Tidak ada yang diubah. Jalankan ulang dengan --fix untuk memperbaiki${del ? ' (item akan DIHAPUS)' : ' (tanda dibalik)'}.`
  );
  await client.close();
  process.exit(0);
}

console.log('\n=== MENERAPKAN PERBAIKAN ===');
if (del) {
  const r = await client.execute(
    `DELETE FROM sale_items WHERE qty < 0 OR subtotal < 0`
  );
  console.log(`Item negatif dihapus: ${r.rowsAffected}`);
} else {
  const a1 = await client.execute(`UPDATE sale_items SET qty = -qty WHERE qty < 0`);
  const a2 = await client.execute(`UPDATE sale_items SET unit_price = -unit_price WHERE unit_price < 0`);
  const a3 = await client.execute(`UPDATE sale_items SET subtotal = -subtotal WHERE subtotal < 0`);
  console.log(
    `Tanda dibalik: qty=${a1.rowsAffected}, unit_price=${a2.rowsAffected}, subtotal=${a3.rowsAffected}`
  );
}

// Hitung ulang total penjualan yang tersandung:
// total baru = SUM(subtotal item) - discount (kolom discount penjualan)
const beforeIds = await q(
  `SELECT s.id FROM sales s
   WHERE s.total < 0 OR s.id IN (SELECT DISTINCT sale_id FROM sale_items WHERE qty < 0 OR subtotal < 0)`
);
if (beforeIds.length) {
  const r = await client.execute(
    `UPDATE sales
     SET total = (SELECT COALESCE(SUM(si.subtotal),0) FROM sale_items si WHERE si.sale_id = sales.id) - discount
     WHERE total < 0
        OR id IN (SELECT DISTINCT sale_id FROM sale_items WHERE qty < 0 OR subtotal < 0)`
  );
  console.log(
    `Total penjualan dihitung ulang: ${r.rowsAffected} (rumus: SUM(subtotal item) - discount)`
  );
} else {
  console.log('Tidak ada penjualan yang perlu dihitung ulang.');
}

// Verifikasi akhir
const left = await q(`SELECT COUNT(*) c FROM sale_items WHERE qty < 0 OR subtotal < 0`);
const leftSales = await q(`SELECT COUNT(*) c FROM sales WHERE total < 0`);
console.log(
  `\nVerifikasi: item negatif tersisa ${left[0].c} | penjualan total<0 tersisa ${leftSales[0].c}`
);
if (left[0].c === 0 && leftSales[0].c === 0) {
  console.log('BERSIH. Semua nilai negatif sudah diperbaiki.');
} else {
  console.log('MASIH ADA sisa - jalankan lagi script ini untuk lihat detailnya.');
}

await client.close();
