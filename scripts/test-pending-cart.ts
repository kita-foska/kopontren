/**
 * W8 ITEM 3 (PENDING CART) -- Unit test src/lib/pending-cart.ts
 * (modul pure persist keranjang menunggu: serialize/validasi/clamp/
 * label umur). Suite #39. Node langsung (type-stripping), konvensi
 * sama dgn test-barcode.ts / test-multisatuan.ts.
 *
 * Sifat yang diuji:
 *  - P1: key kontrak + terpisah dari POS_QUEUE_KEY (beku P13.1/W5.1);
 *  - P2: serialize -> read round-trip (items/customer/member_id/pay/
 *        note/ts utuh);
 *  - P3: serialize normalisasi (pay tak dikenal -> 'cash', ts kosong
 *        -> epoch);
 *  - P4: readPendingCart: null/kosong/JSON korup/bukan objek/items
 *        bukan array/semua baris rusak/items kosong -> null;
 *  - P5: baris rusak dibuang per baris; qty fraksional difloor;
 *  - P6: clamp: qty>stok di-clamp; stok 0 / id hilang -> drop;
 *        titipan tanpa cap; qpb; katalog kosong -> snapshot;
 *  - P7: label umur (baru saja / mnt / jam / hari / tak valid).
 *
 * Dijalankan LANGSUNG oleh Node:
 *     node scripts/test-pending-cart.ts
 * Tanpa framework test -- output sederhana, exit code 1 bila ada gagal.
 */

import {
  PENDING_CART_KEY,
  clampPendingCart,
  pendingCartAgeLabel,
  readPendingCart,
  serializePendingCart,
  type PendingCart,
  type PendingCartLine,
  type PendingCartProduct,
} from '../src/lib/pending-cart.ts';
import { POS_QUEUE_KEY } from '../src/lib/offline-status.ts';

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

function prod(over: Partial<PendingCartProduct> = {}): PendingCartProduct {
  return {
    id: 1,
    name: 'Madu 250ml',
    category: 'Pangan',
    unit: 'botol',
    base_price: 25000,
    stock: 10,
    ...over,
  };
}

function line(over: Partial<PendingCartLine> = {}): PendingCartLine {
  return { product: prod(), qty: 2, price: 25000, ...over };
}

const T0 = Date.parse('2026-10-20T00:00:00.000Z');

