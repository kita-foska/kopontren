/**
 * W9 (skema v32) -- test wadi'ah santri (lib/wadi.ts):
 *  W1: setor baru (balance 0 -> 1000000).
 *  W2: tarik valid (1000000 -> 250000).
 *  W3: tarik guard (saldo kurang -> throw).
 *  W4: riwayat (urutan + limit).
 *  W5: saldo (read).
 *  W6: rekon (konsisten).
 *  W7: hermetis (no runtime db import).
 * Node langsung (type-stripping, Node >= 23.6): npm run test:wadi.
 */

import { DatabaseSync } from 'node:sqlite';

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.error('  FAIL ' + name + ((detail !== '') ? ' (' + detail + ')' : ''));
  }
}

// DDL mirror src/db.ts (skema v32: wadi_balances + wadi_ledger + index).
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS wadi_balances(
    member_id INTEGER NOT NULL PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE IF NOT EXISTS wadi_ledger(
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_wadi_ledger_member ON wadi_ledger(member_id, created_at DESC);
`);

// Adapter node:sqlite -> Db (permukaan async lib/wadi.ts; mirror test-coop.ts).
function toDb(d: import('node:sqlite').DatabaseSync): import('../src/db').Db {
  const inVals = (a: unknown[]) => a as import('node:sqlite').SQLInputValue[];
  return {
    prepare: (sql: string) => ({
      run: async (...a: unknown[]) => {
        const r = d.prepare(sql).run(...inVals(a)) as unknown as { changes: number | bigint };
        return { changes: Number(r.changes ?? 0), lastInsertRowid: 0 };
      },
      get: async (...a: unknown[]) => d.prepare(sql).get(...inVals(a)),
      all: async (...a: unknown[]) => d.prepare(sql).all(...inVals(a)),
    }),
    exec: async (sql: string) => { d.exec(sql); },
  } as import('../src/db').Db;
}
const shim = toDb(db);

// Import hermetic functions (type-only import = erased at runtime).
const { wadiSetor, wadiTarik, wadiRiwayat, wadiSaldo, wadiRekon } = await import('../src/lib/wadi.ts');

console.log('\nW9 Wadi\'ah test suite (skema v32)');

// W1: setor baru
const b1 = await wadiSetor(shim, 1, 1000000, 99, 'setor awal');
ok('W1 setor: balance_after', b1 === 1000000, 'dapat ' + b1);
const sal1 = await wadiSaldo(shim, 1);
ok('W1 saldo: read', sal1 === 1000000, 'dapat ' + sal1);

// W2: tarik valid
const b2 = await wadiTarik(shim, 1, 250000, 99, 'tarik parsial');
ok('W2 tarik: balance_after', b2 === 750000, 'dapat ' + b2);

// W3: tarik guard (saldo kurang)
let w3threw = false;
try {
  await wadiTarik(shim, 1, 9999999, 99, 'tarik berlebih');
} catch {
  w3threw = true;
}
ok('W3 guard: throw', w3threw);
const sal3 = await wadiSaldo(shim, 1);
ok('W3 saldo tidak berubah setelah guard', sal3 === 750000, 'dapat ' + sal3);

// W4: riwayat
const hist = await wadiRiwayat(shim, 1, 10, 0);
ok('W4 riwayat: 2 baris', hist.length === 2, 'dapat ' + hist.length);
ok('W4 riwayat: DESC (tarik dulu)', hist[0].type === 'tarik');
ok('W4 riwayat: balance_after setor', hist[1].balance_after === 1000000);

// W5: saldo
const sal5 = await wadiSaldo(shim, 999);
ok('W5 saldo member baru = 0', sal5 === 0, 'dapat ' + sal5);

// W6: rekon (konsisten)
const recon = await wadiRekon(shim);
ok('W6 rekon: 1 member', recon.length === 1, 'dapat ' + recon.length);
ok('W6 rekon: match', recon[0].match === true, 'expected=' + recon[0].expected + ' actual=' + recon[0].actual);

// W7: hermetis -- W7a: TIDAK ada import RUNTIME 'db' (value import dari
// '@/db', mis. "import { db } from '@/db'" -- membuka SQLite nyata).
// import TYPE-ONLY dari '@/db' DIZinkan (dihapus saat compile; pola
// lib/phone.ts + lib/pay-methods.ts). W7b: type-only import memang ada.
const { readFileSync } = await import('node:fs');
const wadiSrc = readFileSync(new URL('../src/lib/wadi.ts', import.meta.url), 'utf8');
ok('W7 hermetis: no runtime db import', !/^\s*import(?! type)[ \t]*\{[^}]*\}[ \t]*from[ \t]+'@\/db'/m.test(wadiSrc) && !wadiSrc.includes('require'));
ok('W7 hermetis: type-only import', wadiSrc.includes('import type'));

console.log('\n' + passes + ' pass, ' + failures + ' fail');
if (failures > 0) process.exit(1);