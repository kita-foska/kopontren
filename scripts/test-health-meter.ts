/**
 * W14-3 HEALTH METER (2026-10-26) -- Unit test tambahan src/lib/health.ts
 * (skor agregat + zona + baris rasio utk speedometer dashboard pengurus).
 * Suite 44 (test:all = 44; suite 33 = kartu 7 /admin/health).
 * Node langsung (type-stripping), konvensi sama dgn test-health.ts.
 *
 * Sifat yang diuji:
 *  - HEALTH_SCORE (ambang zona: 90/40);
 *  - healthScore: 100 dasar; -30 per bad; -10 per warn; floor 0;
 *    skenario sehat/gagal-DB/backup-telat/push-off/mix;
 *  - healthScoreTone: >=90 green, >=40 amber, <40 red (edge boundary);
 *  - healthMeterRows: 3 baris db/backup/notifikasi, urutan tetap,
 *    field ter-proyeksi dari kartu, robust utk kartu degraded;
 *  - modul hermetis: 0 karakter non-ASCII + tanpa import @/db / next/
 *    (kolektor server terpisah di src/lib/health-collector.ts);
 *  - komponen health-meter.tsx: 0 karakter non-ASCII + server-safe
 *    (tanpa 'use client' / hook -- SVG statis dari prop).
 */
import {
  buildHealthCards,
  healthMeterRows,
  healthScore,
  healthScoreTone,
  HEALTH_SCORE,
  type HealthCard,
  type HealthInput,
  type HealthTone,
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

const NOW = '2026-10-26T00:00:00.000Z';

function baseInput(patch: Partial<HealthInput> = {}): HealthInput {
  return {
    dbOk: true,
    dbMs: 42,
    schemaVersion: 34,
    expectedSchema: 34,
    buildStamp: 'abcdef123456',
    cacheKeys: 7,
    audit24h: 12,
    lastAuditAt: '2026-10-25T10:00:00.000Z',
    backupLast: '2026-10-10T00:00:00.000Z',
    backupLastBy: 'gusfi',
    vapidConfigured: true,
    notifCount: 3,
    nowIso: NOW,
    ...patch,
  };
}

/** Kartu buatan (tanpa buildHealthCards) utk uji skor deterministik. */
function mkCard(tone: HealthTone): HealthCard {
  return {
    key: 'db',
    label: 'DB',
    value: 'X',
    sub: '',
    tone,
    warn: tone !== 'good',
    href: '/admin/health',
    tip: '',
  };
}

function main() {
  console.log('# health-meter (W14-3 Health Meter, suite 44)\n');

  // -- Ambang zona --
  ok(
    'HEALTH_SCORE: good 90 / ok 40',
    HEALTH_SCORE.good === 90 && HEALTH_SCORE.ok === 40
  );

  // -- healthScore: skenario via kartu riil --
  const good = buildHealthCards(baseInput());
  ok('sehat: skor 100', healthScore(good) === 100, String(healthScore(good)));
  const noBak = buildHealthCards(baseInput({ backupLast: null, backupLastBy: null }));
  ok('1 warn (backup): skor 90', healthScore(noBak) === 90, String(healthScore(noBak)));
  const dead = buildHealthCards(baseInput({ dbOk: false, dbMs: null, schemaVersion: null }));
  ok(
    'DB gagal: skor 30 (2 bad + 1 warn versi)',
    healthScore(dead) === 30,
    String(healthScore(dead))
  );
  const slowOld = buildHealthCards(
    baseInput({ dbMs: 800, backupLast: '2026-09-01T00:00:00.000Z', vapidConfigured: false })
  );
  ok(
    'mix (db warn + backup warn + push warn): skor 70',
    healthScore(slowOld) === 70,
    String(healthScore(slowOld))
  );

  // -- healthScore: deterministik via kartu buatan --
  const allBad = Array.from({ length: 7 }, () => mkCard('bad'));
  ok('7 bad: floor 0', healthScore(allBad) === 0);
  ok('3 bad: skor 10', healthScore(Array.from({ length: 3 }, () => mkCard('bad'))) === 10);
  const mix = [mkCard('bad'), mkCard('warn'), mkCard('warn'), mkCard('warn'), mkCard('warn')];
  ok('1 bad + 4 warn: skor 30', healthScore(mix) === 30, String(healthScore(mix)));
  // -- healthScoreTone: boundary --
  ok('tone: 100 green', healthScoreTone(100) === 'green');
  ok('tone: 90 green (boundary)', healthScoreTone(90) === 'green');
  ok('tone: 89 amber', healthScoreTone(89) === 'amber');
  ok('tone: 40 amber (boundary)', healthScoreTone(40) === 'amber');
  ok('tone: 39 red', healthScoreTone(39) === 'red');
  ok('tone: 0 red', healthScoreTone(0) === 'red');
  ok('konsisten: sehat=green', healthScoreTone(healthScore(good)) === 'green');
  ok('konsisten: DB gagal=red', healthScoreTone(healthScore(dead)) === 'red');

  // -- healthMeterRows: 3 baris dari 7 kartu --
  const rows = healthMeterRows(good);
  ok('3 baris (DB/Backup/Push)', rows.length === 3);
  ok(
    'urutan tetap db,backup,notifikasi',
    rows.map((r) => r.key).join(',') === 'db,backup,notifikasi'
  );
  const [dbRow, bakRow, pushRow] = rows;
  ok('baris DB: value OK + sub ms', dbRow.value === 'OK' && dbRow.sub.includes('42 ms'));
  ok(
    'baris Backup: tanggal + pelaku',
    bakRow.value === '2026-10-10' && bakRow.sub.includes('oleh gusfi')
  );
  ok(
    'baris Push: PUSH ON + jumlah',
    pushRow.value === 'PUSH ON' && pushRow.sub.includes('3 notifikasi')
  );
  ok(
    'label awam',
    dbRow.label === 'Database' && bakRow.label === 'Backup' && pushRow.label === 'Push'
  );
  const deadRows = healthMeterRows(dead);
  ok(
    'robust utk kartu degraded (DB gagal): tetap 3 baris, DB GAGAL',
    deadRows.length === 3 && deadRows[0].value === 'GAGAL' && deadRows[0].tone === 'bad'
  );
  ok('baris sehat: tone good + warn false', rows.every((r) => r.tone === 'good' && !r.warn));

  // -- Hermetis: modul pure bebas non-ASCII & tanpa dependensi server --
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'health.ts'), 'utf8');
  ok('modul health.ts: 0 karakter non-ASCII', !/[^\x00-\x7F]/.test(src));
  ok(
    'modul health.ts: tanpa import @/db / next/',
    !src
      .split('\n')
      .filter((l) => /import|require/.test(l))
      .some((l) => /@\/db|next\//.test(l))
  );
  const comp = readFileSync(join(process.cwd(), 'src', 'components', 'health-meter.tsx'), 'utf8');
  ok('komponen health-meter.tsx: 0 karakter non-ASCII', !/[^\x00-\x7F]/.test(comp));
  ok(
    'komponen health-meter.tsx: server-safe (tanpa use client / hook / event)',
    !/^[\s"'`]*use client[\s"'`]/m.test(comp) &&
      !/\buse[A-Z]/.test(comp) &&
      !/onClick|addEventListener/.test(comp)
  );

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}
main();
