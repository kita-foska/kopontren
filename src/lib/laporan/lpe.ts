// W2.4 -- Laporan Perubahan Ekuitas (LPE) koperasi pondok, dokumen Sek.5.3.
//
// Modul baca TIDAK punya kode runtime selain SQL + `import type QueryDb`
// (dihapus saat compile), pola sama dgn lib/laporan/posisi.ts & lka.ts --
// supaya bisa diuji Node (type-stripping + SQLite in-memory) lewat
// scripts/test-laporan.ts.
//
// Struktur per docs/akuntansi-proposal.md Sek.5.3 (kolom = 7 akun ekuitas
// 30xx, Sek.4.2):
//   Saldo awal (pembuka)  = type='opening'   (Sek.3.2.6, saldo ekuitas awal)
//   (+) SHU (closing)     = type='closing'   (SHU -> 3020, Sek.3.2.6)
//   (+/-) Alokasi SHU     = type='normal' + ref_table='coop' (Sek.4.3/Sek.7.2;
//                            distribusi juga memengaruhi 3050+3060, Sek.13.4)
//   (-) Distribusi        = placeholder 0 (belum ada modul; W2.6)
//   Saldo akhir (penutup) = pembuka + shu + alokasi - distribusi
//
// NAMA kolom (3010-3070) DIKANDUNG MODUL (LPE_COLUMNS) -- bukan dari COA,
// karena 3020-3070 status='pending' di COA (tidak masuk filter `coa`
// status='open' di route). Sek.4.2 kolom 1/2 tetap tersedia via COA.
//
// Simpanan 2050-2070 = KEWAJIBAN anggota (Sek.4.2), BUKAN ekuitas -- dipapar
// sebagai memo kaki, TIDAK dijumlahkan ke total ekuitas.
//
// Sign saldo akun (konvensi SAK-EP, sama dgn posisi.ts): 2xxx/3xxx
// normal-KREDIT (saldo = kredit - debit). Alokasi SHU memindah dari 3020
// (debit -> turun, cBal negatif) ke 3030/3040/3050/3060 (kredit -> naik).
//
// D=K (rekon #15 JOURNAL_BAL, proxy): flag_rekon15=true bila SUM(debit) tak
// sama SUM(credit) s.d. `at` -- klien menolak render angka formal.
//
// `at` = batas eksklusif akhir hari as_of (entry_date < at), dari route
// (nextDay). Modul ini murni: hanya QueryDb + angka.
import type { QueryDb } from '../keuangan.ts';

type RowDC = { debit: number; credit: number };

/** Satu kolom ekuitas 30xx + mutasinya (pembuka..penutup). */
export interface LpeColumn {
  code: string;
  name: string;
  /** false = placeholder (mis. distribusi belum terimplementasi, W2.6). */
  open: boolean;
  pembuka: number;
  shu: number;
  alokasi: number;
  distribusi: number;
  penutup: number;
}

/** Memo kaki: simpanan 2050-2070 (kewajiban, bukan ekuitas). */
export interface LpeMemos {
  simpanan: { code: string; label: string; value: number }[];
  simpanan_total: number;
}

/** Hasil `buildLpe` -- dikirim /api/laporan/formal?report=lpe. */
export interface LpePayload {
  /** Batas periode (entry_date < as_of); ISO WIB atau 'YYYY-MM-DD'. */
  as_of: string;
  columns: LpeColumn[];
  totals: {
    pembuka: number;
    shu: number;
    alokasi: number;
    distribusi: number;
    penutup: number;
  };
  /** Saldo penuh 30xx (kredit-debit) -- utk audit; = totals.penutup bila
   *  tanpa koreksi modal di luar alur SHU (Sek.5.3). */
  full_balance_ekuitas: number;
  memos: LpeMemos;
  /** D=K (proxy rekon #15 JOURNAL_BAL, s.d. `at`). */
  d_k: { total_debit: number; total_credit: number; balanced: boolean; gap: number };
  /** true bila D=K gagal (flag rekon #15 JOURNAL_BAL). */
  flag_rekon15: boolean;
}

// Struktur kolom LPE (nama bawa modul, Sek.4.2 -- 3020-3070 pending COA).
export const LPE_COLUMNS: { code: string; name: string; open: boolean }[] = [
  { code: '3010', name: 'Modal Anggota', open: true },
  { code: '3020', name: 'SHU Ditahan', open: true },
  { code: '3030', name: 'Cadangan Umum', open: true },
  { code: '3040', name: 'Cadangan Khusus', open: true },
  { code: '3050', name: 'Jasa Anggota', open: true },
  { code: '3060', name: 'SHU Dibagi', open: true },
  { code: '3070', name: 'Koreksi Periode', open: true },
];

