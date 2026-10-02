/**
 * F3.4+ W2.3 -- Laporan Laba-Rugi (P&L) formal.
 *
 * Modul baca TIDAK punya kode runtime selain SQL + `import type QueryDb`
 * (dihapus saat compile), pola sama dgn lib/laporan/posisi.ts -- supaya
 * bisa diuji Node (type-stripping + SQLite in-memory) lewat
 * scripts/test-laporan.ts.
 *
 * Struktur per docs/akuntansi-proposal.md Sek.5.2:
 *   Pendapatan neto   = 4010 - (4020 + 4030)
 *   HPP neto          = 5010 - 5020
 *   Laba Kotor        = Pendapatan neto - HPP
 *   Beban             = 5030 + 5040 + 5060 + 5070 + 5080
 *   Laba Sebelum ZIS  = Laba Kotor - Beban
 *   ZIS               = 5090 + 5100 + 6030
 *   Laba Bersih       = Laba Sebelum ZIS - ZIS
 *   (5050 Denda = TIDAK AKTIF -- F3.3 #6: tidak ada skema denda; akun
 *    dibiarkan CLOSED dan TIDAK dijumlahkan ke Beban.)
 *
 * MEMO (TIDAK digabung ke laba bersih, Sek.5.2):
 *   Ujrah Konsinyasi (4040) -- pendapatan wakalah bil ujrah (P4/A1.1);
 *   Cashback (2030) -- kewajiban member (bukan beban, keputusan A1);
 *   SHU (3020) -- SHU Ditahan, termuat di LPE/CALK (bukan LKA).
 *
 * Sign saldo akun (konvensi SAK-EP, sama dgn posisi.ts):
 *   2xxx/3xxx/4xxx normal-KREDIT (kredit - debit); 1xxx/5xxx/6xxx
 *   normal-DEBIT (debit - kredit). Akun kontra-pendapatan 4020/4030
 *   DIPOSTING DEBIT walau kode 4xxx, jadi dihitung dgn magnitudo debit
 *   (efek = debit - kredit) agar tampil sebagai pengurang yang positif.
 *
 * D=K (rekon #15 JOURNAL_BAL): flag_rekon15=true bila SUM(debit) tak sama
 * SUM(credit) s.d. `at` -- klien menolak render angka formal.
 */

import type { QueryDb } from '../keuangan.ts';

/** Satu baris memo: kode COA + label konseptual + saldo neto. */
export type LkaMemoRow = {
  code: string;
  label: string;
  value: number;
};

/** Hasil `buildLka` -- dikirim /api/laporan/formal?report=lka. */
export type LkaPayload = {
  /** Batas periode (entry_date < as_of); ISO WIB atau 'YYYY-MM-DD'. */
  as_of: string;
  pendapatan: {
    /** 4010 bruto (kredit). */
    bruto: number;
    /** 4020 potongan & diskon (debit, contra). */
    diskon: number;
    /** 4030 retur penjualan (debit, contra). */
    retur_penjualan: number;
    /** 4010 - (4020 + 4030). */
    neto: number;
  };
  hpp: {
    /** 5010 HPP bruto (debit, gross -- TIDAK dikreditkan retur). */
    bruto: number;
    /** 5020 retur COGS (credit, RETUR_HPP contra; magnitudo positif utk tampilan). */
    retur: number;
    /** HPP neto = 5010 - 5020 (additive dBal, cocok dgn posisi.ts). */
    neto: number;
  };
  /** Pendapatan neto - HPP neto. */
  laba_kotor: number;
  /** 5030+5040+5060+5070+5080 (5050 closed; 5020 di HPP; 5090/5100 di ZIS). */
  beban: number;
  /** Laba Kotor - Beban. */
  laba_sebelum_zis: number;
  /** 5090 + 5100 + 6030. */
  zis: number;
  /** Laba Sebelum ZIS - ZIS. Baris MEMO TIDAK dijumlahkan. */
  laba_bersih: number;
  /** Memo (4040 ujrah, 2030 cashback, 3020 SHU): TIDAK dijumlahkan. */
  memo: LkaMemoRow[];
  /** D=K (proxy rekon #15 JOURNAL_BAL, s.d. `at`). */
  d_k: {
    total_debit: number;
    total_credit: number;
    balanced: boolean;
    /** total_debit - total_credit (0 saat seimbang). */
    gap: number;
  };
  /** true bila D=K gagal (flag rekon #15 JOURNAL_BAL). */
  flag_rekon15: boolean;
};

// Kode COA Sek.5.2 (docs/akuntansi-proposal.md Sek.2).
const REV_GROSS = '4010';
const DISKON = '4020';
const RETUR_PENJUALAN = '4030';
const HPP_GROSS = '5010';
const HPP_RETUR = '5020';
// 5050 (denda) TIDAK AKTIF (closed) -> sengaja tidak ada di daftar.
const BEBAN_CODES = ['5030', '5040', '5060', '5070', '5080'];
const ZIS_CODES = ['5090', '5100', '6030'];
// Baris MEMO (efek-kredit: kredit - debit).
const MEMO_ROWS: { code: string; label: string }[] = [
  { code: '4040', label: 'Ujrah Konsinyasi' },
  { code: '2030', label: 'Cashback (kewajiban)' },
  { code: '3020', label: 'SHU Ditahan (ekuitas)' },
];

type RowDC = { debit: number; credit: number };

