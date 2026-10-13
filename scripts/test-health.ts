/**
 * P13 HEALTH CENTER (2026-10-13) -- Unit test src/lib/health.ts
 * (modul pure utk 7 kartu status /admin/health). Suite 33
 * (test:all = 33). Node langsung (type-stripping), konvensi sama
 * dgn test-low-stock-count.ts: modul hermetis diuji langsung.
 *     npm run test:health   (== node scripts/test-health.ts)
 *
 * Sifat yang diuji:
 *  - ambang HEALTH_THRESHOLD (500/2000 ms, 30 hari);
 *  - ageDays/ageLabel/shortDate (edge: null, hari ini, 1 hari, 35 hari,
 *    masa depan, string tak valid);
 *  - buildHealthCards: 7 kartu, urutan tetap, tone/warn/value per skenario
 *    (sehat, DB lambat, DB gagal, skema beda, backup lama/hilang, push off);
 *  - healthSummary: sedaya sehat / n perhatian / n gagal;
 *  - modul bebas string non-ASCII (tanpa emoji/unicode).
 */
import {
  ageDays,
  ageLabel,
  buildHealthCards,
  healthSummary,
  HEALTH_THRESHOLD,
  shortDate,
  type HealthInput,
} from '../src/lib/health.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const NOW = '2026-10-13T00:00:00.000Z';

function baseInput(patch: Partial<HealthInput> = {}): HealthInput {
  return {
    dbOk: true,
    dbMs: 42,
    schemaVersion: 29,
    expectedSchema: 29,
    buildStamp: 'abcdef123456',
    cacheKeys: 7,
    audit24h: 12,
    lastAuditAt: '2026-10-12T10:00:00.000Z',
    backupLast: '2026-10-01T00:00:00.000Z',
    backupLastBy: 'gusfi',
    vapidConfigured: true,
    notifCount: 3,
    nowIso: NOW,
    ...patch,
  };
}

