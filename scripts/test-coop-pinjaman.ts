/**
 * W5.1 (PINJ-1) -- test engine pinjaman qardh (src/lib/coop-pinjaman.ts):
 * pinjam (D 1130 <-> K 1010) + bayar lunas SEKALIGUS (D 1010 -> K 1130;
 * denda sadaqah = memo-only, F3.3 #6, OQ8; OQ7: akun 1130, 1030 tak
 * terlibat; OQ9: semua YA). Pola test-coop5b.ts: node:sqlite in-memory +
 * adapter toTxDb + DDL mirror skema v27; engine dipanggil langsung.
 *
 * Jalankan: node scripts/test-coop-pinjaman.ts
 *
 * P1  gl-off pinjam: baris tercatat (aktif, sisa=pokok, qardh, margin 0),
 *     TIDAK ada jurnal.
 * P2  gl-on pinjam: jurnal D 1130 / K 1010 (nominal pokok; D=K).
 * P3  validasi nominal (coopValidateAmount: 0/negatif throw; pecahan dibulat).
 * P4  pinjam ganda diizinkan (OQ9-2: 2 baris aktif per anggota).
 * P5  gl-off bayar: lunas (sisa 0, status 'lunas'), tanpa jurnal.
 * P6  gl-on bayar: jurnal D 1010 / K 1130 (nominal sisa).
 * P7  bayar ganda: PINJAMAN_NOT_ACTIVE (409 di route), jurnal tak berubah.
 * P8  sadaqah memo-only (OQ8/F3.3 #6): memo di kolom catatan; kaki
 *     jurnal HANYA 1010/1130 (tak pernah 5xxx/ZIS/pendapatan).
 * P9  gl-off pinjam & bayar = tanpa jurnal (entryId null).
 * P10 anggota keluar (status 'keluar'): tetap bisa pinjam & lunas di
 *     level engine (OQ9-3: pinjaman tak terblokir; cek membership = route).
 * P11 idempotensi ref: pinjam ulang dengan id sama -> throw (bukan
 *     jurnal duplikat diam-diam).
 * P12 D=K global: total debit = total credit semua jurnal suite ini.
 * P13 JSpec murni: D=K + akun tepat (1130/1010) + ref unik + entry_date
 *     deterministik (buildCoopLoanDisbursementSpec/PaybackSpec).
 *
 * (Validasi route-level R4/R5/R11: member tak ada -> 404, tanggal
 *  invalid -> 400, 409 lunas -- dites manual/deploy; engine tak cek.)
 */
import { DatabaseSync } from 'node:sqlite';
import type { TxDb } from '../src/lib/jurnal.ts';
import { coopValidateAmount } from '../src/lib/coop.ts';
import {
  recordCoopLoanInTx,
  closeCoopLoanInTx,
  buildCoopLoanDisbursementSpec,
  buildCoopLoanPaybackSpec,
  type CoopLoanInput,
  type CoopLoanPayInput,
} from '../src/lib/coop-pinjaman.ts';
import { isBalanced } from '../src/lib/jurnal.ts';

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

// -- DDL mirror src/db.ts (skema v27: journal + coop_members +
//    coop_pinjaman; pola test-coop5b.ts) ----------------------------------
const DDL_JE =
  "CREATE TABLE journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'normal', desc TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reversed_by TEXT, UNIQUE(ref_table, ref_id, type))";
const DDL_JL =
  "CREATE TABLE journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL DEFAULT 0, credit INTEGER NOT NULL DEFAULT 0, balance_running INTEGER, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source))";
const DDL_MEMBERS =
  "CREATE TABLE coop_members(id TEXT PRIMARY KEY, name TEXT NOT NULL, npwp TEXT, member_since TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aktif', rumpun TEXT, UNIQUE(name))";
const DDL_LOANS =
  "CREATE TABLE coop_pinjaman(id TEXT PRIMARY KEY, member_id TEXT NOT NULL, akad TEXT NOT NULL DEFAULT 'qardh', margin INTEGER NOT NULL DEFAULT 0, pokok INTEGER NOT NULL, sisa INTEGER NOT NULL, tanggal_mulai TEXT NOT NULL, tanggal_jatuh_tempo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aktif', catatan TEXT, created_by TEXT, created_at TEXT NOT NULL)";

