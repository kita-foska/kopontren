/**
 * Ledger poin & reward member (tabel point_history) — modul INTENSI
 * BEBAS-IMPORT runtime (hanya import type, dihapus saat compile) supaya
 * bisa diuji langsung oleh Node (type-stripping) lewat node:sqlite
 * in-memory — lihat scripts/test-points.ts. Pola sama dgn neraca.ts
 * (pola harness scripts/test-neraca.ts).
 *
 * ── Semantik ledger (dipakai POST /api/sales & DELETE /api/sales/[id]) ──
 *  Kolom `delta` BERUNIT CAMPUR:
 *   - Poin (members.points):      earn (+), redeem (−), void (−), refund (+)
 *   - Rupiah (members.cashback_balance / "Saldo Reward"):
 *     cashback (+), cashback_use (−), refund_cash (+)
 *  Kolom `amount` = nilai rujukan rupiah transaksi terkait (bukan saldo).
 */

import type { QueryDb } from './keuangan.ts';

/** Satu baris ledger poin/reward member. */
export type PointEntry = {
  id: number;
  /** Delta: POIN (reason poin) atau RUPIAH (reason cashback) — lihat isPointUnit. */
  delta: number;
  /** earn | redeem | void | refund | cashback | cashback_use | refund_cash */
  reason: string;
  /** Nilai rujukan rupiah transaksi terkait. */
  amount: number;
  /** ID transaksi sumber (boleh null, mis. koreksi manual). */
  sale_id: number | null;
  created_at: string;
};

/** Label reason ledger (tayangan UI) — SATU sumber (pola PAY_METHOD_LABEL).
 * Key = reason di DB; fallback key tak dikenal: uppercase (tak pernah kosong).
 * Istilah "Reward" konsisten dgn penamaan UI "Saldo Reward" (P1 f4479b3). */
export const POINT_REASON_LABEL: Record<string, string> = {
  earn: 'Poin Masuk',
  redeem: 'Tukar Poin',
  void: 'Poin Dibatalkan',
  refund: 'Tukar Dikembalikan',
  cashback: 'Reward Masuk',
  cashback_use: 'Reward Terpakai',
  refund_cash: 'Reward Dikembalikan',
};

export function pointReasonLabel(reason: string): string {
  return POINT_REASON_LABEL[reason] || reason.toUpperCase();
}

/**
 * Apakah kolom `delta` untuk reason ini berunit POIN (bukan rupiah).
 * Reason tak dikenal dianggap poin (unit mayoritas ledger).
 */
export function isPointUnit(reason: string): boolean {
  return (
    reason === 'earn' ||
    reason === 'redeem' ||
    reason === 'void' ||
    reason === 'refund'
  );
}

/**
 * Ledger poin/reward satu member — TERBARU TERLEBIH, paginasi LIMIT/OFFSET
 * (target Rows Read Turso: daftar selalu berbatas; WHERE member_id memakai
 * index idx_point_history_member). `ORDER BY created_at DESC, id DESC`:
 * baris satu transaksi (4 reason dalam ms sama) tetap urut kronologis
 * lewat tie-breaker id.
 */
export async function queryPointHistory(
  d: QueryDb,
  memberId: number,
  limit: number,
  offset: number
): Promise<PointEntry[]> {
  const rows = (await d
    .prepare(
      `SELECT id, delta, reason, amount, sale_id, created_at
       FROM point_history
       WHERE member_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(memberId, limit, offset)) as PointEntry[];
  // sale_id boleh NULL di DB (koreksi tanpa transaksi) — normalisasi
  // jadi null eksplisit agar UI tak perlu cek `undefined`.
  return rows.map((r) => ({ ...r, sale_id: r.sale_id == null ? null : Number(r.sale_id) }));
}

/** Jumlah baris ledger satu member (untuk "Muat lebih banyak"). */
export async function countPointHistory(d: QueryDb, memberId: number): Promise<number> {
  const row = (await d
    .prepare('SELECT COUNT(*) c FROM point_history WHERE member_id = ?')
    .get(memberId)) as { c: number };
  return Number(row.c) || 0;
}