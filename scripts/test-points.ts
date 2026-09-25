/**
 * Unit test modul ledger poin/reward (src/lib/points.ts — modul murni).
 * Menjalankan SQL nyata (paginasi LIMIT/OFFSET + ORDER BY) terhadap
 * in-memory SQLite (node:sqlite) agar urutan & isolasi per-member
 * terverifikasi.
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:points     (== node scripts/test-points.ts)
 * Tanpa framework test — output sederhana, exit code 1 bila ada gagal.
 * Pola harness in-memory + shim sama dgn scripts/test-neraca.ts,
 * ditambah shim ber-argumen (queryPointHistory memakai parameter).
 */
import {
  countPointHistory,
  isPointUnit,
  pointReasonLabel,
  queryPointHistory,
} from '../src/lib/points.ts';
import type { QueryDb } from '../src/lib/keuangan.ts';

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

function eq<T>(name: string, actual: T, expected: T): void {
  ok(name, actual === expected, 'dapat ' + String(actual) + ', seharusnya ' + String(expected));
}

/** Skema minimal: kolom eksak tabel point_history (src/db.ts). */
const SCHEMA = `
CREATE TABLE point_history (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  sale_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)`;

async function main(): Promise<void> {
  let sqliteErr = '';
  let db: import('node:sqlite').DatabaseSync | null = null;
  try {
    const mod = await import('node:sqlite');
    db = new mod.DatabaseSync(':memory:');
    db.exec(SCHEMA);
  } catch (e) {
    sqliteErr = String(e);
  }
  if (!db) {
    console.error('  SKIP — node:sqlite tidak tersedia: ' + sqliteErr);
    console.log('HAS_FAILURE');
    process.exit(1);
  }

  // node:sqlite sinkron -> dibungkus Promise agar cocok dgn QueryDb.
  // queryPointHistory MEMAKAI parameter (memberId, limit, offset) —
  // shim ber-argumen (beda dgn test-neraca yang tanpa parameter).
  const shim = {
    prepare: (q: string) => ({
      all: async (...args: unknown[]) => db!.prepare(q).all(...(args as Array<string | number>)),
      get: async (...args: unknown[]) => db!.prepare(q).get(...(args as Array<string | number>)),
    }),
  } as unknown as QueryDb;

  // ── Label reason (satu sumber, fallback uppercase) ──
  eq('label earn', pointReasonLabel('earn'), 'Poin Masuk');
  eq('label redeem', pointReasonLabel('redeem'), 'Tukar Poin');
  eq('label void', pointReasonLabel('void'), 'Poin Dibatalkan');
  eq('label refund', pointReasonLabel('refund'), 'Tukar Dikembalikan');
  eq('label cashback', pointReasonLabel('cashback'), 'Reward Masuk');
  eq('label cashback_use', pointReasonLabel('cashback_use'), 'Reward Terpakai');
  eq('label refund_cash', pointReasonLabel('refund_cash'), 'Reward Dikembalikan');
  eq('label unknown -> UPPERCASE', pointReasonLabel('xyz'), 'XYZ');

  // ── Deteksi unit delta (poin vs rupiah/reward) ──
  ok(
    'isPointUnit poin',
    isPointUnit('earn') && isPointUnit('redeem') && isPointUnit('void') && isPointUnit('refund')
  );
  ok(
    'isPointUnit rupiah (cashback*)',
    !isPointUnit('cashback') && !isPointUnit('cashback_use') && !isPointUnit('refund_cash')
  );

  // ── Data uji (created_at eksplisit utk kontrol urutan) ──
  // member 1: 4 baris — 2 transaksi (earn+cashback @tx101, redeem+cashback_use @tx102)
  // member 2: 1 baris earn · member 3: 1 baris void (sale_id NULL)
  // member 4: 2 baris dgn created_at TERBALIK vs id (uji ORDER BY created_at)
  db.exec(
    `INSERT INTO point_history (member_id, delta, reason, amount, sale_id, created_at) VALUES
       (1, 5, 'earn', 50000, 101, '2026-09-01T00:00:00.000Z'),
       (1, 2500, 'cashback', 50000, 101, '2026-09-01T00:00:00.000Z'),
       (1, -3, 'redeem', 300, 102, '2026-09-02T00:00:00.000Z'),
       (1, -1500, 'cashback_use', 1500, 102, '2026-09-02T00:00:00.000Z'),
       (2, 1, 'earn', 10000, 201, '2026-09-03T00:00:00.000Z'),
       (3, -2, 'void', 0, NULL, '2026-09-04T00:00:00.000Z'),
       (4, 7, 'earn', 70000, 301, '2026-09-05T00:00:00.000Z'),
       (4, 3, 'earn', 30000, 302, '2026-09-04T00:00:00.000Z')`
  );

  // ── Urutan: terbaru dulu; ms sama -> tie-breaker id DESC ──
  const m1 = await queryPointHistory(shim, 1, 20, 0);
  eq('member 1 = 4 baris', m1.length, 4);
  eq('urutan terbaru dulu (id 4,3,2,1)', m1.map((r) => r.id).join(','), '4,3,2,1');
  eq('baris #0 reason', m1[0].reason, 'cashback_use');
  eq('baris #0 delta negatif', m1[0].delta, -1500);
  eq('baris #0 sale_id', m1[0].sale_id, 102);

  // ── Paginasi LIMIT/OFFSET ──
  const p1 = await queryPointHistory(shim, 1, 2, 0);
  const p2 = await queryPointHistory(shim, 1, 2, 2);
  const p3 = await queryPointHistory(shim, 1, 2, 4);
  eq('page 1 (limit 2)', p1.map((r) => r.id).join(','), '4,3');
  eq('page 2 (offset 2)', p2.map((r) => r.id).join(','), '2,1');
  eq('page habis -> kosong', p3.length, 0);

  // ── Isolasi per-member ──
  const m2 = await queryPointHistory(shim, 2, 50, 0);
  eq('member 2 = 1 baris', m2.length, 1);
  eq('member 2 reason', m2[0].reason, 'earn');
  const m3 = await queryPointHistory(shim, 3, 50, 0);
  eq('member 3 void (sale_id NULL -> null)', m3[0].sale_id, null);
  const m99 = await queryPointHistory(shim, 99, 50, 0);
  eq('member tak dikenal -> kosong', m99.length, 0);

  // ── created_at DESC menang atas id DESC (insert #7 lebih baru dari #8) ──
  const m4 = await queryPointHistory(shim, 4, 50, 0);
  eq('urut created_at (id 7 sebelum 8)', m4.map((r) => r.id).join(','), '7,8');

  // ── COUNT per-member (untuk "Muat lebih banyak") ──
  eq('count member 1', await countPointHistory(shim, 1), 4);
  eq('count member 2', await countPointHistory(shim, 2), 1);
  eq('count member 4', await countPointHistory(shim, 4), 2);
  eq('count tak dikenal', await countPointHistory(shim, 99), 0);

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();