/** Adapter node:sqlite -> TxDb (pola test-coop5a/5b.ts). */
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

type LoanRow = {
  id: string;
  member_id: string;
  akad: string;
  margin: number;
  pokok: number;
  sisa: number;
  status: string;
  catatan: string | null;
};

function fresh(): { db: DatabaseSync; tdb: TxDb } {
  const db = new DatabaseSync(':memory:');
  db.exec(DDL_JE);
  db.exec(DDL_JL);
  db.exec(DDL_MEMBERS);
  db.exec(DDL_LOANS);
  db.exec(
    "INSERT INTO coop_members (id, name, member_since) VALUES " +
      "('m1', 'Abu', '2026-01-01'), ('m2', 'Bilal', '2026-01-02'), " +
      "('m3', 'Cahaya', '2026-01-03')"
  );
  db.exec("UPDATE coop_members SET status = 'keluar' WHERE id = 'm3'");
  return { db, tdb: toTxDb(db) };
}

/** Baris pinjaman dari tabel (0 bila tak ada). */
function loanRow(db: DatabaseSync, id: string): LoanRow | undefined {
  return db.prepare('SELECT * FROM coop_pinjaman WHERE id = ?').get(id) as
    | LoanRow
    | undefined;
}

/** Sisi (debit|credit) jurnal utk akun. */
function sideOf(db: DatabaseSync, code: string, side: 'debit' | 'credit'): number {
  const r = db
    .prepare(
      "SELECT COALESCE(SUM(" +
        side +
        "), 0) AS v FROM journal_lines WHERE account_code = ?"
    )
    .get(code) as { v: number };
  return Number(r.v) || 0;
}
async function main(): Promise<void> {
  console.log('W5.1 (PINJ-1): test engine pinjaman qardh (P1-P12)');
  const { db, tdb } = fresh();

  // P1: gl-off pinjam -- tercatat, tanpa jurnal ---------------------------
  const r1 = await recordCoopLoanInTx(tdb, {
    id: 'L1',
    memberId: 'm1',
    pokok: 200000,
    tanggalMulai: '2026-10-01',
    tanggalJatuh: '2026-11-01',
    catatan: null,
    createdBy: 'u1',
    gl_enabled: false,
  });
  const l1 = loanRow(db, 'L1');
  eq('P1: entryId null (gl-off)', r1.entryId, null);
  ok('P1: baris aktif, qardh, margin 0, sisa=pokok', l1?.status === 'aktif' && l1.akad === 'qardh' && l1.margin === 0 && l1.sisa === 200000 && l1.pokok === 200000);
  eq('P1: 0 jurnal', Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c), 0);

  // P2: gl-on pinjam -- D 1130 / K 1010 (OQ7: BUKAN 1030) ----------------
  const r2 = await recordCoopLoanInTx(tdb, {
    id: 'L2',
    memberId: 'm2',
    pokok: 300000,
    tanggalMulai: '2026-10-02',
    tanggalJatuh: '2026-12-01',
    catatan: 'qardh dana pesantren',
    createdBy: 'u1',
    gl_enabled: true,
  });
  const p2 = db
    .prepare(
      "SELECT d.debit AS d1130, k.credit AS k1010 FROM journal_lines d JOIN journal_lines k ON k.entry_id = d.entry_id WHERE d.entry_id = ? AND d.account_code = '1130' AND k.account_code = '1010'"
    )
    .all(r2.entryId ?? '') as { d1130: number; k1010: number }[];
  ok('P2: jurnal D 1130 = 300000 / K 1010 = 300000 (1 entry)', p2.length === 1 && p2[0].d1130 === 300000 && p2[0].k1010 === 300000);
  eq('P2: saldo 1030 Piutang Penjualan tak tersentuh', sideOf(db, '1030', 'debit') - sideOf(db, '1030', 'credit'), 0);

  // P3: validasi nominal (pola R3; engine: <= 0 ditolak, pecahan di-bulat)
  let threw = 0;
  for (const v of [0, -500]) {
    try {
      coopValidateAmount(v);
    } catch {
      threw++;
    }
  }
  eq('P3: 0/negatif throw (2)', threw, 2);
  eq('P3: 50000 valid', coopValidateAmount(50000), 50000);
  eq('P3: pecahan di-bulat (100.5 -> 101)', coopValidateAmount(100.5), 101);

  // P4: pinjam ganda diizinkan (OQ9-2) ------------------------------------
  await recordCoopLoanInTx(tdb, {
    id: 'L4',
    memberId: 'm1',
    pokok: 100000,
    tanggalMulai: '2026-10-03',
    tanggalJatuh: '2026-11-15',
    catatan: null,
    createdBy: 'u1',
    gl_enabled: false,
  });
  eq('P4: 2 pinjaman aktif m1', Number((db.prepare("SELECT COUNT(*) c FROM coop_pinjaman WHERE member_id = 'm1' AND status = 'aktif'").get() as { c: number }).c), 2);

  // P5: gl-off bayar -- lunas sekaligus, tanpa jurnal ---------------------
  const n5before = Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c);
  await closeCoopLoanInTx(tdb, {
    id: 'L4',
    memberId: 'm1',
    sisa: 100000,
    catatan: null,
    createdBy: 'u1',
    gl_enabled: false,
  });
  const l4 = loanRow(db, 'L4');
  ok('P5: lunas (sisa 0, status lunas)', l4?.status === 'lunas' && l4.sisa === 0);
  eq('P5: jurnal tak bertambah', Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c), n5before);

  // P6: gl-on bayar -- D 1010 / K 1130 (nominal sisa) ----------------------
  const r6 = await closeCoopLoanInTx(tdb, {
    id: 'L2',
    memberId: 'm2',
    sisa: 300000,
    catatan: null,
    createdBy: 'u1',
    gl_enabled: true,
  });
  const p6 = db
    .prepare(
      "SELECT d.debit AS d1010, k.credit AS k1130 FROM journal_lines d JOIN journal_lines k ON k.entry_id = d.entry_id WHERE d.entry_id = ? AND d.account_code = '1010' AND k.account_code = '1130'"
    )
    .all(r6.entryId ?? '') as { d1010: number; k1130: number }[];
  ok('P6: jurnal D 1010 = 300000 / K 1130 = 300000', p6.length === 1 && p6[0].d1010 === 300000 && p6[0].k1130 === 300000);

  // P7: bayar ganda -> PINJAMAN_NOT_ACTIVE; jurnal tak berubah -------------
  const n7before = Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c);
  let p7threw = false;
  try {
    await closeCoopLoanInTx(tdb, {
      id: 'L2',
      memberId: 'm2',
      sisa: 300000,
      catatan: null,
      createdBy: 'u1',
      gl_enabled: true,
    });
  } catch (e) {
    p7threw = String(e instanceof Error ? e.message : String(e)).includes('PINJAMAN_NOT_ACTIVE');
  }
  ok('P7: bayar ulang melempar PINJAMAN_NOT_ACTIVE', p7threw);
  eq('P7: jurnal tak bertambah', Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c), n7before);

  // P8: sadaqah memo-only (OQ8; F3.3 #6 -- tak pernah pendapatan) ---------
  await recordCoopLoanInTx(tdb, {
    id: 'L8',
    memberId: 'm2',
    pokok: 150000,
    tanggalMulai: '2026-10-05',
    tanggalJatuh: '2026-10-20',
    catatan: null,
    createdBy: 'u1',
    gl_enabled: true,
  });
  const r8 = await closeCoopLoanInTx(tdb, {
    id: 'L8',
    memberId: 'm2',
    sisa: 150000,
    catatan:
      'lunas telat 3 hari | Denda (sadaqah): Rp 2000 -- memo, TIDAK dicatat sebagai pendapatan (F3.3 #6)',
    createdBy: 'u1',
    gl_enabled: true,
  });
  const l8 = loanRow(db, 'L8');
  ok('P8: memo sadaqah di kolom catatan', typeof l8?.catatan === 'string' && l8.catatan!.includes('sadaqah'));
  const p8acc = db
    .prepare('SELECT DISTINCT account_code c FROM journal_lines WHERE entry_id = ? ORDER BY c')
    .all(r8.entryId ?? '') as { c: string }[];
  ok('P8: kaki jurnal bayar HANYA 1010/1130 (tak ada 5xxx/ZIS)', p8acc.length === 2 && p8acc[0].c === '1010' && p8acc[1].c === '1130');

  // P9: gl-off -> engine tak post jurnal (entryId null) ------------------
  const r9p = await recordCoopLoanInTx(tdb, {
    id: 'L9',
    memberId: 'm2',
    pokok: 40000,
    tanggalMulai: '2026-10-07',
    tanggalJatuh: '2026-11-07',
    catatan: null,
    createdBy: 'u1',
    gl_enabled: false,
  });
  ok('P9: gl-off pinjam -> entryId null', r9p.entryId === null);
  const n9before = Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c);
  const r9b = await closeCoopLoanInTx(tdb, {
    id: 'L9',
    memberId: 'm2',
    sisa: 40000,
    catatan: null,
    createdBy: 'u1',
    gl_enabled: false,
  });
  ok('P9: gl-off bayar -> entryId null', r9b.entryId === null);
  eq('P9: jurnal tak bertambah', Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c), n9before);

  // P10: anggota keluar tetap dilayani (OQ9-3; cek membership = route) ----
  await recordCoopLoanInTx(tdb, {
    id: 'L10',
    memberId: 'm3',
    pokok: 75000,
    tanggalMulai: '2026-10-06',
    tanggalJatuh: '2026-11-06',
    catatan: null,
    createdBy: 'u1',
    gl_enabled: false,
  });
  await closeCoopLoanInTx(tdb, {
    id: 'L10',
    memberId: 'm3',
    sisa: 75000,
    catatan: null,
    createdBy: 'u1',
    gl_enabled: false,
  });
  ok('P10: pinjam+lunas anggota status keluar = OK (engine tak blokir)', loanRow(db, 'L10')?.status === 'lunas');

  // P11: idempotensi -- pinjam ulang id sama throw (bukan duplikat diam) ---
  const n11before = Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c);
  let p11threw = false;
  try {
    await recordCoopLoanInTx(tdb, {
      id: 'L1',
      memberId: 'm1',
      pokok: 200000,
      tanggalMulai: '2026-10-01',
      tanggalJatuh: '2026-11-01',
      catatan: null,
      createdBy: 'u1',
      gl_enabled: true,
    });
  } catch {
    p11threw = true;
  }
  ok('P11: pinjam ulang id sama melempar', p11threw);
  eq('P11: jurnal tak bertambah', Number((db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as { c: number }).c), n11before);

  // P13: JSpec murni -- D=K + akun tepat + ref unik + entry_date deterministik
  const sp9: CoopLoanInput = {
    id: 'LX',
    memberId: 'm1',
    pokok: 50000,
    tanggalMulai: '2026-10-01',
    tanggalJatuh: '2026-11-01',
    catatan: null,
    createdBy: 'u1',
    gl_enabled: true,
    createdAt: '2026-10-08T10:00:00.000+07:00',
  };
  const sd = buildCoopLoanDisbursementSpec(sp9, 50000);
  const spb: CoopLoanPayInput = {
    id: 'LX',
    memberId: 'm1',
    sisa: 50000,
    catatan: null,
    createdBy: 'u1',
    gl_enabled: true,
  };
  const sp = buildCoopLoanPaybackSpec(spb, 50000);
  ok('P13: spec pencairan D=K', isBalanced(sd.lines));
  ok('P13: spec pelunasan D=K', isBalanced(sp.lines));
  ok(
    'P13: akun pinjam = D 1130 / K 1010',
    sd.lines.some((l) => l.account_code === '1130' && l.debit === 50000) &&
      sd.lines.some((l) => l.account_code === '1010' && l.credit === 50000)
  );
  ok(
    'P13: akun bayar = D 1010 / K 1130',
    sp.lines.some((l) => l.account_code === '1010' && l.debit === 50000) &&
      sp.lines.some((l) => l.account_code === '1130' && l.credit === 50000)
  );
  ok('P13: ref_id unik pinjam vs pelunasan', sd.ref_id !== sp.ref_id && sd.id !== sp.id);
  ok('P13: entry_date pinjam = createdAt (deterministik)', sd.entry_date === '2026-10-08T10:00:00.000+07:00');

  // P12: D=K global ----------------------------------------------------------
  const tot = db
    .prepare('SELECT COALESCE(SUM(debit), 0) d, COALESCE(SUM(credit), 0) k FROM journal_lines')
    .get() as { d: number; k: number };
  ok('P12: D = K global', Number(tot.d) === Number(tot.k), 'D=' + tot.d + ' K=' + tot.k);

  console.log('\n' + passes + ' lulus / ' + failures + ' gagal');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
