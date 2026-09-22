// ── Pembayaran campur / split (fitur 3) ───────────────────────────────────
// sales.pay_split menyimpan JSON array [{m, a}] dengan m ∈ {cash, tf, wa}
// dan Σ a === total (split PENUH saja — tanpa piutang). Baris legacy
// (pay_split NULL/'') memakai kolom pay_method sebagai rujukan.
// Modul ini murni (type-only import Db) sehingga aman diimpor komponen klien.

import type { Db } from '@/db';

export type PayPart = { m: string; a: number };

/** Parse sales.pay_split (string JSON) — [] bila legacy / kosong / rusak. */
export function parsePaySplit(v: unknown): PayPart[] {
  if (!v || typeof v !== 'string' || !v.trim()) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(v);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: PayPart[] = [];
  for (const x of arr) {
    const o = x as { m?: unknown; a?: unknown };
    const m = String(o?.m ?? '');
    if (m !== 'cash' && m !== 'tf' && m !== 'wa') continue;
    const a = Math.floor(Number(o?.a) || 0);
    if (a > 0) out.push({ m, a });
  }
  return out;
}

/**
 * Agregat nominal penjualan per metode pembayaran. Baris mixed
 * (sales.pay_split) diperluas per bagian via json_each; baris legacy
 * memakai kolom pay_method. `where` ditulis TANPA alias tabel (dipakai
 * 2×: `FROM sales` dan `FROM sales s, json_each(s.pay_split) j`), args
 * diulang dua kali sesuai jumlah placeholder.
 */
export async function salesByMethod(
  d: Db,
  where: string,
  args: (string | number)[] = []
): Promise<Record<string, number>> {
  const q = `
    SELECT m, COALESCE(SUM(a), 0) t FROM (
      SELECT pay_method m, total a FROM sales
        WHERE ${where} AND (pay_split IS NULL OR pay_split = '')
      UNION ALL
      SELECT CAST(json_extract(j.value, '$.m') AS TEXT) m,
             CAST(json_extract(j.value, '$.a') AS INTEGER) a
        FROM sales s, json_each(s.pay_split) j
        WHERE ${where} AND s.pay_split IS NOT NULL AND s.pay_split != ''
          AND json_valid(s.pay_split)
          AND CAST(json_extract(j.value, '$.m') AS TEXT) IN ('cash', 'tf', 'wa')
    ) GROUP BY m`;
  const rows = (await d.prepare(q).all(...args, ...args)) as { m: string; t: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) if (r.m) out[r.m] = Number(r.t) || 0;
  return out;
}

/**
 * Bagian TUNAI saja (setoran kas shif) — baris mixed dihitung sesuai
 * bagian cash-nya (bukan total seluruh transaksi).
 */
export async function salesCashPortion(
  d: Db,
  where: string,
  args: (string | number)[] = []
): Promise<number> {
  const q = `
    SELECT COALESCE(SUM(a), 0) c FROM (
      SELECT total a FROM sales
        WHERE ${where} AND pay_method = 'cash' AND (pay_split IS NULL OR pay_split = '')
      UNION ALL
      SELECT CAST(json_extract(j.value, '$.a') AS INTEGER) a
        FROM sales s, json_each(s.pay_split) j
        WHERE ${where}
          AND s.pay_split IS NOT NULL AND s.pay_split != ''
          AND json_valid(s.pay_split)
          AND CAST(json_extract(j.value, '$.m') AS TEXT) = 'cash'
    )`;
  const row = (await d.prepare(q).get(...args, ...args)) as { c: number };
  return Number(row.c) || 0;
}