/** Akumulasi per akun (total debit/kredit, entry_date < at). */
async function perAccount(db: QueryDb, at: string): Promise<Map<string, RowDC>> {
  const rows = (await db
    .prepare(
      `SELECT jl.account_code,
              COALESCE(SUM(jl.debit),0) d,
              COALESCE(SUM(jl.credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?
       GROUP BY jl.account_code`
    )
    .all(at)) as { account_code: string; d: number; c: number }[];
  const m = new Map<string, RowDC>();
  for (const r of rows) {
    m.set(r.account_code, {
      debit: Math.round(Number(r.d) || 0),
      credit: Math.round(Number(r.c) || 0),
    });
  }
  return m;
}

/** SUM global debit/credit seluruh journal_lines s.d. `at` (rekon #15). */
async function journalTotals(db: QueryDb, at: string): Promise<RowDC> {
  const r = (await db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?`
    )
    .get(at)) as { d: number; c: number } | undefined;
  return {
    debit: Math.round(Number(r?.d ?? 0) || 0),
    credit: Math.round(Number(r?.c ?? 0) || 0),
  };
}

/** Magnitudo efek-DEBIT (akun 5xxx/6xxx + kontra 4020/4030): debit - kredit. */
function dBal(code: string, m: Map<string, RowDC>): number {
  const row = m.get(code);
  const d = Math.round(row?.debit ?? 0) || 0;
  const c = Math.round(row?.credit ?? 0) || 0;
  return d - c;
}

/** Magnitudo efek-KREDIT (4010/4040, 2030/3020): kredit - debit. */
function cBal(code: string, m: Map<string, RowDC>): number {
  const row = m.get(code);
  const d = Math.round(row?.debit ?? 0) || 0;
  const c = Math.round(row?.credit ?? 0) || 0;
  return c - d;
}

/**
 * Bangun Laporan Laba-Rugi s.d. `at` (ISO WIB / 'YYYY-MM-DD',
 * entry_date < at). Import-free: hanya `QueryDb`. Nama akun (COA) dipasok
 * caller (route API); modul ini mengembalikan kode + angka saja.
 */
export async function buildLka(db: QueryDb, at: string): Promise<LkaPayload> {
  const m = await perAccount(db, at);
  const dk = await journalTotals(db, at);

  // PENDAPATAN: 4010 bruto (kredit) - (4020 diskon + 4030 retur, debit).
  const revBruto = cBal(REV_GROSS, m);
  const diskon = dBal(DISKON, m);
  const returPenjualan = dBal(RETUR_PENJUALAN, m);
  const pendapatanNeto = revBruto - diskon - returPenjualan;

  // HPP: 5010 bruto (gross, debit) - 5020 retur COGS (credit, RETUR_HPP contra).
  // Live GL (journalForSalesReturn: DR 1040 / CR 5020) mempost 5020 SEBAGAI
  // KREDIT, jadi dBal(5020) = -(returns) pd data live. Netting V2-2 memakai
  // penjumlahan additive dBal (sama dgn posisi.ts BEBAN):
  // hppNeto = dBal(5010) + dBal(5020) = gross - returns.
  const hppBruto = dBal(HPP_GROSS, m); // 5010 gross (positif pd live)
  const hppReturD = dBal(HPP_RETUR, m); // 5020 dBal (negatif pd live: -returns)
  const hppRetur = -hppReturD; // magnitudo positif utk tampilan P&L
  const hppNeto = hppBruto + hppReturD; // additive dBal, cocok dgn posisi.ts

  // LABA KOTOR.
  const labaKotor = pendapatanNeto - hppNeto;

  // BEBAN (5030+5040+5060+5070+5080). 5050 denda TIDAK AKTIF (closed);
  // 5020 sudah di HPP; 5090/5100 sudah di ZIS.
  let beban = 0;
  for (const c of BEBAN_CODES) beban += dBal(c, m);

  const labaSebelumZis = labaKotor - beban;

  // ZIS (5090+5100+6030).
  let zis = 0;
  for (const c of ZIS_CODES) zis += dBal(c, m);

  const labaBersih = labaSebelumZis - zis;

  // MEMO (TIDAK dijumlahkan ke laba_bersih).
  const memo = MEMO_ROWS.map((r) => ({
    code: r.code,
    label: r.label,
    value: cBal(r.code, m),
  }));

  const totalDebit = dk.debit;
  const totalCredit = dk.credit;
  const gap = totalDebit - totalCredit;
  const balanced = totalDebit === totalCredit;

  return {
    as_of: at,
    pendapatan: {
      bruto: revBruto,
      diskon,
      retur_penjualan: returPenjualan,
      neto: pendapatanNeto,
    },
    hpp: { bruto: hppBruto, retur: hppRetur, neto: hppNeto },
    laba_kotor: labaKotor,
    beban,
    laba_sebelum_zis: labaSebelumZis,
    zis,
    laba_bersih: labaBersih,
    memo,
    d_k: {
      total_debit: totalDebit,
      total_credit: totalCredit,
      balanced,
      gap,
    },
    // B4 (audit W2.2): flag_rekon15 ini PROXY D=K GLOBAL -- SUM(debit) =
    // SUM(credit) seluruh journal_lines s.d. `at` (JOIN journal_entries),
    // BUKAN cek per-entry + orphan JOURNAL_BAL yang otoritatif. Validasi
    // penuh (per-entry + orphan) ada di /admin/rekonsiliasi (#15).
    flag_rekon15: !balanced,
  };
}
