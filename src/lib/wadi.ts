/**
 * W9 (skema v32) -- modul wadi'ah santri: titipan dana (wadi'ah) yang
 * dapat ditarik kapan saja (dhana), disimpan di akun terpisah (COA 2100
 * "Wadi'ah Dana Santri"), tanpa imbal hasil (titipan murni).
 *
 * Tashih Gus Fi 22 Okt 2026 (via DeepSeek):
 *  - W9-1a+c: (A) Dhana + terpisah (santri tarik kapan wae, dana
 *    disimpan di akun khusus, bot wonten digunakaken koperasi).
 *  - W9-1b: Bot wonten imbal hasil (wadi'ah = titipan murni).
 *  - W9-1d: COA 2100 + schema v32 (wadi_balances + wadi_ledger).
 *
 * Hermetic: type-only import (Dihapus saat compile oleh Node
 * type-stripping), saged diuji langsung Node dgn SQLite in-memory
 * (pola lib/points.ts + lib/konsinyasi.ts).
 *
 * Jurnal GL (saat gl_enabled='1'):
 *  Setor: D 1010/1020 -> K 2100 (ref_table='wadi')
 *  Tarik: D 2100 -> K 1010/1020
 * Idempoten: UNIQUE(ref_table, ref_id, type).
 */

import type { Db } from '@/db';

/** Satu baris ledger wadi'ah. */
export type WadiEntry = {
  id: number;
  member_id: number;
  type: string; // 'setor' | 'tarik'
  amount: number; // selalu positif
  balance_after: number;
  note: string;
  created_by: number | null;
  created_at: string;
};

/** Label reason ledger wadi'ah (tayangan UI). */
export const WADI_TYPE_LABEL: Record<string, string> = {
  setor: 'Dana Masuk (Setor)',
  tarik: 'Dana Keluar (Tarik)',
};

export function wadiTypeLabel(type: string): string {
  return WADI_TYPE_LABEL[type] || type.toUpperCase();
}

/**
 * Setor wadi'ah: INSERT wadi_ledger (type='setor') + UPSERT
 * wadi_balances (balance += amount).
 * Return: balance_after.
 */
export async function wadiSetor(
  d: Db,
  memberId: number,
  amount: number,
  userId: number | null,
  note: string,
): Promise<number> {
  const amt = Math.floor(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah setor harus lebih dari 0');

  const row = (await d
    .prepare('SELECT balance FROM wadi_balances WHERE member_id = ?')
    .get(memberId)) as { balance: number } | undefined;
  const current = row ? row.balance : 0;
  const newBalance = current + amt;

  await d
    .prepare(
      "INSERT INTO wadi_balances (member_id, balance, created_at, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(member_id) DO UPDATE SET balance = excluded.balance, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    )
    .run(memberId, newBalance);

  await d
    .prepare(
      "INSERT INTO wadi_ledger (member_id, type, amount, balance_after, note, created_by, created_at) VALUES (?, 'setor', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .run(memberId, amt, newBalance, note, userId);

  return newBalance;
}

/**
 * Tarik wadi'ah: VALIDASI balance >= amount, INSERT wadi_ledger
 * (type='tarik') + UPDATE wadi_balances (balance -= amount).
 * Throw jika saldo kurang.
 * Return: balance_after.
 */
export async function wadiTarik(
  d: Db,
  memberId: number,
  amount: number,
  userId: number | null,
  note: string,
): Promise<number> {
  const amt = Math.floor(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah tarik harus lebih dari 0');

  const row = (await d
    .prepare('SELECT balance FROM wadi_balances WHERE member_id = ?')
    .get(memberId)) as { balance: number } | undefined;
  const current = row ? row.balance : 0;
  if (current < amt) {
    throw new Error(
      "Saldo wadi'ah tidak mencukupi: saldo Rp " + current + ', diminta Rp ' + amt,
    );
  }
  const newBalance = current - amt;

  await d
    .prepare(
      "UPDATE wadi_balances SET balance = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE member_id = ?",
    )
    .run(newBalance, memberId);

  await d
    .prepare(
      "INSERT INTO wadi_ledger (member_id, type, amount, balance_after, note, created_by, created_at) VALUES (?, 'tarik', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .run(memberId, amt, newBalance, note, userId);

  return newBalance;
}

/** Ambil riwayat wadi'ah per santri (paginasi). */
export async function wadiRiwayat(
  d: Db,
  memberId: number,
  limit: number,
  offset: number,
): Promise<WadiEntry[]> {
  const rows = (await d
    .prepare(
      'SELECT id, member_id, type, amount, balance_after, note, created_by, created_at FROM wadi_ledger WHERE member_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    )
    .all(memberId, limit, offset)) as unknown as WadiEntry[];
  return rows;
}

/** Ambil saldo wadi'ah per santri. */
export async function wadiSaldo(d: Db, memberId: number): Promise<number> {
  const row = (await d
    .prepare('SELECT balance FROM wadi_balances WHERE member_id = ?')
    .get(memberId)) as { balance: number } | undefined;
  return row ? row.balance : 0;
}

/**
 * Rekon wadi'ah: untuk setiap member, verifikasi
 * SUM(setor) - SUM(tarik) === wadi_balances.balance.
 * Return daftar mismatch (harus kosong jika data konsisten).
 */
export async function wadiRekon(
  d: Db,
): Promise<Array<{ member_id: number; expected: number; actual: number; match: boolean }>> {
  const members = (await d
    .prepare('SELECT member_id, balance FROM wadi_balances')
    .all()) as Array<{ member_id: number; balance: number }>;

  const results: Array<{ member_id: number; expected: number; actual: number; match: boolean }> = [];
  for (const m of members) {
    const agg = (await d
      .prepare(
        "SELECT COALESCE(SUM(CASE WHEN type = 'setor' THEN amount ELSE 0 END), 0) AS s, COALESCE(SUM(CASE WHEN type = 'tarik' THEN amount ELSE 0 END), 0) AS t FROM wadi_ledger WHERE member_id = ?",
      )
      .get(m.member_id)) as unknown as { s: number; t: number };
    const expected = agg.s - agg.t;
    const actual = m.balance;
    results.push({ member_id: m.member_id, expected, actual, match: expected === actual });
  }
  return results;
}