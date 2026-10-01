/**
 * F3.4+ W1.2 -- GL read side (saldo, neraca saldo, buku besar).
 *
 * Modul TIDAK punya kode lain selain SQL + import type: semua query
 * berjalan di caller lewat QueryDb (libsql/SQLite/Turso). Utk diuji
 * dgn Node (type-stripping + SQLite in-memory) lihat scripts/test-gl.ts
 * (Phase 3).
 *
 * Konvensi (docs/akuntansi-proposal.md):
 *  - Semua jumlah rupiah integer penuh.
 *  - Normal akun: 10xx/20xx = normal debit; 30xx/40xx/50xx = normal kredit.
 *    Saldo "normal" = credit - debit utk akun normal-credit, dan
 *    debit - credit utk akun normal-debit; nilai negatif = saldo terbalik.
 *  - `at`/range dalam ISO WIB (konsisten dgn entry_date, Sek.6).
 */

import type { QueryDb } from './keuangan.ts';

/** Hasil `trialBalance`: per akun + total debit/kredit (harus sama: JOURNAL_BAL). */
export type TrialRow = {
  account_code: string;
  debit: number;
  credit: number;
  /** 0 = seimbang utk akun tsb. */
  diff: number;
};

/** Satu baris mutasi utk `accountStatement`. */
export type StatementRow = {
  entry_date: string;
  entry_id: string;
  type: string;
  desc: string;
  debit: number;
  credit: number;
  balance: number;
};

/**
 * Saldo suatu akun SEBELUM `at` (ISO WIB). Kembalikan 0 bila tidak ada.
 * Sign konvensi: akun normal-credit (30xx/40xx/50xx) = credit - debit,
 * selain itu = debit - credit.
 */
export async function accountBalance(
  db: QueryDb,
  code: string,
  at: string
): Promise<number> {
  const r = (await db
    .prepare(
      `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.account_code = ? AND je.entry_date < ?`
    )
    .get(code, at)) as { d: number; c: number };
  const debit = Math.round(Number(r?.d ?? 0) || 0);
  const credit = Math.round(Number(r?.c ?? 0) || 0);
  const normalCredit = code.startsWith('3') || code.startsWith('4') || code.startsWith('5');
  return normalCredit ? credit - debit : debit - credit;
}

/**
 * Neraca saldo per `at` (total debit / total credit per akun, entry_date < at).
 * Total debit === total credit selamanya (rekonsiliasi #15 JOURNAL_BAL)
 * bila semua entry seimbang -- caller bisa assert `totalDiff === 0`.
 */
export async function trialBalance(db: QueryDb, at: string): Promise<TrialRow[]> {
  const rows = (await db
    .prepare(
      `SELECT jl.account_code,
              COALESCE(SUM(jl.debit),0) d,
              COALESCE(SUM(jl.credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?
       GROUP BY jl.account_code
       ORDER BY jl.account_code`
    )
    .all(at)) as { account_code: string; d: number; c: number }[];
  return rows.map((r) => {
    const debit = Math.round(Number(r.d) || 0);
    const credit = Math.round(Number(r.c) || 0);
    return { account_code: r.account_code, debit, credit, diff: debit - credit };
  });
}

/**
 * Buku besar (mutasi) suatu akun utk `from <= entry_date < to` (ISO WIB).
 * `balance` = saldo berjalan (debit - credit) SEBELUM interval tsb,
 * dihitung lewat offset sehingga baris pertama = mutasi + saldo pembuka.
 */
export async function accountStatement(
  db: QueryDb,
  code: string,
  from: string,
  to: string
): Promise<StatementRow[]> {
  const open = (await db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.account_code = ? AND je.entry_date < ?`
    )
    .get(code, from)) as { d: number; c: number };
  const opening = Math.round(Number(open?.d ?? 0) || 0) - Math.round(Number(open?.c ?? 0) || 0);

  const rows = (await db
    .prepare(
      `SELECT je.entry_date, je.id eid, je.type, je.desc,
              jl.debit, jl.credit
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.account_code = ? AND je.entry_date >= ? AND je.entry_date < ?
       ORDER BY je.entry_date, je.id, jl.entry_id, jl.account_code`
    )
    .all(code, from, to)) as {
    entry_date: string;
    eid: string;
    type: string;
    desc: string;
    debit: number;
    credit: number;
  }[];

  let bal = opening;
  const out: StatementRow[] = [];
  for (const r of rows) {
    bal = bal + Math.round(Number(r.debit) || 0) - Math.round(Number(r.credit) || 0);
    out.push({
      entry_date: r.entry_date,
      entry_id: r.eid,
      type: r.type,
      desc: r.desc,
      debit: Math.round(Number(r.debit) || 0),
      credit: Math.round(Number(r.credit) || 0),
      balance: bal,
    });
  }
  return out;
}
