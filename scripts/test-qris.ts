/**
 * Unit test encoder QRIS EMVCo (modul murni src/lib/qris.ts).
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:qris          (== node scripts/test-qris.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 *
 * Cover: CRC16-CCITT check value publik, struktur TLV (urutan tag,
 * panjang field, PFI statis/dinamis), deterministik, round-trip parse,
 * validasi input (nmid/merchantName kosong, amount non-integer).
 */
import {
  buildQris,
  buildQrisDynamic,
  buildQrisStatic,
  crc16Ccitt,
  parseQrisTlv,
} from '../src/lib/qris.ts';

let passes = 0;
let failures = 0;

function eq<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passes++;
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name} — dapat ${a}, seharusnya ${e}`);
  }
}

function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passes++;
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('qris: CRC16-CCITT');
// Check value publik CRC-16/CCITT-FALSE.
eq('check value "123456789" = 29B1', crc16Ccitt('123456789'), '29B1');
eq('string kosong = FFFF', crc16Ccitt(''), 'FFFF');

const cfgStatic = {
  nmid: 'ID102003004050',
  mcc: '5731',
  city: 'Sleman',
  merchantName: 'Kopontren AL ITTIHAD',
};

console.log('qris: payload statis');
const p1 = buildQrisStatic(cfgStatic);
ok('dimulai 00040111 (PFI=0111 panjang 4)', p1.startsWith('00040111'), p1.slice(0, 8));
const t1 = parseQrisTlv(p1);
eq('PFI 0111', t1['00'], '0111');
eq('POI 11', t1['01'], '11');
eq('kode negara 29=ID', t1['29'], 'ID');
eq('NMID tag 30', t1['30'], 'ID102003004050');
eq('tanpa NMID2', t1['31'], undefined);
eq('MCC tag 52', t1['52'], '5731');
eq('currency 360', t1['53'], '360');
eq('tanpa amount 54', t1['54'], undefined);
eq('negara 58=ID', t1['58'], 'ID');
eq('nama merchant 59', t1['59'], 'Kopontren AL ITTIHAD');
eq('kota 60', t1['60'], 'Sleman');
eq('GUI 62=1', t1['62'], '1');
// CRC: tag 63 = '63' + '04' + CRC (8 char) — verifikasi atas payload
// tanpa seluruh tag 63.
eq(
  'CRC tag 63 valid',
  t1['63'],
  crc16Ccitt(p1.slice(0, p1.length - 8))
);
eq('panjang CRC 4', t1['63']?.length, 4);

console.log('qris: payload dinamis');
const p2 = buildQrisDynamic({ ...cfgStatic, amount: 15000 });
const t2 = parseQrisTlv(p2);
eq('PFI 0112', t2['00'], '0112');
eq('POI 12', t2['01'], '12');
eq('amount tag 54', t2['54'], '15000');
eq('CRC dinamis valid', t2['63'], crc16Ccitt(p2.slice(0, p2.length - 8)));

console.log('qris: deterministik & NMID2');
eq('build dua kali sama', buildQrisStatic(cfgStatic), p1);
const p3 = buildQris({ ...cfgStatic, nmid2: 'ID1020030040502' });
eq('NMID2 tag 31', parseQrisTlv(p3)['31'], 'ID1020030040502');
const p4 = buildQris({ nmid: 'X1', merchantName: 'Uji' });
ok('tanpa mcc/kota: tag 52 & 60 absen', parseQrisTlv(p4)['52'] === undefined && parseQrisTlv(p4)['60'] === undefined);

console.log('qris: validasi input');
ok('nmid kosong melempar', (() => { try { buildQris({ nmid: '', merchantName: 'X' }); return false; } catch { return true; } })());
ok('merchantName kosong melempar', (() => { try { buildQris({ nmid: 'A', merchantName: '   ' }); return false; } catch { return true; } })());
ok('amount non-integer melempar', (() => { try { buildQrisDynamic({ ...cfgStatic, amount: 1.5 }); return false; } catch { return true; } })());
ok('amount 0 = statis (tanpa 54)', parseQrisTlv(buildQris({ ...cfgStatic, amount: 0 }))['54'] === undefined);

console.log(`\nqris: ${passes} lulus, ${failures} gagal`);
if (failures > 0) process.exit(1);