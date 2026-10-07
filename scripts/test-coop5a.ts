/**
 * W4.5a - test Modal 3010 (src/lib/coop-modal.ts) + jurnal closing 3020
 * (src/lib/coop-closing.ts). Harness SELF-CONTAINED: in-memory node:sqlite,
 * pola scripts/test-shu.ts (adapter toTxDb + DDL mirror src/db.ts).
 * Jalankan: node scripts/test-coop5a.ts (Node >= 23.6 type-stripping).
 *
 * Cakupan:
 *  M1: modal GL ON -- baris kind 'modal' + jurnal D1010/K3010; ref_id
 *      'coop#<id>:md#<savedAt>@<amt>#<uuid>'; entry_date = saved_at.
 *  M2: GL OFF -- baris tercatat, tanpa jurnal.
 *  M3: uuid (DeepSeek NOTE 1): 2 event beda (uuid beda) = ref beda;
 *      retry event SAMA (member+tgl+nominal) uuid baru ->
 *      COOP_MODAL_DUPLICATE.
 *  M4: COOP_MEMBER_NOT_FOUND; amount tak valid -> galat 'coop:' (400).
 *  C1: laba -- legs D<akun P&L> + K3020.
 *  C2: rugi -- legs C<akun beban> + D3020 (3020 boleh negatif, OQ2).
 *  C3: 4040 & 4090 tidak ikut closing (OQ1/F-flag1).
 *  C4: akun net 0 = tanpa legs (OQ9).
 *  C5: kumulatif self-healing (F-flag2): closing ke-2 hanya aktivitas baru.
 *  C6: re-post spec closing = no-op idempoten.
 *  C7: CLOSING_PERIOD_EXISTS (1 periode = 1 closing).
 *  C8: GL OFF -> entryId null, shu tetap dihitung, tanpa jurnal baru.
 *  C9: entry_date = hari terakhir periode (2026-12 -> 31; 2024-02 -> 29).
 *  C10: periode tanpa aktivitas -> CLOSING_NO_ACTIVITY (DeepSeek NOTE 2).
 */
import { DatabaseSync } from 'node:sqlite';
import { recordCoopModalInTx, COOP_MODAL_ACCT } from '../src/lib/coop-modal.ts';
import {
  postCoopClosingInTx,
  computeClosingLegs,
  buildClosingSpec,
  closingEntryDate,
} from '../src/lib/coop-closing.ts';
import { postJournalInTx } from '../src/lib/jurnal.ts';
import type { JLine, TxDb } from '../src/lib/jurnal.ts';

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

// -- DDL mirror src/db.ts (skema v24) --------------------------------
const DDL_JE =
  "CREATE TABLE journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))";
const DDL_JL =
  "CREATE TABLE journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))";
const DDL_MEMBERS =
  "CREATE TABLE coop_members(id TEXT PRIMARY KEY, name TEXT NOT NULL, npwp TEXT, member_since TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aktif', rumpun TEXT, UNIQUE(name))";
const DDL_SAVINGS =
  "CREATE TABLE coop_savings(member_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(member_id, kind, saved_at, amount))";

/** Adapter node:sqlite -> TxDb (pola test-shu.ts). */
function toTxDb(db: DatabaseSync): TxDb {
  return {
    prepare(sql: string) {
      const s = db.prepare(sql);
      return {
        run(...args: unknown[]) {
          const r = s.run(...(args as []));
          return Promise.resolve({
            changes: Number(r.changes),
            lastInsertRowid: Number(r.lastInsertRowid),
          });
        },
        get(...args: unknown[]) {
          return Promise.resolve(s.get(...(args as [])) as unknown);
        },
        all(...args: unknown[]) {
          return Promise.resolve(s.all(...(args as [])) as unknown[]);
        },
      };
    },
  };
}

function fresh(): { db: DatabaseSync; tdb: TxDb } {
  const db = new DatabaseSync(':memory:');
  db.exec(DDL_JE);
  db.exec(DDL_JL);
  db.exec(DDL_MEMBERS);
  db.exec(DDL_SAVINGS);
  return { db, tdb: toTxDb(db) };
}