function main(): void {
  console.log('Pending Cart (W8 Item 3) -- helper murni persist keranjang');

  // P1: key kontrak.
  ok('P1.1 key = kopontren_pos_pending_cart_v1', PENDING_CART_KEY === 'kopontren_pos_pending_cart_v1', PENDING_CART_KEY);
  ok('P1.2 key TIDAK bentrok POS_QUEUE_KEY', PENDING_CART_KEY !== POS_QUEUE_KEY, PENDING_CART_KEY + ' vs ' + POS_QUEUE_KEY);

  // P2: round-trip serialize -> read.
  const src = [line(), line({ product: prod({ id: 2, name: 'Susu', unit: 'kaleng' }), qty: 1, price: 18000, manual: true, unitName: 'Karton', qtyPerBase: 24 })];
  const json = serializePendingCart(src, 'Ujang', '7', 'tf', 'pesan jemur', '2026-10-20T01:00:00.000Z');
  const rt = readPendingCart(json);
  ok('P2.1 round-trip tak null', rt !== null);
  ok('P2.2 items 2 baris', rt?.items.length === 2, String(rt?.items.length));
  ok('P2.3 customer utuh', rt?.customer === 'Ujang', rt?.customer);
  ok('P2.4 member_id utuh', rt?.member_id === '7', rt?.member_id);
  ok('P2.5 pay utuh', rt?.pay === 'tf', rt?.pay);
  ok('P2.6 note utuh', rt?.note === 'pesan jemur', rt?.note);
  ok('P2.7 ts utuh', rt?.ts === '2026-10-20T01:00:00.000Z', rt?.ts);
  ok('P2.8 flag manual utuh', rt?.items[1].manual === true);
  ok('P2.9 unitName utuh', rt?.items[1].unitName === 'Karton');
  ok('P2.10 qtyPerBase utuh', rt?.items[1].qtyPerBase === 24, String(rt?.items[1].qtyPerBase));
  ok('P2.11 baris tanpa qpb -> undefined (bukan 1)', rt?.items[0].qtyPerBase === undefined, String(rt?.items[0].qtyPerBase));

  // P3: normalisasi serialize.
  const badPay = JSON.parse(serializePendingCart(src, '', '', 'qris', '', '2026-10-20T01:00:00.000Z')) as PendingCart;
  ok('P3.1 pay tak dikenal -> cash', badPay.pay === 'cash', badPay.pay);
  const emptyTs = JSON.parse(serializePendingCart(src, 'A', '', 'wa', 'B', '')) as PendingCart;
  ok('P3.2 ts kosong -> epoch', emptyTs.ts === new Date(0).toISOString(), emptyTs.ts);
  ok('P3.3 input kosong -> string aman', emptyTs.customer === 'A' && emptyTs.member_id === '');

  // P4: input invalid -> null.
  ok('P4.1 null -> null', readPendingCart(null) === null);
  ok('P4.2 string kosong -> null', readPendingCart('') === null);
  ok('P4.3 JSON korup -> null', readPendingCart('{broken') === null);
  ok('P4.4 bukan objek (array) -> null', readPendingCart('[1,2]') === null);
  ok('P4.5 items bukan array -> null', readPendingCart(JSON.stringify({ items: 'x' })) === null);
  ok('P4.6 items kosong -> null', readPendingCart(JSON.stringify({ items: [] })) === null);
  ok('P4.7 semua baris rusak -> null', readPendingCart(JSON.stringify({ items: [{ product: { name: 'tanpa id' } }] })) === null);

  // P5: per-baris drop + normalisasi.
  const mixed = readPendingCart(
    JSON.stringify({
      items: [
        line(),
        { ...line(), qty: 0 },
        { ...line(), qty: Number.NaN },
        { ...line(), price: -5 },
        { ...line(), product: { ...prod(), name: 42 as unknown as string } },
        { ...line(), qty: 3.7 },
      ],
    })
  );
  ok('P5.1 2 baris valid bertahan', mixed?.items.length === 2, String(mixed?.items.length));
  ok('P5.2 qty fraksional difloor (3.7 -> 3)', mixed?.items[1].qty === 3, String(mixed?.items[1]?.qty));
  ok('P5.3 default manual -> undefined', mixed?.items[0].manual === undefined);


  // P6: clamp terhadap katalog.
  const catalog = [
    prod({ id: 1, name: 'Madu', stock: 5 }),
    prod({ id: 2, name: 'Biskuit', stock: 0 }),
    prod({ id: 3, name: 'Titipan', stock: 2, is_consignment: 1 }),
  ];
  const cart: PendingCart = {
    items: [
      line({ product: prod({ id: 1, stock: 99 }), qty: 20, price: 25000 }),
      line({ product: prod({ id: 2, stock: 99 }), qty: 3, price: 10000 }),
      line({ product: prod({ id: 3, stock: 2 }), qty: 9, price: 15000 }),
      line({ product: prod({ id: 99 }), qty: 1, price: 5000 }),
      line({ product: prod({ id: 4 }), qty: 4, price: 8000, qtyPerBase: 2, manual: true }),
    ],
    customer: '',
    member_id: '',
    pay: 'cash',
    note: '',
    ts: '2026-10-20T01:00:00.000Z',
  };
  const cl = clampPendingCart(cart, catalog);
  ok('P6.1 qty>stok di-clamp (20 -> 5)', cl.items[0].qty === 5, String(cl.items[0].qty));
  ok('P6.2 stok 0 -> drop', cl.items.every((i) => i.product.id !== 2));
  ok('P6.3 titipan TIDAK di-cap (9 tetap)', cl.items.some((i) => i.product.id === 3 && i.qty === 9));
  ok('P6.4 id 99 (hilang dari katalog) -> drop', cl.items.every((i) => i.product.id !== 99));
  ok('P6.5 id 4 tak ada di katalog -> drop (qpb tak relevan)', cl.items.every((i) => i.product.id !== 4));
  ok('P6.6 dropped = 3 (stok 0 + id 99 + id 4)', cl.dropped === 3, String(cl.dropped));
  ok('P6.7 data produk di-refresh ke katalog (nama/stok versi katalog)',
    cl.items[0].product.name === 'Madu' && cl.items[0].product.stock === 5);
  ok('P6.8 harga manual TIDAK di-overwrite katalog (tetap 25000)',
    cl.items[0].price === 25000, String(cl.items[0].price));
  // Clamp qpb: baris id 1 dgn qtyPerBase 2 -> cap floor((5+EPS)/2)=2.
  const clQpb = clampPendingCart(
    { ...cart, items: [line({ product: prod({ id: 1, stock: 99 }), qty: 9, price: 25000, qtyPerBase: 2 })] },
    catalog
  );
  ok('P6.9 qpb 2 -> cap floor((stok+EPS)/qpb) (9 -> 2)', clQpb.items[0].qty === 2, String(clQpb.items[0].qty));
  ok('P6.10 qpb disimpan bila != 1', clQpb.items[0].qtyPerBase === 2, String(clQpb.items[0].qtyPerBase));
  // Katalog kosong (cold start offline) -> snapshot dipertahankan.
  const cold = clampPendingCart(cart, []);
  ok('P6.11 katalog kosong -> semua baris snapshot (0 dropped)', cold.items.length === 5 && cold.dropped === 0,
    cold.items.length + '/' + cold.dropped);

  // P7: label umur.
  ok('P7.1 <1 menit -> baru saja', pendingCartAgeLabel(new Date(T0).toISOString(), T0 + 30_000) === 'baru saja',
    pendingCartAgeLabel(new Date(T0).toISOString(), T0 + 30_000));
  ok('P7.2 1 menit -> 1 mnt lalu', pendingCartAgeLabel(new Date(T0).toISOString(), T0 + 60_000) === '1 mnt lalu');
  ok('P7.3 90 menit -> 1 jam lalu', pendingCartAgeLabel(new Date(T0).toISOString(), T0 + 90 * 60_000) === '1 jam lalu');
  ok('P7.4 5 jam -> 5 jam lalu', pendingCartAgeLabel(new Date(T0).toISOString(), T0 + 5 * 3_600_000) === '5 jam lalu');
  ok('P7.5 26 jam -> 1 hari lalu', pendingCartAgeLabel(new Date(T0).toISOString(), T0 + 26 * 3_600_000) === '1 hari lalu');
  ok('P7.6 3 hari -> 3 hari lalu', pendingCartAgeLabel(new Date(T0).toISOString(), T0 + 3 * 86_400_000) === '3 hari lalu');
  ok('P7.7 masa depan -> baru saja (clamp 0)', pendingCartAgeLabel(new Date(T0).toISOString(), T0 - 5_000) === 'baru saja');
  ok('P7.8 tak valid -> waktu tak diketahui', pendingCartAgeLabel('bukan-tanggal', T0) === 'waktu tak diketahui');

  console.log('\nPending cart: ' + passes + ' ok, ' + failures + ' FAIL');
  process.exitCode = failures > 0 ? 1 : 0;
}

main();
