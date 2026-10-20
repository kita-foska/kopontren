// Suite #40 -- W8 ITEM 4 CUSTOMER DISPLAY (20 Okt 2026, ruling Opasi B):
// payload kiosk PUBLIK /api/display/latest (src/lib/display-latest.ts):
//  P1.1-5  shape payload: proyeksi eksplisit -- TANPA field PII
//          (customer/member/rincian baris tak mungkin lolos ke layar
//          publik, walau ada di baris sales);
//  P2.1-2  baris kosong (belum ada transaksi / DB gagal) -> { last: null };
//  P3.1-6  QRIS: hanya pembayaran mengandung wa/QRIS + NMID & nama
//          merchant terisi -> payload QR dinamis (PFI 0112 + tag 54);
//          cash / QRIS-belom-konfigurasi -> null (layaran total saja);
//  P4.1-2  jam WIB (wibTimeSec): UTC +7 eksak + input tak valid;
//  P5.1-5  label metode: satu sumber PAY_METHOD_LABEL; baris mixed
//          (pay_split) diperluas + dedup; alias legacy dinormalisasi.
// Hermetis: tanpa DB/server; Node (node scripts/test-display-latest.ts).
import {
  buildDisplayPayload,
  displayPayMethods,
  displayQrisPayload,
  type DisplaySaleRow,
} from '../src/lib/display-latest.ts';
import { parseQrisTlv } from '../src/lib/qris.ts';

function ok(name: string, cond: boolean) {
  if (cond) console.log('ok - ' + name);
  else {
    console.error('FAIL - ' + name);
    process.exitCode = 1;
  }
}

const base: DisplaySaleRow = {
  id: 4210,
  total: 24500,
  pay_method: 'cash',
  pay_split: null,
  created_at: '2026-10-20T01:30:45Z', // = 08:30:45 WIB (GMT+7)
  item_count: 3,
};

// P1: shape payload (proyeksi, PII-free)
const p1 = buildDisplayPayload(base);
ok('P1.1 last terisi (id/total/lines utuh)', p1.last !== null && p1.last.id === 4210 && p1.last.total === 24500 && p1.last.item_count === 3);
ok(
  'P1.2 field tepat: id,total,item_count,methods,time_wib,qris',
  p1.last !== null &&
    JSON.stringify(Object.keys(p1.last).sort()) ===
      JSON.stringify(['id', 'item_count', 'methods', 'qris', 'time_wib', 'total'])
);
ok('P1.3 total difloor integer rupiah (24500.9 -> 24500)', buildDisplayPayload({ ...base, total: 24500.9 }).last?.total === 24500);
// Baris sales punya field PII (customer, member_id, dll) -- PROYEKSI
// memastikan tak satu pun lolos ke payload publik.
const piiRow: Record<string, unknown> = {
  ...base,
  customer: 'Rahmat Bin Umar',
  member_id: 7,
  member_name: 'Anggota 7',
  kasir_id: 3,
};
const pPii = buildDisplayPayload(piiRow as unknown as DisplaySaleRow);
const pPiiJson = JSON.stringify(pPii);
ok('P1.4 nama pelanggan TIDAK di payload', !pPiiJson.includes('Rahmat'));
ok('P1.5 member/kasir TIDAK di payload', !pPiiJson.includes('Anggota 7') && !pPiiJson.includes('kasir'));

// P2: kosong -> last null
ok('P2.1 row null -> { last: null }', JSON.stringify(buildDisplayPayload(null)) === '{"last":null}');
ok('P2.2 row id invalid -> { last: null }', JSON.stringify(buildDisplayPayload({ ...base, id: 0 })) === '{"last":null}');

// P3: QRIS
const qCfg = { nmid: 'ID102003004050', nmid2: '', mcc: '5731', city: 'Yogyakarta', merchantName: 'Kopontren' };
const waRow: DisplaySaleRow = { ...base, pay_method: 'wa' };
const q3 = displayQrisPayload(waRow, qCfg);
ok('P3.1 wa + NMID -> payload QRIS dinamis (PFI 0112)', typeof q3 === 'string' && q3.startsWith('00040112'));
const tlv3 = q3 ? parseQrisTlv(q3) : {};
ok('P3.2 tag 54 = total terikat (24500)', tlv3['54'] === '24500');
ok('P3.3 tag 30 = NMID', tlv3['30'] === 'ID102003004050');
ok('P3.4 cash -> qris null', displayQrisPayload(base, qCfg) === null);
ok('P3.5 wa + NMID kosong (QRIS belom dikonfigurasi) -> null', displayQrisPayload(waRow, { ...qCfg, nmid: '' }) === null);
const splitRow: DisplaySaleRow = { ...base, pay_method: 'cash', pay_split: JSON.stringify([{ m: 'cash', a: 5000 }, { m: 'wa', a: 19500 }]) };
ok('P3.6 baris mixed (cash+wa) -> QRIS ada', displayQrisPayload(splitRow, qCfg) !== null);
ok('P3.7 qris di payload = null utk cash', buildDisplayPayload(base, qCfg).last?.qris === null);

// P4: jam WIB (separator [.:] beda-beda antar ICU/lingkungan -- klaim
// HANYA nilai WIB-nya: 01:30:45 UTC = 08.30.45 WIB (GMT+7).)
const p41 = p1.last?.time_wib;
ok('P4.1 01:30:45 UTC = 08/30/45 WIB (jam WIB eksak, separator bebas)',
  typeof p41 === 'string' && p41.includes('08') && p41.includes('30') && p41.includes('45') && p41.length >= 7);
ok('P4.2 created_at tak valid -> null (jujur)', buildDisplayPayload({ ...base, created_at: 'bukan-tanggal' }).last?.time_wib === null);

// P5: label metode
ok('P5.1 cash -> [Tunai]', JSON.stringify(displayPayMethods('cash', null)) === JSON.stringify(['Tunai']));
ok('P5.2 wa -> [QRIS / WA]', JSON.stringify(displayPayMethods('wa', null)) === JSON.stringify(['QRIS / WA']));
ok('P5.3 tf -> [Transfer]', JSON.stringify(displayPayMethods('tf', null)) === JSON.stringify(['Transfer']));
ok('P5.4 mixed cash+wa -> [Tunai, QRIS / WA]', JSON.stringify(displayPayMethods('cash', splitRow.pay_split)) === JSON.stringify(['Tunai', 'QRIS / WA']));
ok('P5.5 pay_split rusak -> fallback pay_method', JSON.stringify(displayPayMethods('cash', 'bukan-json')) === JSON.stringify(['Tunai']));
ok('P5.6 alias legacy qris -> label QRIS / WA', JSON.stringify(displayPayMethods('qris', null)) === JSON.stringify(['QRIS / WA']));

console.log('Display-latest suite: selesai (exitCode ' + (process.exitCode ?? 0) + ')');
