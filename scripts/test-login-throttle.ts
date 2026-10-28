/**
 * W18-B: runtime test modul hermetis `src/lib/login-throttle.ts`:
 *  - Lapis L1 (existing, perilaku identik): 10 gagal / 15 mnt /
 *    username+IP -> kunci pasangan tsb 15 mnt.
 *  - Lapis L2 (W18-B): 5 gagal / 15 mnt / IP (lepas username) ->
 *    kunci IP 15 mnt (menutup brute-force gonta-ganti username).
 *  - Sukses -> pencacat kedua lapis bersih ("forgive on success").
 *  - Jendela 15 mnt + expiry kunci + cap Map 500.
 * Node type-stripping langsung (tanpa SQLite), pola test-roles.ts.
 *     npm run test:login-throttle   (== node scripts/test-login-throttle.ts)
 */
import {
  createLoginThrottle,
  LOGIN_IP_FAIL_LIMIT,
  LOGIN_THROTTLE_LOCK_MS,
  LOGIN_THROTTLE_WINDOW_MS,
  LOGIN_USER_FAIL_LIMIT,
} from '../src/lib/login-throttle.ts';

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

/** Pseudo-clock: mulai di t0, geser manual per skenario. */
function main(): void {
  console.log('# login-throttle (W18-B: L1 per-username + L2 per-IP)\n');

  const t0 = 1_700_000_000_000;
  let t = t0;
  const th = createLoginThrottle(() => t);

  // -- Konstanta: kontrak perilaku --
  ok(
    'konstanta: L1=10, L2=5, jendela=kunci=15 mnt',
    LOGIN_USER_FAIL_LIMIT === 10 &&
      LOGIN_IP_FAIL_LIMIT === 5 &&
      LOGIN_THROTTLE_WINDOW_MS === 15 * 60 * 1000 &&
      LOGIN_THROTTLE_LOCK_MS === 15 * 60 * 1000,
  );

  // -- L2: 5 kegagalan per IP -> kunci IP (lepas username) --
  const IP = '10.0.0.7';
  ok('awal: IP terbuka + user terbuka', !th.ipLocked(IP) && !th.userLocked('budi', IP));
  for (let i = 0; i < LOGIN_IP_FAIL_LIMIT - 1; i++) th.recordFailure('user' + i, IP);
  ok('L2: 4 kegagalan (username berbeda-beda) -> IP BELUM terkunci', !th.ipLocked(IP));
  th.recordFailure('user4', IP);
  ok('L2: kegagalan ke-5 -> IP terkunci', th.ipLocked(IP));
  ok(
    'L2: sisa kunci L2 = 15 mnt',
    th.ipLockRemainingMs(IP) === LOGIN_THROTTLE_LOCK_MS,
  );
  ok('L2: username LAIN dari IP sama juga tetap di-tolak (skenario route)', th.ipLocked(IP));
  ok('L2: IP tetangga tak kena dampaknya', !th.ipLocked('10.0.0.8'));

  // -- L1: 10 kegagalan per username+IP -> kunci pasangan tsb --
  t = t0 + 20 * 60 * 1000; // lampaui kunci L2 di atas agar L1 teruji sendirian
  const IP2 = '10.0.0.9';
  for (let i = 0; i < 9; i++) th.recordFailure('andi', IP2);
  ok('L1: 9 kegagalan -> pasangan BELUM terkunci', !th.userLocked('andi', IP2));
  th.recordFailure('andi', IP2);
  ok('L1: kegagalan ke-10 -> username+IP terkunci', th.userLocked('andi', IP2));
  ok('L1: username sama dari IP LAIN tak kena dampaknya', !th.userLocked('andi', '10.0.0.10'));
  ok('L1: sisa kunci L1 = 15 mnt', th.userLockRemainingMs('andi', IP2) === LOGIN_THROTTLE_LOCK_MS);

  // -- Expiry kunci: 15 mnt penuh -> terbuka lagi --
  t = t + 14 * 60 * 1000 + 59_000;
  ok('expiry: 14 mnt 59 dtk -> MASIH terkunci', th.userLocked('andi', IP2));
  t = t + 1000; // tepat 15 mnt 00 dtk sejak kunci
  ok('expiry: tepat 15 mnt -> KUNCI TERBUKA', !th.userLocked('andi', IP2) && !th.ipLocked(IP));

  // -- Jendela 15 mnt: kegagalan lama terbuang --
  const IP3 = '10.0.0.11';
  for (let i = 0; i < 4; i++) th.recordFailure('zaki', IP3); // 4 gagal di t0+20 mnt
  t = t + 20 * 60 * 1000; // 20 mnt kemudian: 4 pertama di luar jendela
  th.recordFailure('zaki', IP3);
  ok('jendela: 4 gagal lama terbuang + 1 baru -> IP tak terkunci', !th.ipLocked(IP3));

  // -- Sukses: pencacat bersih (forgive on success) --
  const IP4 = '10.0.0.12';
  for (let i = 0; i < 4; i++) th.recordFailure('sari', IP4);
  ok('sukses: 4 gagal -> belum terkunci', !th.ipLocked(IP4));
  th.recordSuccess('sari', IP4);
  for (let i = 0; i < 4; i++) th.recordFailure('sari', IP4);
  ok('sukses: pencacat L2 bersih setelah success (4+4 belum nge-5)', !th.ipLocked(IP4));
  th.recordFailure('sari', IP4);
  ok('sukses: kegagalan ke-5 pasca-success -> terkunci', th.ipLocked(IP4));

  // -- Cap Map 500: tak tumbang walau IP penyerang 600+ --
  const th2 = createLoginThrottle(() => t);
  for (let i = 0; i < 600; i++) th2.recordFailure('brute', '9.9.9.' + i);
  ok('cap: 600 IP unik -> ukuran tersimpan <= 1000 (2 map x 500)', th2.size() <= 1000, 'size=' + th2.size());
  ok('cap: throttle tetap berfungsi (bukan error)', typeof th2.ipLockRemainingMs('9.9.9.0') === 'number');

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();
