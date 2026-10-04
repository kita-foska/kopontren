/**
 * F3.4+ W2.2 -- Laporan Posisi Keuangan (Neraca) formal.
 *
 * Modul baca TIDAK punya kode runtime selain SQL + `import type QueryDb`
 * (dihapus saat compile), pola sama dgn lib/gl.ts, lib/keuangan.ts,
 * lib/rekonsiliasi.ts -- supaya bisa diuji Node (type-stripping +
 * SQLite in-memory) lewat scripts/test-laporan.ts.
 *
 * Struktur per docs/akuntansi-proposal.md Sek.5.1 + invariant Sek.3.2.1:
 *   Aset lancar      = 1010+1020+1030+1040+1070+1100+1110
 *   Aset tetap neto  = 1050 - 1060
 *   Investasi syariah = 1080+1090
 *   Wakaf memo       = 1120 + 6020  (TIDAK dijumlahkan ke total)
 *   Kewajiban lancar = 2010+2020+2030+2040+2100
 *   Kewajiban anggota= 2050+2060+2070+2080
 *   Kewajiban ZIS    = 2090
 *   Ekuitas          = 3010+3020+3030+3040+3050+3060+3070
 *
 * Laba/rugi berjalan (belum closing ke 3020) = SUM 4xxx TANPA 4040
 * (owner income, memo spt LKA) - SUM (5xxx + 6030 zakat per Sek.5.2)
 * -> hasilnya == lka.laba_bersih (W3.5+ reconciliation universal).
 *
 * D=K (Sek.5.1, Sek.3.2.1, rekon #15 JOURNAL_BAL): posisi adalah
 * laporan KUMULATIF (s.d. batas `at`), jadi identitias
 * SUM aset = SUM liab + SUM ekuitas hanya balance setelah jurnal
 * penutup (closing, Sek.3.2.6) memindahkan laba/rugi berjalan ke 3020.
 * Untuk memberi angka JOURNAL_BAL (#15) TANPA import rekonsiliasi.ts,
 * modul ini menghitung SUM(debit) & SUM(credit) SELURUH journal_lines
 * s.d. `at`: bila tak seimbang, flag_rekon15=true dan caller (API/UI)
 * MENOLAK render angka formal sebagai otoritatif.
 *
 * Sign saldo akun (konvensi SAK-EP; beda dgn penyederhanaan gl.ts):
 *   2xxx/3xxx/4xxx normal-KREDIT (saldo = credit - debit),
 *   1xxx/5xxx normal-DEBIT      (saldo = debit - credit).
 * Aset tetap neto = 1050 (debit normal) - 1060 (akumulasi, kredit normal).
 */

import type { QueryDb } from '../keuangan.ts';

/** Rincian satu akun (kode + saldo neto) utk panel memo/rincian UI. */
export type PosisiRow = {
  code: string;
  /** Saldo neto dgn sign natural akun (bukan gross debit/kredit). */
  value: number;
};

/** Hasil `buildPosisi` -- dikirim /api/laporan/formal?report=posisi. */
export type PosisiPayload = {
  /** Batas periode (entry_date < as_of); ISO WIB atau 'YYYY-MM-DD'. */
  as_of: string;
  sections: {
    aset_lancar: number;
    aset_tetap_neto: number;
    investasi_syariah: number;
    /** Wakaf memo (1120 + 6020): ditampilkan, TIDAK masuk total_aset. */
    wakaf_memo: PosisiRow[];
    kewajiban_lancar: number;
    kewajiban_anggota: number;
    kewajiban_zis: number;
    /** Rincian ekuitas per akun 3010..3070. */
    ekuitas: PosisiRow[];
  };
  totals: {
    total_aset: number;
    total_kewajiban: number;
    /** SUM 30xx (ekuitas formal, tanpa laba berjalan). */
    total_ekuitas: number;
    /**
     * SUM 4xxx (4040 owner income dikecualikan, spt LKA) - SUM (5xxx +
     * 6030 zakat per Sek.5.2): laba/rugi periode berjalan (belum closing
     * ke 3020). == lka.laba_bersih (residual 5020/5050/5100 bila terisi
     * di GL; 5050 closed tak dihitung LKA).
     */
    laba_rugi_berjalan: number;
    /** total_ekuitas + laba_rugi_berjalan (ekuitas setelah closing). */
    total_ekuitas_menutup: number;
  };
  /**
   * D=K check (proxy rekon #15 JOURNAL_BAL): balanced = SUM(debit) ===
   * SUM(credit) seluruh journal_lines s.d. `at`. Bila false, API/UI
   * menolak render angka formal (lihat flag_rekon15).
   */
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

// Grup akun Sek.5.1 (kode COA, docs/akuntansi-proposal.md Sek.2).
const ASET_LANCAR = ['1010', '1020', '1030', '1040', '1070', '1100', '1110'];
const ASET_TETAP = '1050';
const AKUM_PENYUSUTAN = '1060';
const INVESTASI = ['1080', '1090'];
const WAKAF_MEMO = ['1120', '6020'];
const KEW_LANCAR = ['2010', '2020', '2030', '2040', '2100'];
const KEW_ANGGOTA = ['2050', '2060', '2070', '2080'];
const KEW_ZIS = ['2090'];
const EKUITAS = ['3010', '3020', '3030', '3040', '3050', '3060', '3070'];
// W3.5+ reconciliation dgn LKA: 4040 (ujrah konsinyasi) TIDAK ikut --
// owner income (P4 tashih), memo only spt LKA (MEMO_ROWS lka.ts).
const PENDAPATAN = ['4010', '4020', '4030', '4050', '4060', '4070', '4080', '4090', '4100'];
// 6030 (zakat tijarah) ikut BEBAN: beban per Sek.5.2 (ZIS = 5090+5100+6030,
// spt ZIS_CODES lka.ts), agar posisi.laba_rugi_berjalan == lka.laba_bersih.
const BEBAN = ['5010', '5020', '5030', '5040', '5050', '5060', '5070', '5080', '5090', '5100', '6030'];

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
    m.set(r.account_code, { debit: Math.round(Number(r.d) || 0), credit: Math.round(Number(r.c) || 0) });
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
  return { debit: Math.round(Number(r?.d ?? 0) || 0), credit: Math.round(Number(r?.c ?? 0) || 0) };
}

