/**
 * W13 BATCH 2 (v34, 26 Okt 2026): runtime test modul SKOP PENERIMA
 * notifikasi murni -- `src/lib/notify-scope.ts`:
 * - NOTIFY_ROLES: persis 4 role (admin, manajer, pengurus, kasir)
 * - canReceiveNotif: 4 role = true; member/gudang/pembelian/tak
 *   dikenal/undefined = false (MEMBER TIDAK MENERIMA notifikasi)
 * - notifyRecipientsSql: SQL penerima utk lib/notify.ts (IN 4 role +
 *   active = 1)
 *
 * Dijalankan:
 *     npm run test:notify    (== node scripts/test-notify.ts)
 * Tanpa framework test -- output sederhana, exit code 1 bila ada gagal.
 *
 * Modul diuji = keputusan W13 (skop penerima). notify() di lib/notify.ts
 * memakai getNotifyRecipientIds() yang membangun SQL-nya dari modul ini,
 * sehingga guarantee "member excluded" teruji di titik keputusan.
 */
import { NOTIFY_ROLES, canReceiveNotif, notifyRecipientsSql } from '../src/lib/notify-scope.ts';

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
  // -- NOTIFY_ROLES: persis 4 role, urut --
  ok('roles: 4 role', NOTIFY_ROLES.length === 4, String(NOTIFY_ROLES.length));
  ok(
    'roles: isi persis',
    NOTIFY_ROLES.join(',') === 'admin,manajer,pengurus,kasir',
    NOTIFY_ROLES.join(','),
  );

  // -- canReceiveNotif: 4 role menerima --
  for (const r of ['admin', 'manajer', 'pengurus', 'kasir']) {
    ok('canReceive: "' + r + '" = true', canReceiveNotif(r));
  }

  // -- canReceiveNotif: role lain DITOLAK (check utama W13 B2) --
  for (const r of ['member', 'gudang', 'pembelian']) {
    ok('canReceive: "' + r + '" = false (tidak menerima)', !canReceiveNotif(r));
  }
  ok('canReceive: role tak dikenal "boss" = false', !canReceiveNotif('boss'));
  ok('canReceive: undefined = false', !canReceiveNotif(undefined));
  ok('canReceive: string kosong = false', !canReceiveNotif(''));

  // -- notifyRecipientsSql: SQL valid --
  const sql = notifyRecipientsSql();
  ok('sql: SELECT id FROM users', sql.startsWith('SELECT id FROM users'), sql);
  for (const r of ['admin', 'manajer', 'pengurus', 'kasir']) {
    ok('sql: memuat role "' + r + '"', sql.includes("'" + r + "'"));
  }
  ok('sql: filter active = 1', sql.includes('active = 1'));
  const quoteCount = (sql.match(/'/g) || []).length;
  ok('sql: hanya 4 role di IN (8 tanda kutip)', quoteCount === 8, String(quoteCount));

  // -- ringkasan --
  console.log('');
  console.log(`NOTIFY-SCOPE: ${passes} passed, ${failures} failed`);
  if (failures > 0) {
    console.error('TEST NOTIFY: GAGAL');
    process.exit(1);
  }
  console.log('TEST NOTIFY: ALL PASS');
}

main();