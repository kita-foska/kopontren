/**
 * M1-6: runtime test modul role murni — `src/lib/features.ts`:
 * - normRole / ROLES (normalisasi + daftar role)
 * - parseUserRoles (M1-2: parse users.roles JSON; primary selalu masuk)
 * Dipindah ke modul pure khusus agar bisa diuji LANGSUNG oleh Node
 * (type-stripping), tanpa menarik dependensi server auth.ts
 * (next/headers, @/db). Dijalankan:
 *     npm run test:roles       (== node scripts/test-roles.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 */
import { normRole, parseUserRoles, ROLES } from '../src/lib/features.ts';
import type { Role } from '../src/lib/features.ts';

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
  // ── ROLES: 7 role, lengkap ──
  ok('roles: 7 role', ROLES.length === 7, String(ROLES.length));
  for (const r of ['admin', 'manajer', 'pengurus', 'kasir', 'gudang', 'pembelian', 'member'] as Role[]) {
    ok('roles: memuat "' + r + '"', (ROLES as readonly string[]).includes(r));
  }

  // ── normRole: valid lolos, tak dikenal -> 'kasir' (kontrak lama) ──
  for (const r of ['admin', 'manajer', 'pengurus', 'kasir', 'gudang', 'pembelian', 'member'] as Role[]) {
    ok('norm: "' + r + '" -> apa adanya', normRole(r) === r, normRole(r));
  }
  ok('norm: tak dikenal "boss" -> kasir', normRole('boss') === 'kasir', normRole('boss'));
  ok('norm: string kosong -> kasir', normRole('') === 'kasir');
  ok('norm: undefined -> kasir', normRole(undefined) === 'kasir', String(normRole(undefined)));
  // CATATAN KONTRAK (regresi, JANGAN di-"perbaiki" tanpa ACC): normRole
  // SENSITIF KASUS — 'ADMIN' -> kasir. Layer API (PUT/POST users,
  // switch-role) menormalkan .trim().toLowerCase() SEBELUM normRole, jadi
  // input UI/form aman; helper murni ini sengaja dibiarkan strict.
  ok('norm: SENSITIF KASUS "ADMIN" -> kasir (kontrak)', normRole('ADMIN') === 'kasir', normRole('ADMIN'));
  ok('norm: "admin " (spasi) -> kasir (caller yang trim)', normRole('admin ') === 'kasir');

  // ── parseUserRoles: parse users.roles (JSON array) ──
  // 1) legacy: NULL / kosong / undefined -> [primary]
  ok('parse: NULL -> [primary]', JSON.stringify(parseUserRoles(null, 'kasir')) === '["kasir"]',
    JSON.stringify(parseUserRoles(null, 'kasir')));
  ok('parse: "" -> [primary]', JSON.stringify(parseUserRoles('', 'admin')) === '["admin"]');
  ok('parse: undefined -> [primary]', JSON.stringify(parseUserRoles(undefined, 'gudang')) === '["gudang"]');
  // 2) JSON rusak / non-array -> [primary] (tak pernah melempar)
  ok('parse: JSON rusak -> [primary]', JSON.stringify(parseUserRoles('{rusak', 'kasir')) === '["kasir"]');
  ok('parse: non-array (string) -> [primary]', JSON.stringify(parseUserRoles('"kasir"', 'admin')) === '["admin"]');
  ok('parse: non-array (number) -> [primary]', JSON.stringify(parseUserRoles('5', 'admin')) === '["admin"]');
  // 3) valid: dedup + filter tak dikenal
  ok('parse: dedup + filter', JSON.stringify(parseUserRoles('["kasir","gudang","kasir","boss"]', 'kasir')) === '["kasir","gudang"]',
    JSON.stringify(parseUserRoles('["kasir","gudang","kasir","boss"]', 'kasir')));
  // 4) primary selalu dimasukkan bila tidak ada di set
  ok('parse: primary tak ada -> dipasukkan', JSON.stringify(parseUserRoles('["gudang"]', 'kasir')) === '["gudang","kasir"]');
  ok('parse: set kosong -> [primary]', JSON.stringify(parseUserRoles('[]', 'pengurus')) === '["pengurus"]');
  // 5) kontrak: primary WAJIB sudah dinormalkan pemanggil
  ok('parse: primary tak dinormalkan ("KASIR") lolos sebagai entry',
    parseUserRoles(null, 'KASIR' as Role).includes('KASIR' as Role));

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  // CATATAN: process.exitCode (BUTIRAN) + keluar alamiah, BUKAN
  // process.exit() langsung: di Node 24 Windows, process.exit() saat
  // libuv async handle belum selesai bisa memicu fastfail
  // "Assertion failed: !(handle->flags & UV_HANDLE_CLOSEREG)"
  // (exit code 0xC0000409). exitCode tetap propagasi ke CI/shell.
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