/** Saldo neto akun dgn sign natural (lihat header modul). */
function naturalBal(code: string, row?: RowDC): number {
  const debit = Math.round(row?.debit ?? 0) || 0;
  const credit = Math.round(row?.credit ?? 0) || 0;
  const creditNormal = code.startsWith('2') || code.startsWith('3') || code.startsWith('4');
  return creditNormal ? credit - debit : debit - credit;
}

function sumOf(codes: string[], m: Map<string, RowDC>): number {
  let s = 0;
  for (const c of codes) s += naturalBal(c, m.get(c));
  return s;
}

function rowsOf(codes: string[], m: Map<string, RowDC>): PosisiRow[] {
  return codes.map((c) => ({ code: c, value: naturalBal(c, m.get(c)) }));
}

/**
 * Bangun Laporan Posisi s.d. `at` (ISO WIB / 'YYYY-MM-DD', entry_date < at).
 * Import-free: hanya `QueryDb`. Nama akun (COA) dipasok caller (route API)
 * bila diperlukan -- modul ini mengembalikan kode + angka saja.
 */
export async function buildPosisi(db: QueryDb, at: string): Promise<PosisiPayload> {
  const m = await perAccount(db, at);
  const dk = await journalTotals(db, at);

  const asetLancar = sumOf(ASET_LANCAR, m);
  // 1060 adalah akun kredit-normal (kontra-aset): akumulasi penyusutan
  // positif = kredit - debit. Aset tetap neto = 1050 (debit normal) - 1060.
  // (naturalBal('1060') salah sign karena '1xxx' dianggap debit-normal.)
  const akumPenyusutan = (() => {
    const r = m.get(AKUM_PENYUSUTAN);
    const d = Math.round(r?.debit ?? 0) || 0;
    const c = Math.round(r?.credit ?? 0) || 0;
    return c - d;
  })();
  const asetTetapNeto = naturalBal(ASET_TETAP, m.get(ASET_TETAP)) - akumPenyusutan;
  const investasi = sumOf(INVESTASI, m);
  const wakafMemo = rowsOf(WAKAF_MEMO, m); // tidak dijumlahkan

  const kewLancar = sumOf(KEW_LANCAR, m);
  const kwAnggota = sumOf(KEW_ANGGOTA, m);
  const kwZis = sumOf(KEW_ZIS, m);

  const ekuitasRows = rowsOf(EKUITAS, m);
  const totalEkuitas = ekuitasRows.reduce((a, r) => a + r.value, 0);

  // Laba/rugi berjalan = SUM pendapatan neto (4xxx, kredit normal; 4040
  // owner income DIKECUALIKAN, spt LKA) - SUM beban neto (5xxx + 6030,
  // debit normal; 6030 zakat dijumlahkan spt ZIS LKA). Hasil == lka.laba_bersih
  // (W3.5+ reconciliation; residual 5020/5050/5100 bila terisi di GL).
  const labaRugiBerjalan = sumOf(PENDAPATAN, m) - sumOf(BEBAN, m);

  const totalAset = asetLancar + asetTetapNeto + investasi;
  const totalKewajiban = kewLancar + kwAnggota + kwZis;

  const totalDebit = dk.debit;
  const totalCredit = dk.credit;
  const gap = totalDebit - totalCredit;
  const balanced = totalDebit === totalCredit;

  return {
    as_of: at,
    sections: {
      aset_lancar: asetLancar,
      aset_tetap_neto: asetTetapNeto,
      investasi_syariah: investasi,
      wakaf_memo: wakafMemo,
      kewajiban_lancar: kewLancar,
      kewajiban_anggota: kwAnggota,
      kewajiban_zis: kwZis,
      ekuitas: ekuitasRows,
    },
    totals: {
      total_aset: totalAset,
      total_kewajiban: totalKewajiban,
      total_ekuitas: totalEkuitas,
      laba_rugi_berjalan: labaRugiBerjalan,
      total_ekuitas_menutup: totalEkuitas + labaRugiBerjalan,
    },
    d_k: {
      total_debit: totalDebit,
      total_credit: totalCredit,
      balanced,
      gap,
    },
    // B4 (audit W2.2): flag_rekon15 ini PROXY D=K GLOBAL -- SUM(debit) =
    // SUM(credit) seluruh journal_lines s.d. `at` (lihat journalTotals),
    // BUKAN cek per-entry + orphan JOURNAL_BAL yang otoritatif (rekon #15
    // di /admin/rekonsiliasi). Karena journalTotals JOIN journal_entries,
    // journal_lines orphan (entry_id tak terdaftar di journal_entries) TIDAK
    // ikut dijumlahkan di sini, dan imbangan per-entry yang saling
    // net-zero global juga lolos. Untuk validasi penuh, arahkan ke
    // /admin/rekonsiliasi (#15 JOURNAL_BAL: per-entry + orphan).
    flag_rekon15: !balanced,
  };
}
