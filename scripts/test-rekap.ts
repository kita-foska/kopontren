/**
 * Runtime test rekap.ts (builder WA) — modul murni src/lib/rekap.ts
 * (buildRekapMsg, strukWaText, buildLabaRugiWa). Menutup perubahan UX-1a:
 * `toLocaleString` -> rp()/rpShort() dari lib/format.ts; output WA harus
 * identik dgn sebelumnya: "Rp " + angka grup id-ID utk nominal penuh,
 * angka grup (tanpa "Rp") utk baris item, TIDAK ADA duplikasi "Rp Rp".
 *
 * CATATAN: builder CSV tidak ada di lib — export CSV server-side di
 * api/reports/csv + api/keuangan/csv (tidak terpengaruh perubahan ini).
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping), konvensi test-zakat:
 *     npm run test:rekap      (== node scripts/test-rekap.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 */
import {
  buildLabaRugiWa,
  buildRekapMsg,
  strukWaText,
  type RekapSale,
} from '../src/lib/rekap.ts';
import type { KeuanganPayload } from '../src/lib/keuangan.ts';

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.error('  FAIL ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function main(): void {
  // ── A. buildRekapMsg (rekap harian penjualan) ──
  const sales: RekapSale[] = [
    {
      id: 1,
      customer: '  Ahmad   Subekti ',
      pay_method: 'cash',
      pay_split: '[{"m":"cash","a":100000},{"m":"wa","a":50000}]',
      total: 150000,
      created_at: '2026-09-25T01:00:00.000Z',
      items: [
        { product_name: 'Kopi', qty: 2, unit: ' cup', unit_price: 15000, subtotal: 30000 },
        { product_name: 'Roti', qty: 1, unit: ' pcs', unit_price: 120000, subtotal: 120000 },
      ],
    },
    {
      id: 2,
      customer: '',
      pay_method: 'tf',
      total: 450000,
      created_at: '2026-09-25T02:00:00.000Z',
      items: [
        { product_name: 'Gulai', qty: 1, unit: ' pors', unit_price: 450000, subtotal: 450000 },
      ],
    },
  ];
  const msg = buildRekapMsg(sales);
  ok('rekap: judul default bold', msg.includes('*LAPORAN PENJUALAN KOPONTREN*'));
  ok(
    'rekap: split = label + rp penuh ("Tunai Rp 100.000 + QRIS / WA Rp 50.000")',
    msg.includes('Bayar: Tunai Rp 100.000 + QRIS / WA Rp 50.000'),
    msg.split('\n').find((l) => l.startsWith('Bayar:')) || ''
  );
  ok(
    'rekap: baris item rpShort (angka grup, TANPA "Rp")',
    msg.includes('2 cup x 15.000 = 30.000') && msg.includes('1 pors x 450.000 = 450.000')
  );
  ok('rekap: Subtotal rpShort ("Subtotal: 150.000")', msg.includes('Subtotal: 150.000'));
  ok(
    'rekap: baris TOTAL rp penuh ("Rp 600.000 (2 transaksi, 3 item)")',
    msg.includes('Rp 600.000 (2 transaksi, 3 item)')
  );
  ok(
    'rekap: customer kosong -> Umum; nama whitespace dinormalisasi',
    msg.includes('*2. Umum*') && msg.includes('*1. Ahmad Subekti*')
  );
  ok('rekap: TIDAK ADA duplikasi "Rp Rp"', !msg.includes('Rp Rp'));

  // ── B. strukWaText (struk per transaksi) ──
  const st = strukWaText({
    no: '123',
    kasir: 'Budi',
    tgl: '25 Sep 2026 09:00',
    items: [
      { qty: 2, unit: 'cup', name: 'Kopi', total: 30000 },
      { qty: 1, unit: 'pcs', name: 'Roti', total: 120000 },
    ],
    customer: 'Ahmad',
    member: 'MEM-001',
    discount: 10000,
    memberDiscount: 2000,
    redeem: 1000,
    cashback: 1500,
    tier: 'gold',
    total: 130500,
    pay: 'cash',
    received: 200000,
    change: 69500,
  });
  ok('struk: baris item rp penuh ("2 cup Kopi: Rp 30.000")', st.includes('2 cup Kopi: Rp 30.000'));
  ok(
    'struk: diskon/redeem rp penuh ("-Rp 10.000", "-Rp 2.000", "-Rp 1.000")',
    st.includes('Diskon: -Rp 10.000') &&
      st.includes('Diskon member: -Rp 2.000') &&
      st.includes('Tebus poin/saldo: -Rp 1.000')
  );
  ok('struk: TOTAL bold rp penuh ("*TOTAL: Rp 130.500*")', st.includes('*TOTAL: Rp 130.500*'));
  ok('struk: cashback rp penuh ("Saldo Reward: +Rp 1.500")', st.includes('Saldo Reward: +Rp 1.500'));
  ok(
    'struk: cash Diterima/Kembali rp penuh',
    st.includes('Diterima: Rp 200.000') && st.includes('Kembali: Rp 69.500')
  );
  ok('struk: tier Gold', st.includes('Tier: Gold'));
  ok('struk: TIDAK ADA duplikasi "Rp Rp"', !st.includes('Rp Rp'));

  // ── B2. strukWaText dgn paySplit (rp penuh per bagian) ──
  const st2 = strukWaText({
    no: '124',
    kasir: 'Budi',
    tgl: '25 Sep 2026 09:10',
    items: [{ qty: 1, unit: 'pcs', name: 'Keranjang', total: 130500 }],
    total: 130500,
    pay: 'cash',
    paySplit: [
      { m: 'cash', a: 100000 },
      { m: 'tf', a: 30500 },
    ],
  });
  ok(
    'struk: split "Bayar: Tunai Rp 100.000 + Transfer Rp 30.500"',
    st2.includes('Bayar: Tunai Rp 100.000 + Transfer Rp 30.500')
  );

  // ── C. buildLabaRugiWa (pernyataan P&L V1) ──
  const p: KeuanganPayload = {
    sales_count: 10,
    pendapatan: {
      bruto: 2000000,
      penjualan: 1900000,
      diskonManual: 50000,
      diskonMember: 50000,
      redeem: 0,
      retur: 100000,
      bersih: 1800000,
    },
    hpp: 1200000,
    labaKotor: 600000,
    beban: { total: 300000, count: 5, byCategory: [] },
    labaBersih: 300000,
    memo: {
      cashback: { total: 25000 },
      zakat: { total: 300000, count: 1 },
      konsinyasi: { total: 500000, count: 2 },
      ujrah_konsinyasi: { total: 100000, count: 2 },
    },
  };
  const lr = buildLabaRugiWa(p, '01 Sep 2026', '25 Sep 2026');
  ok(
    'laba-rugi: baris uang rp penuh ("Rp 2.000.000", "-Rp 100.000")',
    lr.includes('Penjualan Bruto: Rp 2.000.000') &&
      lr.includes('Retur Penjualan Tercatat: -Rp 100.000')
  );
  ok(
    'laba-rugi: Laba Kotor / LABA BERSIH bold rp penuh',
    lr.includes('*Laba Kotor: Rp 600.000*') && lr.includes('*LABA BERSIH: Rp 300.000*')
  );
  ok(
    'laba-rugi: memo rp penuh (zakat "Rp 300.000", ujrah "Rp 100.000")',
    lr.includes('Zakat Tercatat: Rp 300.000') &&
      lr.includes('Ujrah Konsinyasi (komisi toko): Rp 100.000')
  );
  ok('laba-rugi: TIDAK ADA duplikasi "Rp Rp"', !lr.includes('Rp Rp'));

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();