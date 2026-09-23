/**
 * Unit test helper HP member (src/lib/phone.ts): canonicalPhone,
 * validatePhone, dan phoneOwner (guard duplikat sebelum INSERT/UPDATE).
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:phone        (== node scripts/test-members-phone.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 * DB in-memory via node:sqlite (skema members + index partial unik
 * identik dgn idx_members_phone_uniq di produksi).
 */
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/db.ts';
import { canonicalPhone, phoneOwner, validatePhone } from '../src/lib/phone.ts';

let passes = 0;
let failures = 0;

function eq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    passes++;
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name} — dapat ${String(actual)}, seharusnya ${String(expected)}`);
  }
}

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log(`  ok   ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` (${detail})` : ''}` );
  }
}

// ── canonicalPhone ──────────────────────────────────────────────────────────
console.log('canonicalPhone:');
eq('garis bawah & strip dibuang', canonicalPhone('0812-3456-789'), '08123456789');
eq('+62 spasi-strip -> lokal', canonicalPhone('+62 812-3456-789'), '08123456789');
eq('62 polos -> lokal', canonicalPhone('628123456789'), '08123456789');
eq('62 + spasi -> lokal', canonicalPhone('62 812 3456 789'), '08123456789');
eq('parens kantor (0341)', canonicalPhone('(0341) 555-123'), '0341555123');
eq('non-digit -> kosong', canonicalPhone('abc'), '');
eq('string kosong -> kosong', canonicalPhone(''), '');
eq('idempoten (kanonik ulang)', canonicalPhone(canonicalPhone('+62 812-3456-789')), '08123456789');

// ── validatePhone ───────────────────────────────────────────────────────────
console.log('validatePhone:');
eq('nomor valid 08.. -> kanonik', validatePhone('0812-3456-789'), '08123456789');
eq('kosong -> null (tanpa HP)', validatePhone(''), null);
eq('terlalu pendek -> null', validatePhone('0812345'), null);
eq('awalan 00 (8 digit, di luar pola 08..) -> null', validatePhone('00123456'), null);

// ── phoneOwner (DB in-memory, skema serupa produksi) ────────────────────────
console.log('phoneOwner:');
const raw = new DatabaseSync(':memory:');
raw.exec(
  `CREATE TABLE members (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT ''
   )`
);
// Identik dengan produksi: nomor non-kosong wajib unik (teks mentah).
raw.exec(`CREATE UNIQUE INDEX idx_members_phone_uniq ON members(phone) WHERE phone != ''`);

const insert = raw.prepare('INSERT INTO members (name, phone) VALUES (?, ?)');
insert.run('Ade', '08123456789'); // id 1 — bentuk kanonik
insert.run('Budi', '0341555123'); // id 2 — kantor, kanonik
insert.run('Citra', ''); // id 3 — tanpa HP (boleh banyak-banyak)
insert.run('Dewi', '02745551234'); // id 4
insert.run('Eka', '+62 813-9999-8888'); // id 5 — legacy non-kanonik (teks mentah lolos index)

const d = raw as unknown as Db;

// Kasus dasar.
const p1 = await phoneOwner(d, '');
eq('HP kosong -> null (banyak member tanpa HP)', p1, null);
const p2 = await phoneOwner(d, '08123456789');
eq('teks persis -> pemilik', p2, 1);
const p3 = await phoneOwner(d, '+62 812-3456-789');
eq('+62... query -> pemilik tersimpan kanonik', p3, 1);
const p4 = await phoneOwner(d, '62 812 3456 789');
eq('62... query -> pemilik tersimpan kanonik', p4, 1);
const p5 = await phoneOwner(d, '0812 3456 789');
eq('spasi beda -> kanonisasi ketemu', p5, 1);
const p6 = await phoneOwner(d, '08999999999');
eq('nomor belum dipakai -> null', p6, null);
const p7 = await phoneOwner(d, '(0341) 555 123');
eq('kantor parens-query -> pemilik id 2', p7, 2);

// Arah legacy: tersimpan non-kanonik, query kanonik — tak terjangkau index mentah.
const p8 = await phoneOwner(d, '081399998888');
eq('query kanonik vs tersimpan "+62 ..." -> id 5', p8, 5);
const p9 = await phoneOwner(d, '0274-555-1234');
eq('query non-kanonik vs tersimpan kanonik -> id 4', p9, 4);

// exceptId: PUT mengecualikan dirinya sendiri.
const p10 = await phoneOwner(d, '08123456789', 1);
eq('kecuali diri sendiri -> null', p10, null);
const p11 = await phoneOwner(d, '08123456789', 2);
eq('kecuali id lain tetap bentrok -> 1', p11, 1);

// Perilaku index unik produksi (lapis terakhir setelah guard aplikasi):
// teks mentah sama DITOLAK, beda teks kanonik sama DITERIMA index
// — bukti kenapa guard kanonik aplikasi diperlukan (index tak cukup).
let rawDupRejected = false;
try {
  insert.run('Fajar', '08123456789');
} catch {
  rawDupRejected = true;
}
check('index unik menolak duplikat teks mentah', rawDupRejected);

let canonDupAcceptedByIndex = false;
try {
  insert.run('Gita', '0812 3456 789'); // kanonik sama dgn id 1, teks beda
  canonDupAcceptedByIndex = true;
} catch {
  /* ditolak juga -> justru berarti index sudah diperketat */
}
check(
  'index menerima teks beda kanonik sama (guard aplikasi wajib)',
  canonDupAcceptedByIndex
);

// Guard aplikasi menangkap baris yang baru saja lolos index tsb.
raw.prepare('DELETE FROM members WHERE name = ?').run('Gita');
const p12 = await phoneOwner(d, '0812-3456-789');
eq('setelah insert lolos index -> guard tetap menemukan pemilik', p12, 1);

raw.close();

// ── ringkasan ───────────────────────────────────────────────────────────────
console.log(`\n${passes} ok, ${failures} gagal`);
if (failures > 0) process.exitCode = 1;