function main() {
  console.log('# health (P13 Health Center, suite 33)\n');

  // -- Ambang --
  ok(
    'threshold: dbWarnMs 500 / dbBadMs 2000 / backupWarnDays 30',
    HEALTH_THRESHOLD.dbWarnMs === 500 &&
      HEALTH_THRESHOLD.dbBadMs === 2000 &&
      HEALTH_THRESHOLD.backupWarnDays === 30
  );

  // -- ageDays / ageLabel / shortDate --
  ok('ageDays: null -> null', ageDays(null, NOW) === null);
  ok('ageDays: hari ini -> 0', ageDays('2026-10-13T00:00:00.000Z', NOW) === 0);
  ok('ageDays: 1 hari -> 1', ageDays('2026-10-12T00:00:00.000Z', NOW) === 1);
  ok('ageDays: 35 hari -> 35', ageDays('2026-09-08T00:00:00.000Z', NOW) === 35);
  ok('ageDays: masa depan -> 0 (clamp)', ageDays('2026-11-01T00:00:00.000Z', NOW) === 0);
  ok('ageDays: string tak valid -> null', ageDays('bukan-waktu', NOW) === null);
  ok('ageLabel: null -> Belum ada catatan', ageLabel(null) === 'Belum ada catatan');
  ok('ageLabel: 0 -> Hari ini', ageLabel(0) === 'Hari ini');
  ok('ageLabel: 1 -> 1 hari lalu', ageLabel(1) === '1 hari lalu');
  ok('ageLabel: 35 -> 35 hari lalu', ageLabel(35) === '35 hari lalu');
  ok(
    'shortDate: ISO -> YYYY-MM-DD',
    shortDate('2026-10-01T08:00:00.000Z') === '2026-10-01' && shortDate(null) === ''
  );

  // -- buildHealthCards: skenario sehat --
  const good = buildHealthCards(baseInput());
  ok('7 kartu (DB..Notifikasi)', good.length === 7);
  ok(
    'urutan tetap',
    good.map((c) => c.key).join(',') ===
      'db,koneksi,versi,cache,log,backup,notifikasi'
  );
  ok(
    'sehat: semua tone good, tak ada warn',
    good.every((c) => c.tone === 'good' && !c.warn),
    good.map((c) => c.key + '=' + c.tone).join(' ')
  );
  const [dbC, konC, verC, caC, logC, bakC, notC] = good;
  ok(
    'DB sehat: OK + skema v29 + latensi',
    dbC.value === 'OK' && dbC.sub.includes('v29') && dbC.sub.includes('42 ms'),
    dbC.sub
  );
  ok(
    'Koneksi ONLINE + stempel build',
    konC.value === 'ONLINE' && konC.sub.includes('abcdef123456')
  );
  ok('Versi v29 cocok', verC.value === 'v29' && verC.sub.includes('v29'));
  ok('Cache: jumlah key', caC.value === '7');
  ok('Log: 12 per 24 jam + terakhir', logC.value === '12' && logC.sub.includes('2026-10-12'));
  ok(
    'Backup: tanggal + umur + pelaku',
    bakC.value === '2026-10-01' && bakC.sub.includes('oleh gusfi')
  );
  ok('Notifikasi: PUSH ON + jumlah', notC.value === 'PUSH ON' && notC.sub.includes('3 notifikasi'));

  // -- DB lambat (500-2000 ms) --
  const slow = buildHealthCards(baseInput({ dbMs: 800 }));
  ok(
    'DB lambat: LAMBAT + tone warn + ring',
    slow[0].value === 'LAMBAT' && slow[0].tone === 'warn' && slow[0].warn
  );

  // -- DB gagal (tidak terjangkau / >= 2000 ms) --
  const dead = buildHealthCards(
    baseInput({ dbOk: false, dbMs: null, schemaVersion: null })
  );
  ok('DB gagal: GAGAL + tone bad', dead[0].value === 'GAGAL' && dead[0].tone === 'bad' && dead[0].warn);
  ok(
    'Koneksi OFFLINE mengikuti DB',
    dead[1].value === 'OFFLINE' && dead[1].tone === 'bad' && dead[1].warn
  );
  ok('Versi tak diketahui: v? + warn', dead[2].value === 'v?' && dead[2].tone === 'warn');
  ok(
    'DB lambat ekstrem (3000 ms) = gagal',
    buildHealthCards(baseInput({ dbMs: 3000 }))[0].tone === 'bad'
  );

  // -- Skema beda --
  const mismatch = buildHealthCards(baseInput({ schemaVersion: 28 }));
  ok(
    'Skema beda: DB + Versi warn (belum migrasi)',
    mismatch[0].tone === 'warn' && mismatch[0].sub.includes('dulu v29') && mismatch[2].tone === 'warn'
  );

  // -- Backup --
  const noBak = buildHealthCards(baseInput({ backupLast: null, backupLastBy: null }));
  ok(
    'Backup belum pernah: BELUM + warn',
    noBak[5].value === 'BELUM' && noBak[5].tone === 'warn' && noBak[5].warn
  );
  const oldBak = buildHealthCards(baseInput({ backupLast: '2026-09-01T00:00:00.000Z' }));
  ok(
    'Backup 42 hari lalu: warn (> 30 hari)',
    oldBak[5].tone === 'warn' && oldBak[5].warn && oldBak[5].sub.includes('42 hari')
  );

  // -- Notifikasi --
  const noPush = buildHealthCards(baseInput({ vapidConfigured: false, notifCount: 0 }));
  ok(
    'Push OFF: warn + 0 notifikasi',
    noPush[6].value === 'PUSH OFF' && noPush[6].tone === 'warn' && noPush[6].sub.includes('0 notifikasi')
  );

  // -- Log sunyi --
  const quiet = buildHealthCards(baseInput({ audit24h: 0, lastAuditAt: null }));
  ok(
    'Log sunyi: 0 + belum ada aktivitas',
    quiet[4].value === '0' && quiet[4].sub.includes('belum ada aktivitas')
  );

  // -- healthSummary --
  ok(
    'Summary sehat: Sedaya sehat',
    healthSummary(good).ok === true && healthSummary(good).label === 'Sedaya sehat'
  );
  const sWarn = healthSummary(noBak);
  ok(
    'Summary perhatian: 1 perkara',
    sWarn.ok === false && sWarn.tone === 'warn' && sWarn.label === '1 perkara butuh perhatian'
  );
  const sBad = healthSummary(dead);
  ok(
    'Summary gagal: 2 perkara (db + koneksi)',
    sBad.ok === false && sBad.tone === 'bad' && sBad.label.startsWith('2 perkara gagal'),
    sBad.label
  );

  // -- Hermetis: modul bebas string non-ASCII --
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'health.ts'), 'utf8');
  ok('modul health.ts: 0 karakter non-ASCII', !/[^\x00-\x7F]/.test(src));
  ok(
    'modul health.ts: tanpa import @/db / next/',
    !src
      .split('\n')
      .filter((l) => /import|require/.test(l))
      .some((l) => /@\/db|next\//.test(l))
  );

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}
main();