const EKUITAS = ['3010', '3020', '3030', '3040', '3050', '3060', '3070'];
const SIMPANAN: { code: string; label: string }[] = [
  { code: '2050', label: 'Simpanan Pokok' },
  { code: '2060', label: 'Simpanan Wajib' },
  { code: '2070', label: 'Simpanan Sukarela' },
];

// cBal -- saldo natural akun kreditor (30xx & 20xx): kredit - debit.
function cBal(r?: RowDC): number {
  const d = Math.round(r?.debit ?? 0) || 0;
  const c = Math.round(r?.credit ?? 0) || 0;
  return c - d;
}

type Bucket = Map<string, RowDC>; // key: `${code}|${type}|${ref}`

/** Akumulasi per (akun, type, ref_table) s.d. `at` (entry_date < at). */
async function perBucket(db: QueryDb, at: string): Promise<Bucket> {
  const rows = (await db
    .prepare(
      `SELECT jl.account_code,
              COALESCE(je.type,'all') ty,
              COALESCE(je.ref_table,'all') rf,
              COALESCE(SUM(jl.debit),0) d,
              COALESCE(SUM(jl.credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?
       GROUP BY jl.account_code, COALESCE(je.type,'all'), COALESCE(je.ref_table,'all')`
    )
    .all(at)) as { account_code: string; ty: string; rf: string; d: number; c: number }[];
  const m: Bucket = new Map();
  for (const r of rows) {
    m.set(`${r.account_code}|${r.ty}|${r.rf}`, {
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

/** Total per (code, type) -- semua ref_table dijumlahkan. */
function byType(m: Bucket, code: string, type: string): RowDC {
  const prefix = `${code}|${type}|`;
  let d = 0;
  let c = 0;
  for (const [key, row] of m) {
    if (key.startsWith(prefix)) {
      d += row.debit;
      c += row.credit;
    }
  }
  return { debit: d, credit: c };
}

/** Total persis (code, type, ref) -- utk bucket alokasi (coop). */
function triple(m: Bucket, code: string, type: string, ref: string): RowDC {
  return m.get(`${code}|${type}|${ref}`) ?? { debit: 0, credit: 0 };
}

/** Saldo penuh per code -- semua type & ref dijumlahkan. */
function byCode(m: Bucket, code: string): RowDC {
  const prefix = code + '|';
  let d = 0;
  let c = 0;
  for (const [key, row] of m) {
    if (key.startsWith(prefix)) {
      d += row.debit;
      c += row.credit;
    }
  }
  return { debit: d, credit: c };
}

export async function buildLpe(db: QueryDb, at: string): Promise<LpePayload> {
  const b = await perBucket(db, at);
  const dk = await journalTotals(db, at);

  // Kolom ekuitas 30xx: pembuka (opening) + SHU (closing) + alokasi (coop)
  // - distribusi (placeholder 0) = penutup.
  const columns: LpeColumn[] = LPE_COLUMNS.map((col) => {
    const pembuka = cBal(byType(b, col.code, 'opening'));
    const shu = cBal(byType(b, col.code, 'closing'));
    const alokasi = cBal(triple(b, col.code, 'normal', 'coop'));
    const distribusi = 0; // placeholder W2.6 (alokasi coop sudah memuat distribusi)
    const penutup = pembuka + shu + alokasi - distribusi;
    return {
      code: col.code,
      name: col.name,
      open: col.open,
      pembuka,
      shu,
      alokasi,
      distribusi,
      penutup,
    };
  });

  // Memo simpanan (kewajiban, bukan ekuitas -- dipapar di kaki).
  const simpanan = SIMPANAN.map((s) => ({
    code: s.code,
    label: s.label,
    value: cBal(byCode(b, s.code)),
  }));
  const simpananTotal = simpanan.reduce((acc, x) => acc + x.value, 0);

  // Total per kolom.
  const totals = { pembuka: 0, shu: 0, alokasi: 0, distribusi: 0, penutup: 0 };
  for (const c of columns) {
    totals.pembuka += c.pembuka;
    totals.shu += c.shu;
    totals.alokasi += c.alokasi;
    totals.distribusi += c.distribusi;
    totals.penutup += c.penutup;
  }

  // Saldo penuh 30xx (kredit-debit) -- utk audit.
  let fullEq = 0;
  for (const c of EKUITAS) fullEq += cBal(byCode(b, c));

  const gap = dk.debit - dk.credit;
  const balanced = dk.debit === dk.credit;

  return {
    as_of: at,
    columns,
    totals,
    full_balance_ekuitas: fullEq,
    memos: { simpanan, simpanan_total: simpananTotal },
    d_k: { total_debit: dk.debit, total_credit: dk.credit, balanced, gap },
    flag_rekon15: !balanced,
  };
}