/** Nilai sisi (debit|credit) utk entry+akun; 0 bila tak ada baris. */
function lineVal(db: DatabaseSync, entryId: string, code: string, side: 'debit' | 'credit'): number {
  const r = db
    .prepare('SELECT ' + side + ' AS v FROM journal_lines WHERE entry_id = ? AND account_code = ?')
    .get(entryId, code) as { v: number } | undefined;
  return r ? r.v : 0;
}

function entryByRef(db: DatabaseSync, refId: string): string | null {
  const r = db
    .prepare("SELECT id FROM journal_entries WHERE ref_table = 'coop' AND ref_id = ?")
    .get(refId) as { id: string } | undefined;
  return r ? r.id : null;
}

function cnt(db: DatabaseSync, sql: string): number {
  return Number((db.prepare(sql).get() as { c: number } | undefined)?.c ?? 0);
}

/**
 * Seed aktivitas P&L: jurnal manual seimbang -- kaki P&L diminta + kaki
 * penyeimbang 9999 (di luar subset closing) agar D=K.
 */
let seedSeq = 0;
async function seedPnl(
  tdb: TxDb,
  date: string,
  parts: Array<{ code: string; d: number; c: number }>
): Promise<void> {
  let sd = 0;
  let sc = 0;
  for (const p of parts) {
    sd += p.d;
    sc += p.c;
  }
  const lines: JLine[] = parts.map((p) => ({
    account_code: p.code,
    debit: p.d,
    credit: p.c,
    source: 'seed ' + p.code,
  }));
  if (sd > sc) lines.push({ account_code: '9999', debit: 0, credit: sd - sc, source: 'bal' });
  else lines.push({ account_code: '9999', debit: sc - sd, credit: 0, source: 'bal' });
  seedSeq++;
  await postJournalInTx(tdb, {
    id: 'JE-seed-' + seedSeq,
    ref_table: 'coop',
    ref_id: null,
    entry_date: date,
    type: 'manual',
    desc: 'seed P&L ' + date,
    lines,
  });
}

