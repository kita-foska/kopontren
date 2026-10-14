/**
 * P15-B (2026-10-14) -- Suite 36 (test:all = 36): antrean offline POS +
 * stempel fetch utk panel /admin/health. Uji penambahan P15-B di
 * src/lib/offline-status.ts (POS_QUEUE_KEY + readPendingCount) + round-trip
 * stempel (recordLastFetch/readLastFetch) + paritas syncOf.
 * Node langsung (type-stripping), konvensi sama dgn test-offline-status.ts:
 * hermetis, localStorage di-mock (Map), SSR-safe (store = null).
 *     npm run test:p15b-queue   (== node scripts/test-p15b-queue.ts)
 *
 * Sifat yang diuji:
 *  - POS_QUEUE_KEY: kontrak key beku P13.1 (nilai tak berubah);
 *  - readPendingCount: null store / kosong / N item / JSON korup /
 *    bukan array / store melempar -> 0 (panel health tak boleh crash);
 *  - readPendingCount: read-only (tak pernah setItem);
 *  - recordLastFetch: tulis kop:lastfetch:<m> (round-trip readLastFetch);
 *    null store = no-op tanpa lempar;
 *  - syncOf: paritas dgn confidence.syncLabel (label tunggal P15-A).
 */
import type { KvStore } from '../src/lib/offline-status.ts';
import {
  POS_QUEUE_KEY,
  lastFetchKey,
  readLastFetch,
  readPendingCount,
  recordLastFetch,
  syncOf,
} from '../src/lib/offline-status.ts';
import { syncLabel } from '../src/lib/confidence.ts';

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.log('  FAIL ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

/** Mock localStorage minimal (KvStore) -- hermetis, tanpa DOM. */
function mockStore(entries: Record<string, string> = {}): KvStore {
  const m = new Map<string, string>(Object.entries(entries));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
  };
}

function queue(n: number): string {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      ref: 'ref-' + i,
      at: '2026-10-14T00:00:00.000Z',
      payload: {},
    }))
  );
}

function main(): void {
  // -- POS_QUEUE_KEY: kontrak beku (satu sumber, pos-client + panel) --
  ok(
    'POS_QUEUE_KEY: nilai beku P13.1',
    POS_QUEUE_KEY === 'kopontren_pos_queue_v1',
    POS_QUEUE_KEY
  );

  // -- readPendingCount: baca antrean offline POS --
  ok('readPendingCount: store null -> 0 (SSR-safe)', readPendingCount(null) === 0);
  ok('readPendingCount: store kosong -> 0', readPendingCount(mockStore()) === 0);
  ok(
    'readPendingCount: 3 antre -> 3',
    readPendingCount(mockStore({ [POS_QUEUE_KEY]: queue(3) })) === 3
  );
  ok(
    'readPendingCount: 1 antre -> 1',
    readPendingCount(mockStore({ [POS_QUEUE_KEY]: queue(1) })) === 1
  );
  ok(
    'readPendingCount: JSON korup -> 0 (aman)',
    readPendingCount(mockStore({ [POS_QUEUE_KEY]: '{bukan json' })) === 0
  );
  ok(
    'readPendingCount: bukan array -> 0',
    readPendingCount(mockStore({ [POS_QUEUE_KEY]: '{"ref":"a"}' })) === 0
  );
  ok(
    'readPendingCount: raw "null" -> 0',
    readPendingCount(mockStore({ [POS_QUEUE_KEY]: 'null' })) === 0
  );
  const throwingStore: KvStore = {
    getItem: () => {
      throw new Error('localStorage tidak tersedia');
    },
    setItem: () => {},
  };
  ok(
    'readPendingCount: store melempar -> 0 (tidak crash)',
    readPendingCount(throwingStore) === 0
  );
  const writes: string[] = [];
  const spyStore: KvStore = {
    getItem: () => queue(2),
    setItem: (k) => void writes.push(k),
  };
  readPendingCount(spyStore);
  ok('readPendingCount: read-only (0 setItem)', writes.length === 0);

  // -- recordLastFetch / readLastFetch: round-trip stempel fetch --
  ok('lastFetchKey: bentuk key', lastFetchKey('kas') === 'kop:lastfetch:kas');
  const s2 = mockStore();
  recordLastFetch('member', '2026-10-14T10:00:00.000Z', s2);
  ok(
    'recordLastFetch -> readLastFetch round-trip',
    readLastFetch('member', s2) === '2026-10-14T10:00:00.000Z'
  );
  ok('readLastFetch: modul tak tertempel -> null', readLastFetch('zakat', s2) === null);
  let ssrOk = true;
  try {
    recordLastFetch('kas', '2026-10-14T10:00:00.000Z', null); // no-op, tak lempar
  } catch {
    ssrOk = false;
  }
  ok('recordLastFetch: store null = no-op tanpa lempar (SSR-safe)', ssrOk);

  // -- syncOf: paritas dgn confidence.syncLabel (label tunggal P15-A) --
  ok('syncOf(0): "Tersinkron"', syncOf(0) === 'Tersinkron');
  ok('syncOf(3): "3 menunggu sinkronisasi"', syncOf(3) === '3 menunggu sinkronisasi');
  ok('syncOf: paritas dgn syncLabel (0/1/7)', [0, 1, 7].every((n) => syncOf(n) === syncLabel(n)));

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}
main();