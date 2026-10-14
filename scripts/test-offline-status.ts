/**
 * P14 OFFLINE CONFIDENCE (2026-10-14) -- Unit test src/lib/offline-status.ts
 * (status per modul + stempel "Terakhir online"). Suite 35 (test:all = 35).
 * Node langsung (type-stripping), konvensi sama dgn test-confidence.ts:
 * modul hermetis diuji langsung, nowIso diinjeksi, localStorage di-mock
 * (Map) + SSR-safe (store = null).
 *     npm run test:offline-status   (== node scripts/test-offline-status.ts)
 *
 * Sifat yang diuji:
 *  - lastFetchKey / LASTONLINE_KEY: bentuk key;
 *  - readLastFetch / readLastOnline: mock, missing, null store (SSR-safe);
 *  - recordLastFetch / recordLastOnline: tulis, null store no-op;
 *  - isValidStamp: valid / null / kosong / tak valid;
 *  - freshnessOf: hari ini / N hari / null / tak valid -> "Belum ada catatan akses";
 *  - lastFetchLabel: komposisi P15-A (freshness + syncLabel), paritas confidence;
 *  - lastOnlineLabel: "Terakhir online {umur}" / null / tak valid;
 *  - syncOf: paritas dgn confidence.syncLabel;
 *  - hermetis: offline-status.ts 0 non-ASCII & tanpa import @/db / next/;
 *  - SSR-safe: semua read/record dgn store null -> null / no-op, tak lempar.
 */
import {
  LASTONLINE_KEY,
  LASTFETCH_PREFIX,
  freshnessOf,
  isValidStamp,
  lastFetchKey,
  lastFetchLabel,
  lastOnlineLabel,
  recordLastFetch,
  recordLastOnline,
  readLastFetch,
  readLastOnline,
  syncOf,
} from '../src/lib/offline-status.ts';
import { ageDays, ageLabel, syncLabel } from '../src/lib/confidence.ts';
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

/** Mock localStorage berbasis Map (memenuhi bentuk minim KvStore). */
function makeStore(init: Record<string, string> = {}) {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(init)) m.set(k, v);
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
}

