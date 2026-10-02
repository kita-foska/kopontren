/**
 * F3.4+ W2.6 -- CALK (Catatan atas Laporan Keuangan) formal, template
 * docs/akuntansi-proposal.md Sek.5.5 (9 item).
 *
 * Modul baca murni: hanya SQL + `import type QueryDb` (dihapus saat
 * compile), pola sama dgn posisi.ts/lka.ts/lpe.ts/lak.ts -- supaya
 * bisa diuji Node (type-stripping + SQLite in-memory) lewat
 * scripts/test-laporan.ts. TIDAK ada import UI.
 *
 * W2.6 = GL-only (skema v21; tabel zis/akad belum ada):
 * - Item 7 ZIS per jenis aproksimasi dari akun COA:
 *     zakat   disalurkan = 5090 (Zakat Keluar) + 6030 (Zakat Tijarah,
 *             memo syariah);
 *     infak   diterima = 4090 (ZIS Masuk -- lumps infak+sedekah),
 *             disalurkan = 5100 (Infak/Sedekah Keluar);
 *             sedekah TIDAK punya akun COA terpisah -> lumps ke baris
 *             infak; pemisahan per jenis hanya setelah tabel zis (W2.7,
 *             kolom `kind`).
 *     wakaf   diterima = 4100 (Wakaf Masuk); saldo aset wakaf 1120
 *             (aset) + 6020 (memo syariah -- TIDAK masuk total aset,
 *             pola FORMAL_NOTES W2.2).
 * - Item 8 akad berjalan per jenis = saldo akun COA saja
 *   (1070/1080/1090 aset + 2040 liabilitas); rincian saldo per akad
 *   menyusul W3.1 (modul akad).
 * - Item 9 peristiwa pasca-periode = input manual di panel klien
 *   (draft lokal, bukan server) -- TIDAK di payload.
 * - Item 1-3 (info entitas, struktur, kebijakan akuntansi) = teks
 *   statis di panel klien + badge data (flag coop_registered,
 *   item PKGF/wave).
 *
 * Batas periode kumulatif `at` = entry_date < at (pola lka/lpe/lak).
 * D=K (proxy rekon #15 JOURNAL_BAL global) -> flag_rekon15; klien
 * menolak render angka formal bila tak seimbang (pola sama).
 *
 * Label akun COA = seed src/db.ts (lesson W2.4: label COA = seed).
 */

import type { QueryDb } from '../keuangan.ts';

/** Baris umum CALK: kode COA + nama + saldo wajar s.d. `at`. */
export type CalkRow = {
  code: string;
  name: string;
  /** Saldo wajar akun (liab/ekuitas/pendapatan = kredit wajar; aset/beban = debit wajar). */
  value: number;
};

/** ZIS per jenis (aproksimasi GL-only, kumulatif s.d. `at`). */
export type CalkZisJenis = {
  jenis: 'zakat' | 'infak' | 'sedekah' | 'wakaf';
  /** Diterima s.d. `at` (akun pendapatan ZIS wajar-credit). */
  diterima: number;
  /** Disalurkan s.d. `at` (akun beban/memo ZIS wajar-debit). */
  disalurkan: number;
};

/** Aliran ZIS per periode (bulan entry_date; entry pembuka dikecualikan). */
export type CalkZisPeriode = {
  /** Bulan entri jurnal, format 'YYYY-MM'. */
  periode: string;
  /** Net inflow 4090+4100 (sisi kredit) bulan tsb. */
  diterima: number;
  /** Net outflow 5090+5100+6030 (sisi debit) bulan tsb. */
  disalurkan: number;
};