async function main(): Promise<void> {
  // ===== M1-M4: modal 3010 ==========================================
  {
    const { db, tdb } = fresh();
    db.prepare("INSERT INTO coop_members (id, name, member_since) VALUES ('m1', 'Umar', '2026-01-01')").run();

    // M1: GL ON -- baris + jurnal D1010/K3010, ref + uuid.
    const r1 = await recordCoopModalInTx(tdb, {
      memberId: 'm1',
      amount: 500_000,
      savedAt: '2026-07-05',
      gl_enabled: true,
      createdBy: 'gus',
    });
    ok('M1: entryId ada', !!r1.entryId, String(r1.entryId));
    eq(
      'M1: baris coop_savings kind modal = 500000',
      cnt(db, "SELECT COUNT(*) c FROM coop_savings WHERE member_id='m1' AND kind='modal' AND amount=500000"),
      1
    );
    eq('M1: D1010 = 500000', lineVal(db, r1.entryId!, COOP_MODAL_ACCT.KAS, 'debit'), 500_000);
    eq('M1: K3010 = 500000', lineVal(db, r1.entryId!, COOP_MODAL_ACCT.MODAL, 'credit'), 500_000);
    eq(
      'M1: ref_id coop#m1:md#2026-07-05@500000#<uuid>',
      entryByRef(db, 'coop#m1:md#2026-07-05@500000#' + r1.uuid),
      r1.entryId
    );
    eq(
      'M1: entry_date = saved_at',
      String((db.prepare('SELECT entry_date AS v FROM journal_entries WHERE id = ?').get(r1.entryId!) as { v: string }).v),
      '2026-07-05'
    );

    // M2: GL OFF -- baris saja, tanpa jurnal.
    const r2 = await recordCoopModalInTx(tdb, {
      memberId: 'm1',
      amount: 100_000,
      savedAt: '2026-07-06',
      gl_enabled: false,
    });
    eq('M2: entryId null (GL off)', r2.entryId, null);
    eq('M2: baris modal 100000 tercatat', cnt(db, "SELECT COUNT(*) c FROM coop_savings WHERE amount=100000"), 1);
    eq('M2: jurnal tetap 1 (M1 saja)', cnt(db, 'SELECT COUNT(*) c FROM journal_entries'), 1);

    // M3: uuid -- event beda nominal (detik sama) = ref beda; retry
    // event SAMA dgn uuid baru -> COOP_MODAL_DUPLICATE.
    const r3a = await recordCoopModalInTx(tdb, {
      memberId: 'm1',
      amount: 500_000,
      savedAt: '2026-07-07',
      uuid: 'aaa',
      gl_enabled: true,
    });
    const r3b = await recordCoopModalInTx(tdb, {
      memberId: 'm1',
      amount: 700_000,
      savedAt: '2026-07-07',
      uuid: 'bbb',
      gl_enabled: true,
    });
    ok('M3: 2 event = 2 ref (uuid beda)', r3a.entryId !== r3b.entryId);
    eq('M3: ref a = ...#aaa', entryByRef(db, 'coop#m1:md#2026-07-07@500000#aaa'), r3a.entryId);
    eq('M3: ref b = ...#bbb', entryByRef(db, 'coop#m1:md#2026-07-07@700000#bbb'), r3b.entryId);
    let eM3 = '';
    try {
      await recordCoopModalInTx(tdb, {
        memberId: 'm1',
        amount: 500_000,
        savedAt: '2026-07-07',
        uuid: 'ccc',
        gl_enabled: true,
      });
    } catch (x) {
      eM3 = String(x);
    }
    ok('M3: event duplikat -> COOP_MODAL_DUPLICATE', eM3.includes('COOP_MODAL_DUPLICATE'));
    eq(
      'M3: baris 500k@07 tetap 1',
      cnt(db, "SELECT COUNT(*) c FROM coop_savings WHERE amount=500000 AND saved_at='2026-07-07'"),
      1
    );

    // M4: anggota tak ada / amount tak valid.
    let eM4a = '';
    try {
      await recordCoopModalInTx(tdb, { memberId: 'nobody', amount: 1_000, savedAt: '2026-07-08', gl_enabled: true });
    } catch (x) {
      eM4a = String(x);
    }
    ok('M4: anggota tak ada -> COOP_MEMBER_NOT_FOUND', eM4a.includes('COOP_MEMBER_NOT_FOUND'));
    let eM4b = '';
    try {
      await recordCoopModalInTx(tdb, { memberId: 'm1', amount: 0, savedAt: '2026-07-08', gl_enabled: true });
    } catch (x) {
      eM4b = String(x);
    }
    ok('M4: amount 0 -> galat validasi coop:', eM4b.includes('coop: amount harus positif'));
    db.close();
  }

  // ===== C1: laba =====================================================
  {
    const { db, tdb } = fresh();
    await seedPnl(tdb, '2026-07-10', [
      { code: '4010', d: 0, c: 1_000_000 },
      { code: '4030', d: 0, c: 200_000 },
      { code: '5030', d: 600_000, c: 0 },
      { code: '5010', d: 150_000, c: 0 },
    ]);
    const r = await postCoopClosingInTx(tdb, { period: '2026-07', glEnabled: true, createdBy: 'gus' });
    eq('C1: shu = 450000 (laba)', r.shu, 450_000);
    ok('C1: profit = true', r.profit === true);
    const e1 = entryByRef(db, 'coop#closing#2026-07');
    eq('C1: D4010 = 1.0M', lineVal(db, e1!, '4010', 'debit'), 1_000_000);
    eq('C1: D4030 = 200k', lineVal(db, e1!, '4030', 'debit'), 200_000);
    eq('C1: C5030 = 600k', lineVal(db, e1!, '5030', 'credit'), 600_000);
    eq('C1: C5010 = 150k', lineVal(db, e1!, '5010', 'credit'), 150_000);
    eq('C1: K3020 = 450k', lineVal(db, e1!, '3020', 'credit'), 450_000);
    db.close();
  }

  // ===== C2: rugi =====================================================
  {
    const { db, tdb } = fresh();
    await seedPnl(tdb, '2026-05-20', [
      { code: '5010', d: 500_000, c: 0 },
      { code: '5030', d: 200_000, c: 0 },
    ]);
    const r = await postCoopClosingInTx(tdb, { period: '2026-05', glEnabled: true, createdBy: 'gus' });
    eq('C2: shu = -700000 (rugi)', r.shu, -700_000);
    ok('C2: profit = false', r.profit === false);
    const e2 = entryByRef(db, 'coop#closing#2026-05');
    eq('C2: C5010 = 500k', lineVal(db, e2!, '5010', 'credit'), 500_000);
    eq('C2: C5030 = 200k', lineVal(db, e2!, '5030', 'credit'), 200_000);
    eq('C2: D3020 = 700k (3020 boleh negatif)', lineVal(db, e2!, '3020', 'debit'), 700_000);
    db.close();
  }

  // ===== C3: 4040 & 4090 dikecualikan ===============================
  {
    const { db, tdb } = fresh();
    await seedPnl(tdb, '2026-07-01', [
      { code: '4040', d: 0, c: 900_000 },
      { code: '4090', d: 0, c: 100_000 },
      { code: '4010', d: 0, c: 300_000 },
    ]);
    const r = await postCoopClosingInTx(tdb, { period: '2026-07', glEnabled: true, createdBy: 'gus' });
    eq('C3: shu = 300000 (4040/4090 tak dihitung)', r.shu, 300_000);
    const e3 = entryByRef(db, 'coop#closing#2026-07');
    eq('C3: D4010 = 300k', lineVal(db, e3!, '4010', 'debit'), 300_000);
    eq('C3: tanpa legs 4040', lineVal(db, e3!, '4040', 'debit') + lineVal(db, e3!, '4040', 'credit'), 0);
    eq('C3: tanpa legs 4090', lineVal(db, e3!, '4090', 'debit') + lineVal(db, e3!, '4090', 'credit'), 0);
    eq('C3: K3020 = 300k', lineVal(db, e3!, '3020', 'credit'), 300_000);
    db.close();
  }

  // ===== C4: akun net 0 tanpa legs (OQ9) ============================
  {
    const { db, tdb } = fresh();
    await seedPnl(tdb, '2026-08-01', [
      { code: '4010', d: 0, c: 100_000 },
      { code: '4020', d: 0, c: 50_000 },
    ]);
    await seedPnl(tdb, '2026-08-05', [
      { code: '4010', d: 100_000, c: 0 },
      { code: '4020', d: 20_000, c: 0 },
    ]);
    // Net: 4010 = 0 (dihilangkan), 4020 = 30k.
    const r = await postCoopClosingInTx(tdb, { period: '2026-08', glEnabled: true, createdBy: 'gus' });
    eq('C4: shu = 30000', r.shu, 30_000);
    const e4 = entryByRef(db, 'coop#closing#2026-08');
    eq('C4: tanpa legs 4010 (net 0)', lineVal(db, e4!, '4010', 'debit') + lineVal(db, e4!, '4010', 'credit'), 0);
    eq('C4: D4020 = 30k', lineVal(db, e4!, '4020', 'debit'), 30_000);
    eq('C4: K3020 = 30k', lineVal(db, e4!, '3020', 'credit'), 30_000);
    db.close();
  }

  // ===== C5/C6/C7: kumulatif + idempoten + 1 periode = 1 closing =====
  {
    const { db, tdb } = fresh();
    await seedPnl(tdb, '2026-06-15', [
      { code: '4010', d: 0, c: 1_000_000 },
      { code: '5030', d: 400_000, c: 0 },
    ]);
    const cA = await postCoopClosingInTx(tdb, { period: '2026-06', glEnabled: true, createdBy: 'gus' });
    eq('C5: closing A shu = 600000', cA.shu, 600_000);
    await seedPnl(tdb, '2026-07-05', [
      { code: '4010', d: 0, c: 200_000 },
      { code: '5010', d: 100_000, c: 0 },
    ]);
    // C6: spec di-capture SEBELUM post B (setelah B, nets self-heal ke 0
    // dan legs kosong).
    const specB = buildClosingSpec('2026-07', await computeClosingLegs(tdb, '2026-07'), 'gus');
    const cB = await postCoopClosingInTx(tdb, { period: '2026-07', glEnabled: true, createdBy: 'gus' });
    eq('C5: closing B shu = 100000 (hanya aktivitas baru)', cB.shu, 100_000);
    const eB = entryByRef(db, 'coop#closing#2026-07');
    eq('C5: B legs D4010 = 200k', lineVal(db, eB!, '4010', 'debit'), 200_000);
    eq('C5: B legs C5010 = 100k', lineVal(db, eB!, '5010', 'credit'), 100_000);
    eq('C5: B tanpa legs 5030 (net sudah 0)', lineVal(db, eB!, '5030', 'credit'), 0);
    eq('C5: B K3020 = 100k', lineVal(db, eB!, '3020', 'credit'), 100_000);

    // C6: re-post spec B = no-op idempoten.
    const jid = await postJournalInTx(tdb, specB);
    eq('C6: re-post = id sama', jid, cB.entryId);
    eq(
      'C6: entry ref closing 2026-07 tetap 1',
      cnt(db, "SELECT COUNT(*) c FROM journal_entries WHERE ref_table='coop' AND ref_id='coop#closing#2026-07'"),
      1
    );

    // C7: 1 periode = 1 closing (duplikat ditolak).
    let eC7 = '';
    try {
      await postCoopClosingInTx(tdb, { period: '2026-06', glEnabled: true, createdBy: 'gus' });
    } catch (x) {
      eC7 = String(x);
    }
    ok('C7: CLOSING_PERIOD_EXISTS (periode A sudah di-close)', eC7.includes('CLOSING_PERIOD_EXISTS'));
    db.close();
  }

  // ===== C8: GL OFF ====================================================
  {
    const { db, tdb } = fresh();
    await seedPnl(tdb, '2026-09-01', [{ code: '4010', d: 0, c: 400_000 }]);
    const before = cnt(db, 'SELECT COUNT(*) c FROM journal_entries');
    const r = await postCoopClosingInTx(tdb, { period: '2026-09', glEnabled: false, createdBy: 'gus' });
    eq('C8: entryId null (GL off)', r.entryId, null);
    eq('C8: shu tetap dihitung', r.shu, 400_000);
    ok('C8: profit', r.profit === true);
    eq('C8: tanpa jurnal baru', cnt(db, 'SELECT COUNT(*) c FROM journal_entries'), before);
    db.close();
  }

  // ===== C9: entry_date = hari terakhir periode =======================
  {
    eq('C9: 2026-12 -> 2026-12-31', closingEntryDate('2026-12'), '2026-12-31');
    eq('C9: 2024-02 -> 2024-02-29 (leap)', closingEntryDate('2024-02'), '2024-02-29');
    const { db, tdb } = fresh();
    await seedPnl(tdb, '2026-03-01', [{ code: '4030', d: 0, c: 10_000 }]);
    const r = await postCoopClosingInTx(tdb, { period: '2026-03', glEnabled: true, createdBy: 'gus' });
    eq(
      'C9: entry_date journal = 2026-03-31',
      String((db.prepare('SELECT entry_date AS v FROM journal_entries WHERE id = ?').get(r.entryId!) as { v: string }).v),
      '2026-03-31'
    );
    db.close();
  }

  // ===== C10: periode tanpa aktivitas (DeepSeek NOTE 2) ================
  {
    const { db, tdb } = fresh();
    let eC10 = '';
    try {
      await postCoopClosingInTx(tdb, { period: '2026-09', glEnabled: true, createdBy: 'gus' });
    } catch (x) {
      eC10 = String(x);
    }
    ok('C10: CLOSING_NO_ACTIVITY', eC10.includes('CLOSING_NO_ACTIVITY'));
    eq('C10: legs kosong', (await computeClosingLegs(tdb, '2026-09')).legs.length, 0);
    eq('C10: tanpa jurnal', cnt(db, 'SELECT COUNT(*) c FROM journal_entries'), 0);
    db.close();
  }

  console.log('');
  console.log('test:coop5a (W4.5a) - ' + passes + ' ok, ' + failures + ' fail');
  if (failures > 0) process.exit(1);
}

main();
