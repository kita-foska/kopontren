/**
 * W12 (v34): runtime test modul OAuth Google murni --
 * `src/lib/oauth-google.ts` (alur manual, zero dependensi; keputusan
 * audit ruling Gus Fi via DeepSeek). Dijalankan:
 *     npm run test:oauth      (== node scripts/test-oauth.ts)
 * Tanpa framework test -- output sederhana, exit code 1 bila ada gagal.
 *
 * Fokus test: fungsi PURE (tanpa jaringan/DB):
 * - googleAuthUrl (konsisten dgn apa yang dikirim di consent Google)
 * - oauthState (nonce 64-hex, acak)
 * - allowedDomains / emailDomainAllowed (normalisasi + fail-closed)
 * - consumeOnce (anti-replay 1 kali pakai, usang setelah TTL)
 * - googleAuthEnabled (env gate)
 *
 * CATATAN: exchangeCodeForToken & fetchGoogleUser = panggilan jaringan
 * Google (non-hermetic) -- TIDAK diuji di sini (harus live); diuji saat
 * smoke test W12 (Gus Fi isi env + browser).
 */
// Env di-set SEBELUM import (fungsi lib baca env saat dipanggil; import
// statis -- nilai env saat test start yang berlaku).
process.env.GOOGLE_ALLOWED_DOMAINS = '@ppalittihad.com,@alittihad.id';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

import {
  allowedDomains,
  consumeOnce,
  emailDomainAllowed,
  googleAuthEnabled,
  googleAuthUrl,
  oauthState,
} from '../src/lib/oauth-google.ts';

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
  // -- googleAuthUrl: parameter consent Google (response_type/scope/state) --
  const u = googleAuthUrl({
    clientId: 'abc',
    redirectUri: 'https://x.com/api/auth/google/callback',
    state: 's1',
  });
  ok('authurl: berbasis accounts.google.com', u.startsWith('https://accounts.google.com/oauth2/v2/auth?'), u);
  const p = new URL(u).searchParams;
  ok('authurl: client_id', p.get('client_id') === 'abc');
  ok('authurl: redirect_uri', p.get('redirect_uri') === 'https://x.com/api/auth/google/callback');
  ok('authurl: response_type=code', p.get('response_type') === 'code');
  ok('authurl: scope openid email profile', p.get('scope') === 'openid email profile');
  ok('authurl: state lolos apa adanya', p.get('state') === 's1');
  ok('authurl: prompt select_account', p.get('prompt') === 'select_account');

  // -- oauthState: nonce 64-hex, acak --
  const s1 = oauthState();
  const s2 = oauthState();
  ok('state: 64-hex', /^[0-9a-f]{64}$/.test(s1), s1.slice(0, 12) + '...');
  ok('state: unik per panggilan', s1 !== s2);

  // -- allowedDomains: normalisasi env (koma, @ boleh/tidak, lowercase) --
  const domains = allowedDomains();
  ok('domains: 2 domain dari env', domains.length === 2, String(domains.length));
  ok('domains: "@ppalittihad.com" -> "ppalittihad.com"', domains.includes('ppalittihad.com'));
  ok('domains: "@alittihad.id" -> "alittihad.id"', domains.includes('alittihad.id'));

  // -- emailDomainAllowed: positive + fail-closed --
  ok('allowed: admin@ppalittihad.com', emailDomainAllowed('admin@ppalittihad.com'));
  ok('allowed: kasir@ppalittihad.com', emailDomainAllowed('kasir@ppalittihad.com'));
  ok('allowed: casing tak relevan (ADMIN@PPALITTIHAD.COM)', emailDomainAllowed('ADMIN@PPALITTIHAD.COM'));
  ok('allowed: @alittihad.id', emailDomainAllowed('gus@alittihad.id'));
  ok('bukan: gmail.com (di luar allowlist)', !emailDomainAllowed('gus@gmail.com'));
  ok('bukan: subdomain ppalittihad.com (hanya domain persis)', !emailDomainAllowed('gus@mail.ppalittihad.com'));
  ok('bukan: null (fail-closed)', !emailDomainAllowed(null));
  ok('bukan: string kosong (fail-closed)', !emailDomainAllowed(''));
  ok('bukan: tanpa @', !emailDomainAllowed('ppalittihad.com'));

  // Fail-closed saat allowlist kosong: env dihapus -> tak ada yang lolos.
  delete process.env.GOOGLE_ALLOWED_DOMAINS;
  ok('fail-closed: allowlist kosong -> rejected', !emailDomainAllowed('gus@ppalittihad.com'));
  ok('fail-closed: allowlist kosong -> null rejected', !emailDomainAllowed(null));
  process.env.GOOGLE_ALLOWED_DOMAINS = '@ppalittihad.com,@alittihad.id';

  // -- googleAuthEnabled: kedua credential env wajib --
  ok('enabled: id+secret -> on', googleAuthEnabled());
  delete process.env.GOOGLE_CLIENT_SECRET;
  ok('enabled: secret hilang -> off', !googleAuthEnabled());
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

  // -- consumeOnce: anti-replay satu kali pakai --
  const key = 'test|' + s1;
  ok('consume: pakai pertama -> true', consumeOnce(key) === true);
  ok('consume: pakai kedua -> false (replay ditolak)', consumeOnce(key) === false);
  ok('consume: key lain -> true', consumeOnce('other') === true);
  // Usang: TTL 15 mnt -- tak bisa ditunggu, cukup verifikasi kontrak
  // "key tak dikenal -> true" (jaga-jaga tak ada state lama).
  ok('consume: key baru -> true', consumeOnce('fresh-' + Date.now()) === true);

  console.log('\n' + passes + ' passed, ' + failures + ' failed');
  if (failures > 0) process.exit(1);
}

main();