/** Hasil `buildCalk` -- dikirim /api/laporan/formal?report=calk. */
export type CalkPayload = {
  /** Batas periode eksklusif (entry_date < as_of); konsisten lka/lpe/lak. */
  as_of: string;
  /** Item 4: komponen kas -- saldo penutup 1010/1020/1100 (terpisah, rekon #16). */
  kas: CalkRow[];
  /** Item 5: piutang per akun (detail per lawan transaksi menyusul modul). */
  piutang: CalkRow[];
  /** Item 5: hutang per akun (termasuk 2090 ZIS Terkumpul Belum Disalurkan). */
  hutang: CalkRow[];
  /** Item 6: ekuitas (3010-3070). */
  ekuitas: CalkRow[];
  /** Simpanan 2050/2060/2070 = kewajiban anggota, BUKAN ekuitas -- memo (pola LPE W2.4). */
  ekuitas_memo: CalkRow[];
  /** Jumlah saldo wajar 3010-3070 (simpanan TIDAK ikut). */
  ekuitas_total: number;
  /** Item 7: ZIS per jenis (aproksimasi GL-only, Sek.5.5). */
  zis: CalkZisJenis[];
  /** Saldo waqaf: 1120 (aset) + 6020 (memo -- tak masuk total aset). */
  zis_memo: { aset_wakaf_1120: number; memo_6020: number };
  /** Item 7 (periode): aliran ZIS per bulan entry (pembuka dikecualikan). */
  zis_periode: CalkZisPeriode[];
  /** Item 8: akad berjalan per akun COA (rincian per akad menyusul W3.1). */
  akad_berjalan: CalkRow[];
  /** D=K global s.d. `at` (proxy rekon #15 JOURNAL_BAL). */
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

// Akun COA + label seed src/db.ts (baris 638-694).
type Acc = { code: string; name: string };
const KAS: Acc[] = [
  { code: '1010', name: 'Kas Toko' },
  { code: '1020', name: 'Kas Bank' },
  { code: '1100', name: 'Kas ZIS' },
];
const PIUTANG: Acc[] = [
  { code: '1030', name: 'Piutang Penjualan' },
  { code: '1070', name: 'Piutang Murabahah' },
  { code: '1110', name: 'Piutang Zakat' },
];
const HUTANG: Acc[] = [
  { code: '2010', name: 'Hutang Pembelianan' },
  { code: '2020', name: 'Hutang Ujrah Konsinyasi' },
  { code: '2030', name: 'Utang Cashback Member' },
  { code: '2040', name: 'Kewajiban Akad (Ujrah/Tijarah/Mudharabah)' },
  { code: '2090', name: 'ZIS Terkumpul Belum Disalurkan' },
  { code: '2100', name: 'Kewajiban Lain-lain' },
];
const EKUITAS: Acc[] = [
  { code: '3010', name: 'Modal Penyertaan' },
  { code: '3020', name: 'SHU Ditahan' },
  { code: '3030', name: 'SHU Cadangan Umum' },
  { code: '3040', name: 'SHU Cadangan Khusus' },
  { code: '3050', name: 'SHU Jasa Anggota' },
  { code: '3060', name: 'SHU Dibagi' },
  { code: '3070', name: 'Koreksi Saldo' },
];
const SIMPANAN: Acc[] = [
  { code: '2050', name: 'Simpanan Pokok' },
  { code: '2060', name: 'Simpanan Wajib' },
  { code: '2070', name: 'Simpanan Sukarela' },
];
const AKAD: Acc[] = [
  { code: '1070', name: 'Piutang Murabahah' },
  { code: '1080', name: 'Investasi Mudharabah' },
  { code: '1090', name: 'Investasi Musyarakah' },
  { code: '2040', name: 'Kewajiban Akad (Ujrah/Tijarah/Mudharabah)' },
];

/** Pemetaan ZIS per jenis -> akun COA (GL-only, Sek.5.5 item 7). */
const ZIS_JENIS: { jenis: 'zakat' | 'infak' | 'sedekah' | 'wakaf'; masuk: string[]; keluar: string[] }[] = [
  { jenis: 'zakat', masuk: [], keluar: ['5090', '6030'] },
  { jenis: 'infak', masuk: ['4090'], keluar: ['5100'] },
  { jenis: 'sedekah', masuk: [], keluar: [] }, // lumps ke baris infak (tak ada akun terpisah)
  { jenis: 'wakaf', masuk: ['4100'], keluar: [] },
];

/** Saldo wajar per akun: grup 2xxx/3xxx/4xxx wajar-credit; sisanya wajar-debit. */
function natural(d: number, cr: number, code: string): number {
  const g = code[0];
  if (g === '2' || g === '3' || g === '4') return cr - d;
  return d - cr;
}

/** Saldo kumulatif (debit/credit mentah) per akun s.d. `at`. */
async function accountSums(db: QueryDb, at: string): Promise<Map<string, { d: number; cr: number }>> {
  const rows = (await db
    .prepare(
      `SELECT jl.account_code c, COALESCE(SUM(jl.debit), 0) d, COALESCE(SUM(jl.credit), 0) cr
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?
       GROUP BY jl.account_code`
    )
    .all(at)) as { c: string; d: number; cr: number }[];
  return new Map(rows.map((r) => [r.c, { d: r.d, cr: r.cr }]));
}

/** SUM global debit/credit seluruh journal_lines s.d. `at` (proxy rekon #15). */
async function journalTotals(db: QueryDb, at: string): Promise<{ debit: number; credit: number }> {
  const r = (await db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit), 0) d, COALESCE(SUM(jl.credit), 0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?`
    )
    .all(at)) as { d: number; c: number }[];
  return { debit: r[0]?.d ?? 0, credit: r[0]?.c ?? 0 };
}

/** Aliran ZIS per bulan entry (pembuka type='opening' dikecualikan: saldo, bukan arus). */
async function zisPer(db: QueryDb, at: string): Promise<CalkZisPeriode[]> {
  const rows = (await db
    .prepare(
      `SELECT substr(je.entry_date, 1, 7) periode,
              COALESCE(SUM(CASE WHEN jl.account_code IN ('4090','4100') THEN jl.credit - jl.debit ELSE 0 END), 0) m,
              COALESCE(SUM(CASE WHEN jl.account_code IN ('5090','5100','6030') THEN jl.debit - jl.credit ELSE 0 END), 0) k
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ? AND je.type <> 'opening'
       GROUP BY 1
       ORDER BY 1`
    )
    .all(at)) as { periode: string; m: number; k: number }[];
  return rows.map((r) => ({ periode: r.periode, diterima: r.m, disalurkan: r.k }));
}

/**
 * Susun CALK template Sek.5.5 s.d. batas `at` (entry_date < at).
 * Item 1-3 statis (klien); item 4-8 dari GL; item 9 manual (klien).
 */
export async function buildCalk(db: QueryDb, at: string): Promise<CalkPayload> {
  const sums = await accountSums(db, at);
  const bal = (code: string): number => {
    const s = sums.get(code);
    if (!s) return 0;
    return natural(Math.round(s.d), Math.round(s.cr), code);
  };
  const row = (a: Acc): CalkRow => ({ code: a.code, name: a.name, value: bal(a.code) });

  const kas = KAS.map(row);
  const piutang = PIUTANG.map(row);
  const hutang = HUTANG.map(row);
  const ekuitas = EKUITAS.map(row);
  const ekuitas_memo = SIMPANAN.map(row);
  const ekuitas_total = EKUITAS.reduce((t, a) => t + bal(a.code), 0);

  // Item 7: ZIS per jenis (aproksimasi GL-only) + memo waqaf.
  const zis = ZIS_JENIS.map((z) => ({
    jenis: z.jenis,
    diterima: z.masuk.reduce((t, c) => t + bal(c), 0),
    disalurkan: z.keluar.reduce((t, c) => t + bal(c), 0),
  }));
  const zis_memo = { aset_wakaf_1120: bal('1120'), memo_6020: bal('6020') };
  const zis_periode = await zisPer(db, at);

  // Item 8: akad berjalan per akun (rincian per akad menyusul W3.1).
  const akad_berjalan = AKAD.map(row);

  // D=K global (proxy rekon #15).
  const dk = await journalTotals(db, at);
  const totalDebit = Math.round(dk.debit);
  const totalCredit = Math.round(dk.credit);
  const balanced = totalDebit === totalCredit;

  return {
    as_of: at,
    kas,
    piutang,
    hutang,
    ekuitas,
    ekuitas_memo,
    ekuitas_total,
    zis,
    zis_memo,
    zis_periode,
    akad_berjalan,
    d_k: {
      total_debit: totalDebit,
      total_credit: totalCredit,
      balanced,
      gap: totalDebit - totalCredit,
    },
    // PROXY D=K GLOBAL (SUM debit = SUM credit s.d. `at`), bukan cek
    // per-entry + orphan rekon #15 yang otoritatif -- validasi penuh
    // di /admin/rekonsiliasi (pola B4 audit W2.2, baris lak.ts).
    flag_rekon15: !balanced,
  };
}