const NOW = '2026-10-14T00:00:00.000Z'; // 07.00 WIB
function main() {
  console.log('# offline-status (P14 Offline Confidence, suite 35)\n');

  // -- bentuk key --
  ok('LASTFETCH_PREFIX', LASTFETCH_PREFIX === 'kop:lastfetch:');
  ok('LASTONLINE_KEY', LASTONLINE_KEY === 'kop:lastonline');
  ok('lastFetchKey: kas', lastFetchKey('kas') === 'kop:lastfetch:kas');
  ok('lastFetchKey: member', lastFetchKey('member') === 'kop:lastfetch:member');

  // -- readLastFetch --
  const s1 = makeStore({ 'kop:lastfetch:kas': '2026-10-13T00:00:00.000Z' });
  ok('readLastFetch: ada -> ISO', readLastFetch('kas', s1) === '2026-10-13T00:00:00.000Z');
  ok('readLastFetch: missing -> null', readLastFetch('hutang', s1) === null);
  ok('readLastFetch: null store (SSR-safe) -> null', readLastFetch('kas', null) === null);

  // -- readLastOnline --
  const s2 = makeStore({ [LASTONLINE_KEY]: '2026-10-14T00:00:00.000Z' });
  ok('readLastOnline: ada -> ISO', readLastOnline(s2) === '2026-10-14T00:00:00.000Z');
  ok('readLastOnline: missing -> null', readLastOnline(makeStore()) === null);
  ok('readLastOnline: null store -> null', readLastOnline(null) === null);

  // -- recordLastFetch --
  const s3 = makeStore();
  recordLastFetch('member', '2026-10-14T00:00:00.000Z', s3);
  ok(
    'recordLastFetch: menulis key',
    readLastFetch('member', s3) === '2026-10-14T00:00:00.000Z'
  );
  recordLastFetch('member', 'x', null); // no-op, tak boleh lempar
  ok('recordLastFetch: null store -> no-op (tanpa lempar)', true);

  // -- recordLastOnline --
  const s4 = makeStore();
  recordLastOnline('2026-10-14T00:00:00.000Z', s4);
  ok('recordLastOnline: menulis key', readLastOnline(s4) === '2026-10-14T00:00:00.000Z');
  recordLastOnline('x', null); // no-op
  ok('recordLastOnline: null store -> no-op (tanpa lempar)', true);

  // -- isValidStamp --
  ok('isValidStamp: valid -> true', isValidStamp('2026-10-13T00:00:00.000Z') === true);
  ok('isValidStamp: null -> false', isValidStamp(null) === false);
  ok('isValidStamp: kosong -> false', isValidStamp('') === false);
  ok('isValidStamp: tak valid -> false', isValidStamp('bukan-waktu') === false);

  // -- freshnessOf --
  ok(
    'freshnessOf: hari ini',
    freshnessOf('2026-10-14T00:00:00.000Z', NOW) === 'Terakhir diperbarui Hari ini'
  );
  ok(
    'freshnessOf: 2 hari',
    freshnessOf('2026-10-12T00:00:00.000Z', NOW) === 'Terakhir diperbarui 2 hari lalu'
  );
  ok(
    'freshnessOf: null -> Belum ada catatan akses',
    freshnessOf(null, NOW) === 'Belum ada catatan akses'
  );
  ok(
    'freshnessOf: tak valid -> Belum ada catatan akses',
    freshnessOf('bukan-waktu', NOW) === 'Belum ada catatan akses'
  );

  // -- lastFetchLabel (komposisi P15-A: freshness + sinkron) --
  ok(
    'lastFetchLabel: segar + tersinkron',
    lastFetchLabel('2026-10-12T00:00:00.000Z', 0, NOW) ===
      'Terakhir diperbarui 2 hari lalu / Tersinkron'
  );
  ok(
    'lastFetchLabel: 3 menunggu',
    lastFetchLabel('2026-10-12T00:00:00.000Z', 3, NOW) ===
      'Terakhir diperbarui 2 hari lalu / 3 menunggu sinkronisasi'
  );
  ok(
    'lastFetchLabel: null + tersinkron',
    lastFetchLabel(null, 0, NOW) === 'Belum ada catatan akses / Tersinkron'
  );
  ok(
    'lastFetchLabel: paritas dgn confidence (freshness + syncLabel)',
    lastFetchLabel('2026-10-12T00:00:00.000Z', 5, NOW) ===
      freshnessOf('2026-10-12T00:00:00.000Z', NOW) + ' / ' + syncLabel(5)
  );

  // -- lastOnlineLabel --
  ok(
    'lastOnlineLabel: hari ini',
    lastOnlineLabel('2026-10-14T00:00:00.000Z', NOW) === 'Terakhir online Hari ini'
  );
  ok(
    'lastOnlineLabel: 3 hari',
    lastOnlineLabel('2026-10-11T00:00:00.000Z', NOW) === 'Terakhir online 3 hari lalu'
  );
  ok(
    'lastOnlineLabel: null -> Belum ada catatan online',
    lastOnlineLabel(null, NOW) === 'Belum ada catatan online'
  );
  ok(
    'lastOnlineLabel: tak valid -> Belum ada catatan online',
    lastOnlineLabel('bukan-waktu', NOW) === 'Belum ada catatan online'
  );
  ok(
    'lastOnlineLabel: paritas dgn confidence (ageLabel + ageDays)',
    lastOnlineLabel('2026-10-11T00:00:00.000Z', NOW) ===
      'Terakhir online ' + ageLabel(ageDays('2026-10-11T00:00:00.000Z', NOW))
  );

  // -- syncOf (paritas dgn confidence.syncLabel) --
  ok('syncOf: paritas 0', syncOf(0) === syncLabel(0));
  ok('syncOf: paritas 1', syncOf(1) === syncLabel(1));
  ok('syncOf: paritas 7', syncOf(7) === syncLabel(7));

  // -- Hermetis: modul bebas string non-ASCII & tanpa dependensi server --
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'offline-status.ts'), 'utf8');
  ok('modul offline-status.ts: 0 karakter non-ASCII', !/[^\x00-\x7F]/.test(src));
  ok(
    'modul offline-status.ts: tanpa import @/db / next/',
    !src
      .split('\n')
      .filter((l) => /import|require/.test(l))
      .some((l) => /@\/db|next\//.test(l))
  );

  // -- SSR-safe: semua operasi dgn store null tak lempar & deterministik --
  let ssrOk = true;
  try {
    if (readLastFetch('a', null) !== null) ssrOk = false;
    if (readLastOnline(null) !== null) ssrOk = false;
    recordLastFetch('a', 'now', null);
    recordLastOnline('now', null);
  } catch {
    ssrOk = false;
  }
  ok('SSR-safe: read/record dgn store null -> null/no-op tanpa lempar', ssrOk);

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}
main();
