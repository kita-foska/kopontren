/**
 * W8 Item 5 -- RAT (Rapat Anggota Tahunan) -- Laporan Keuangan Tahunan.
 *
 * Modul baca murni: hanya SQL + `import type QueryDb` + reuse buildPosisi
 * (modul hermetis lain) -- bisa diuji Node (type-stripping + SQLite
 * in-memory) lewat scripts/test-rat.ts. TIDAK ada import UI.
 *
 * Posisi (ruling W8 Item 5, Opsi B -- PAPARAN ONLY):
 * - Laporan tahunan dukung RAT koperasi (governance: keputusan SHU/koperasi
 *   ada forumnya -- Pengurus & RAT; AI hanya membantu).
 * - TIDAK ada perhitungan fiqih baru: formula identik dgn modul W2.x
 *   (LKA SAK-EP Sek.5.2, LPE Sek.5.3, LAK Sek.5.4, Posisi Sek.5.1,
 *   akun GL sudah approved) -- hanya batasan PERIODE yang berbeda
 *   (kumulatif s.d. as_of -> jendela tahunan from-to).
 * - TIDAK ada distribusi baru: panel SHU = paparan coop_shu (input admin,
 *   W4.4 OQ1=A "hitung = input, distribusi = jurnal"); panel ZIS =
 *   paparan posting akun 4090/4100/5090/5100/6030. Distribusi anyar
 *   = fitur lain, perlu tashih dulu.
 *
 * Semantik periode (jendela tahunan):
 *   from = 'YYYY-01-01', to = '(YYYY+1)-01-01' (eksklusif).
 *   - LKA / LAK arus / SHU / ZIS : entry_date dlm [from, to).
 *   - Posisi : KUMULATIF s.d. `to` (reuse buildPosisi -- neraca = saldo).
 *   - LPE pembuka : saldo 30xx KUMULATIF s.d. `from`; mutasi = entri
 *     closing/alokasi PERIODE.
 *   - D=K (proxy rekon #15 JOURNAL_BAL) : KUMULATIF s.d. `to` (pola
 *     modul lain; flag_rekon15=true -> klien tolak angka formal).
 */

import type { QueryDb } from '../keuangan.ts';
import { buildPosisi, type PosisiPayload } from './posisi.ts';

// -- Konstanta COA (mirror lka.ts / lak.ts / lpe.ts -- label = seed). --

/** Kode COA Sek.5.2 (sama persis lka.ts). */
const REV_GROSS = '4010';
const DISKON = '4020';
const RETUR_PENJUALAN = '4030';
const HPP_GROSS = '5010';
const HPP_RETUR = '5020';
// 5050 (denda) TIDAK AKTIF (closed) -> sengaja tidak ada di daftar.
const BEBAN_CODES = ['5030', '5040', '5060', '5070', '5080'];
const ZIS_CODES = ['5090', '5100', '6030'];
const MEMO_ROWS: { code: string; label: string }[] = [
  { code: '4040', label: 'Ujrah Konsinyasi' },
  { code: '2030', label: 'Cashback (kewajiban)' },
  { code: '3020', label: 'SHU Ditahan (ekuitas)' },
];
// PENDAPATAN LAIN KOPERASI (SUMMED; 4040 tetap MEMO, P4 tashih).
const OTHER_INCOME_ROWS: { code: string; label: string }[] = [
  { code: '4050', label: 'Ijarah' },
  { code: '4060', label: 'Laba Murabahah' },
  { code: '4070', label: 'Bagi Hasil Mudharabah' },
  { code: '4080', label: 'Bagi Hasil Musyarakah' },
  { code: '4090', label: 'ZIS Masuk' },
  { code: '4100', label: 'Wakaf Masuk' },
];

const LPE_COLUMNS: { code: string; name: string }[] = [
  { code: '3010', name: 'Modal Anggota' },
  { code: '3020', name: 'SHU Ditahan' },
  { code: '3030', name: 'Cadangan Umum' },
  { code: '3040', name: 'Cadangan Khusus' },
  { code: '3050', name: 'Jasa Anggota' },
  { code: '3060', name: 'SHU Dibagi' },
  { code: '3070', name: 'Koreksi Periode' },
];
const EKUITAS = LPE_COLUMNS.map((c) => c.code);
const SIMPANAN: { code: string; label: string }[] = [
  { code: '2050', label: 'Simpanan Pokok' },
  { code: '2060', label: 'Simpanan Wajib' },
  { code: '2070', label: 'Simpanan Sukarela' },
];

// Akun kas + klasifikasi aktivitas (mirror lak.ts, Sek.5.4).
const KAS_USAHA: { code: string; name: string }[] = [
  { code: '1010', name: 'Kas Toko' },
  { code: '1020', name: 'Kas Bank' },
];
const KAS_SOSIAL_ACCT = '1100';
const KAS_SOSIAL_NAME = 'Kas ZIS';
const CASH_CODES = new Set<string>([...KAS_USAHA.map((k) => k.code), KAS_SOSIAL_ACCT]);
/** Akun lawan = INVESTASI: aset tetap 1050, akad 1070-1090. */
const INVESTASI = new Set(['1050', '1070', '1080', '1090']);
/** Akun lawan = PENDANAAN: modal 3010, distribusi SHU 3060, simpanan 2050-2070. */
const PENDANAAN = new Set(['3010', '3060', '2050', '2060', '2070']);
// Panel ZIS (paparan posting GL approved; konsisten calk.ts item 7:
// diterima = sisi kredit efek, disalurkan = sisi debit efek).
const ZIS_PANEL_ROWS: { code: string; label: string; sisi: 'diterima' | 'disalurkan' }[] = [
  { code: '4090', label: 'ZIS Masuk (infak/sedekah)', sisi: 'diterima' },
  { code: '4100', label: 'Wakaf Masuk', sisi: 'diterima' },
  { code: '5090', label: 'Zakat Keluar', sisi: 'disalurkan' },
  { code: '5100', label: 'Infak Keluar (distribusi)', sisi: 'disalurkan' },
  { code: '6030', label: 'ZIS (beban zakat)', sisi: 'disalurkan' },
];

/** Satu baris coop_shu per periode (input admin, W4.4). */
export type RatShuRow = {
  period: string;
  shu_total: number;
  cadangan_umum: number;
  cadangan_khusus: number;
  jasa_anggota: number;
  dibagi: number;
  /** Rasio persen (rasio_json W4.4; 0 bila tak tersimpan/rusak). */
  rasio: { cad_umum: number; cad_khusus: number; jasa: number; dibagi: number };
};

/** Agregasi SHU per tahun (paparan coop_shu -- bukan distribusi anyar). */
export type RatShu = {
  /** Jumlah periode tercatat utk tahun tsb. */
  counts: number;
  total_shu: number;
  totals: {
    cadangan_umum: number;
    cadangan_khusus: number;
    jasa_anggota: number;
    dibagi: number;
  };
  rows: RatShuRow[];
};

/** ZIS per tahun (paparan posting GL akun approved). */
export type RatZis = {
  /** 4090 + 4100 (sisi kredit) periode. */
  diterima: number;
  /** 5090 + 5100 + 6030 (sisi debit) periode. */
  disalurkan: number;
  rows: { code: string; label: string; value: number; sisi: 'diterima' | 'disalurkan' }[];
};

/** Hasil `buildRat` -- dikirim /api/laporan/formal?report=rat&tahun=YYYY. */
export type RatPayload = {
  tahun: string;
  /** 'YYYY-01-01'. */
  period_from: string;
  /** Batas eksklusif '(YYYY+1)-01-01'. */
  period_to: string;
  lka: RatLka;
  lpe: RatLpe;
  /** Neraca KUMULATIF s.d. akhir tahun (reuse buildPosisi; as_of = period_to). */
  posisi: PosisiPayload;
  lak: RatLak;
  shu: RatShu;
  zis: RatZis;
  /** D=K kumulatif s.d. akhir tahun (proxy rekon #15, pola modul lain). */
  d_k: { total_debit: number; total_credit: number; balanced: boolean; gap: number };
  /** true bila D=K gagal -- klien TOLAK angka formal. */
  flag_rekon15: boolean;
};

// -- Query helper (pola perAccount/perBucket/perEntry modul W2.x). --

type RowDC = { debit: number; credit: number };

/** Rasio persen (rasio_json W4.4; guard rusak/tak ada -> 0). */
function parseRasio(json: unknown): { cad_umum: number; cad_khusus: number; jasa: number; dibagi: number } {
  const out = { cad_umum: 0, cad_khusus: 0, jasa: 0, dibagi: 0 };
  if (typeof json === 'string' && json.trim()) {
    try {
      const r = JSON.parse(json) as Record<string, unknown>;
      for (const k of ['cad_umum', 'cad_khusus', 'jasa', 'dibagi'] as const) {
        const n = Number(r[k]);
        out[k] = Number.isFinite(n) ? n : 0;
      }
    } catch {
      // rasio_json rusak -> tetap 0 (paparan; angka nominal dari kolom).
    }
  }
  return out;
}

/** Saldo per akun (d-c) PERIODE [from, to) -- basis LKA/ZIS (formula lka.ts). */
async function perAccountPeriod(db: QueryDb, from: string, to: string): Promise<Map<string, RowDC>> {
  const rows = (await db
    .prepare(
      `SELECT jl.account_code,
              COALESCE(SUM(jl.debit),0) d,
              COALESCE(SUM(jl.credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date >= ? AND je.entry_date < ?
       GROUP BY jl.account_code`
    )
    .all(from, to)) as { account_code: string; d: number; c: number }[];
  const m = new Map<string, RowDC>();
  for (const r of rows) m.set(r.account_code, { debit: Math.round(Number(r.d) || 0), credit: Math.round(Number(r.c) || 0) });
  return m;
}

/** Saldo per akun KUMULATIF s.d. `at` (pembuka LPE/LAK; saldo penuh audit). */
async function perCodeBefore(db: QueryDb, at: string): Promise<Map<string, RowDC>> {
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
  for (const r of rows) m.set(r.account_code, { debit: Math.round(Number(r.d) || 0), credit: Math.round(Number(r.c) || 0) });
  return m;
}

/** Mutasi per (akun, type, ref) PERIODE [from, to) -- basis LPE (closing/alokasi). */
type Bucket = Map<string, RowDC>; // key: `${code}|${type}|${ref}`

async function perBucketPeriod(db: QueryDb, from: string, to: string): Promise<Bucket> {
  const rows = (await db
    .prepare(
      `SELECT jl.account_code,
              COALESCE(je.type,'all') ty,
              COALESCE(je.ref_table,'all') rf,
              COALESCE(SUM(jl.debit),0) d,
              COALESCE(SUM(jl.credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date >= ? AND je.entry_date < ?
       GROUP BY jl.account_code, COALESCE(je.type,'all'), COALESCE(je.ref_table,'all')`
    )
    .all(from, to)) as { account_code: string; ty: string; rf: string; d: number; c: number }[];
  const m: Bucket = new Map();
  for (const r of rows) m.set(`${r.account_code}|${r.ty}|${r.rf}`, { debit: Math.round(Number(r.d) || 0), credit: Math.round(Number(r.c) || 0) });
  return m;
}

type Leg = { d: number; cr: number };
type Entry = { type: string; legs: Map<string, Leg> };

/** Per (entry, akun) PERIODE [from, to) -- basis klasifikasi LAK (pola lak.ts). */
async function perEntryPeriod(db: QueryDb, from: string, to: string): Promise<Map<string, Entry>> {
  const rows = (await db
    .prepare(
      `SELECT je.id id, je.type type, jl.account_code c,
              COALESCE(SUM(jl.debit), 0) d, COALESCE(SUM(jl.credit), 0) cr
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date >= ? AND je.entry_date < ?
       GROUP BY je.id, je.type, jl.account_code`
    )
    .all(from, to)) as { id: string; type: string; c: string; d: number; cr: number }[];
  const m = new Map<string, Entry>();
  for (const r of rows) {
    let e = m.get(r.id);
    if (!e) {
      e = { type: r.type, legs: new Map() };
      m.set(r.id, e);
    }
    const leg = e.legs.get(r.c) ?? { d: 0, cr: 0 };
    leg.d += r.d;
    leg.cr += r.cr;
    e.legs.set(r.c, leg);
  }
  return m;
}

/** SUM global debit/credit KUMULATIF s.d. `at` (rekon #15, pola modul lain). */
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

/** Baris coop_shu per tahun (period LIKE 'YYYY-%', OQ1=A input admin). */
async function shuRows(db: QueryDb, tahun: string): Promise<RatShuRow[]> {
  const rows = (await db
    .prepare(
      `SELECT period, shu_total, cadangan_umum, cadangan_khusus, jasa_anggota, dibagi, rasio_json
       FROM coop_shu WHERE period LIKE ? ORDER BY period`
    )
    .all(tahun + '-%')) as {
    period: string;
    shu_total: number;
    cadangan_umum: number | null;
    cadangan_khusus: number | null;
    jasa_anggota: number | null;
    dibagi: number | null;
    rasio_json: string | null;
  }[];
  return rows.map((r) => ({
    period: r.period,
    shu_total: Math.round(Number(r.shu_total) || 0),
    cadangan_umum: Math.round(Number(r.cadangan_umum ?? 0) || 0),
    cadangan_khusus: Math.round(Number(r.cadangan_khusus ?? 0) || 0),
    jasa_anggota: Math.round(Number(r.jasa_anggota ?? 0) || 0),
    dibagi: Math.round(Number(r.dibagi ?? 0) || 0),
    rasio: parseRasio(r.rasio_json),
  }));
}

// -- Helper saldo (konvensi SAK-EP, pola modul W2.x). --

/** Magnitudo efek-DEBIT (akun 5xxx/6xxx + kontra 4020/4030): debit - kredit. */
function dBal(code: string, m: Map<string, RowDC>): number {
  const r = m.get(code);
  const d = Math.round(r?.debit ?? 0) || 0;
  const c = Math.round(r?.credit ?? 0) || 0;
  return d - c;
}

/** Saldo wajar efek-KREDIT (akun 4xxx wajar / 2xxx / 3xxx): kredit - debit. */
function cBal(code: string, m: Map<string, RowDC>): number {
  const r = m.get(code);
  const d = Math.round(r?.debit ?? 0) || 0;
  const c = Math.round(r?.credit ?? 0) || 0;
  return c - d;
}

/** Saldo wajar efek-KREDIT utk RowDC langsung (akun 2xxx/3xxx): kredit - debit. */
function balCredit(r?: RowDC): number {
  const d = Math.round(r?.debit ?? 0) || 0;
  const c = Math.round(r?.credit ?? 0) || 0;
  return c - d;
}

// Akun kas (mirror lak.ts): kas wajar D-ekspansi -> saldo = debit - kredit.
function balKas(code: string, m: Map<string, RowDC>): number {
  const r = m.get(code);
  const d = Math.round(r?.debit ?? 0) || 0;
  const c = Math.round(r?.credit ?? 0) || 0;
  return d - c;
}

// -- Perhitungan per-laporan (formula identik modul W2.x; rentang periode). --

/** LAK PER-TAHUN: saldo awal = akhir tahun lalu; arus = klasifikasi periode
 *  (logika per-entry mirror lak.ts; pergeseran kas sosial sama). */
function lakAnnual(before: Map<string, RowDC>, entries: Map<string, Entry>): RatLak {
  const act: Record<'operasional' | 'investasi' | 'pendanaan', { masuk: number; keluar: number; codes: Set<string> }> = {
    operasional: { masuk: 0, keluar: 0, codes: new Set() },
    investasi: { masuk: 0, keluar: 0, codes: new Set() },
    pendanaan: { masuk: 0, keluar: 0, codes: new Set() },
  };

  const kas = KAS_USAHA.map((k) => ({
    code: k.code,
    name: k.name,
    pembuka: balKas(k.code, before), // saldo akhir tahun lalu
    masuk: 0,
    keluar: 0,
    transfer: 0,
    penutup: balKas(k.code, before),
  }));

  // Seksi kas sosial (1100).
  const s = {
    pembuka: balKas(KAS_SOSIAL_ACCT, before),
    masuk: 0,
    keluar: 0,
    transfer: 0,
    penutup: balKas(KAS_SOSIAL_ACCT, before),
  };
  // Rincian ZIS (mirror lak.ts ZIS_ROWS + fallback '(lain)').
  const zis = new Map<string, { label: string; masuk: number; keluar: number }>();
  for (const z of ZIS_PANEL_ROWS) zis.set(z.code, { label: z.label, masuk: 0, keluar: 0 });
  const ZIS_OTHER = '(lain)';
  zis.set(ZIS_OTHER, { label: 'Pergerakan lain (lawan bukan ZIS)', masuk: 0, keluar: 0 });
  let pergeseran = 0; // pergeseran kas usaha <-> 1100 (bukan aktivitas)

  for (const e of entries.values()) {
    const legs = e.legs;
    const bal = (code: string): number => {
      const l = legs.get(code);
      return l ? Math.round(l.d) - Math.round(l.cr) : 0;
    };

    // Jurnal 'opening' periode -> pembuka (basis saldo awal), bukan arus.
    for (const k of kas) {
      const b = bal(k.code);
      if (b === 0) continue;
      k.penutup += b;
      if (e.type === 'opening') k.pembuka += b;
    }
    const b1100 = bal(KAS_SOSIAL_ACCT);
    if (b1100 !== 0) {
      s.penutup += b1100;
      if (e.type === 'opening') s.pembuka += b1100;
    }
    if (e.type === 'opening') continue;

    const counters = [...legs.keys()].filter((c) => !CASH_CODES.has(c));

    // Transfer antar-kas murni (tanpa kaki non-kas) = bukan aktivitas.
    if (counters.length === 0) {
      let businessNet = 0;
      for (const k of kas) {
        const b = bal(k.code);
        if (b === 0) continue;
        k.transfer += b;
        businessNet += b;
      }
      if (legs.has(KAS_SOSIAL_ACCT)) {
        s.transfer += b1100;
        if (businessNet !== 0) pergeseran += businessNet;
      }
      continue;
    }

    // Arus kas usaha (1010/1020): klasifikasi per aktivitas (Sek.5.4).
    const key = classify(counters);
    const a = act[key];
    let anyCash = false;
    for (const k of kas) {
      const b = bal(k.code);
      if (b === 0) continue;
      anyCash = true;
      if (b > 0) {
        a.masuk += b;
        k.masuk += b;
      } else {
        a.keluar += -b;
        k.keluar += -b;
      }
    }
    if (anyCash) for (const c of counters) a.codes.add(c);

    // Arus kas sosial (1100): rincian per akun lawan ZIS (atribusi eksak).
    if (legs.has(KAS_SOSIAL_ACCT)) {
      if (b1100 > 0) s.masuk += b1100;
      else if (b1100 < 0) s.keluar += -b1100;
      for (const c of counters) {
        const l = legs.get(c) as Leg;
        const cd = Math.round(l.d);
        const cc = Math.round(l.cr);
        const row = zis.get(c) ?? zis.get(ZIS_OTHER)!;
        if (cc > cd) row.masuk += cc - cd; // lawan sisi kredit = kas sosial masuk
        else if (cd > cc) row.keluar += cd - cc; // lawan sisi debit = kas sosial keluar
      }
    }
  }

  const toActivity = (x: { masuk: number; keluar: number; codes: Set<string> }): RatActivity => ({
    masuk: x.masuk,
    keluar: x.keluar,
    neto: x.masuk - x.keluar,
    codes: [...x.codes].sort(),
  });

  // Rincian ZIS: semua baris dikenal tetap (0 = belum terjadi);
  // baris '(lain)' hanya bila ada.
  const rincian: RatKasSosial['rincian'] = ZIS_PANEL_ROWS.map((z) => ({
    code: z.code,
    label: z.label,
    masuk: zis.get(z.code)!.masuk,
    keluar: zis.get(z.code)!.keluar,
  }));
  const other = zis.get(ZIS_OTHER)!;
  if (other.masuk !== 0 || other.keluar !== 0) {
    rincian.push({ code: ZIS_OTHER, label: other.label, masuk: other.masuk, keluar: other.keluar });
  }

  const kasRows: RatKasRow[] = kas.map((k) => ({
    code: k.code,
    name: k.name,
    pembuka: k.pembuka,
    masuk: k.masuk,
    keluar: k.keluar,
    transfer: k.transfer,
    neto: k.masuk - k.keluar + k.transfer,
    penutup: k.penutup,
  }));

  const aOp = toActivity(act.operasional);
  const aInv = toActivity(act.investasi);
  const aPen = toActivity(act.pendanaan);
  const netoAktivitas = aOp.neto + aInv.neto + aPen.neto;
  const saldoAwal = kasRows.reduce((t, k) => t + k.pembuka, 0);
  const saldoAkhir = kasRows.reduce((t, k) => t + k.penutup, 0);

  return {
    kas: kasRows,
    aktivitas: { operasional: aOp, investasi: aInv, pendanaan: aPen },
    kas_sosial: {
      code: KAS_SOSIAL_ACCT,
      name: KAS_SOSIAL_NAME,
      pembuka: s.pembuka,
      masuk: s.masuk,
      keluar: s.keluar,
      transfer: s.transfer,
      neto: s.masuk - s.keluar + s.transfer,
      penutup: s.penutup,
      rincian,
    },
    footer: {
      saldo_awal: saldoAwal,
      neto_aktivitas: netoAktivitas,
      pergeseran_kas_sosial: pergeseran,
      saldo_akhir: saldoAkhir,
    },
  };
}

/** LKA PER-TAHUN: formula SAK-EP Sek.5.2 (identik lka.ts), saldo map periode. */
function lkaFromPeriod(m: Map<string, RowDC>): RatLka {
  const revBruto = cBal(REV_GROSS, m);
  const diskon = dBal(DISKON, m);
  const returPenjualan = dBal(RETUR_PENJUALAN, m);
  const pendapatanNeto = revBruto - diskon - returPenjualan;

  // HPP: 5010 bruto (debit) - 5020 retur COGS (credit contra, netting V2-2;
  // live GL mempost 5020 KREDIT -> penjumlahan additive dBal, sama lka.ts).
  const hppBruto = dBal(HPP_GROSS, m);
  const hppReturD = dBal(HPP_RETUR, m); // negatif pd live (post KREDIT)
  const hppRetur = -hppReturD; // magnitudo positif utk tampilan
  const hppNeto = hppBruto + hppReturD;

  const labaKotor = pendapatanNeto - hppNeto;

  // BEBAN (5030+5040+5060+5070+5080). 5050 denda TIDAK AKTIF (closed).
  let beban = 0;
  for (const c of BEBAN_CODES) beban += dBal(c, m);
  const labaSebelumZis = labaKotor - beban;

  // ZIS (5090+5100+6030).
  let zis = 0;
  for (const c of ZIS_CODES) zis += dBal(c, m);

  // PENDAPATAN LAIN koperasi 4050-4100 (efek-kredit) SUMMED ke laba.
  const pendapatanLainRows = OTHER_INCOME_ROWS.map((r) => ({ code: r.code, label: r.label, value: cBal(r.code, m) }));
  const pendapatanLain = pendapatanLainRows.reduce((t, r) => t + r.value, 0);
  const labaBersih = labaSebelumZis - zis + pendapatanLain;

  // MEMO (4040/2030/3020) -- TIDAK dijumlahkan ke laba_bersih.
  const memo = MEMO_ROWS.map((r) => ({ code: r.code, label: r.label, value: cBal(r.code, m) }));

  return {
    pendapatan: { bruto: revBruto, diskon, retur_penjualan: returPenjualan, neto: pendapatanNeto },
    hpp: { bruto: hppBruto, retur: hppRetur, neto: hppNeto },
    laba_kotor: labaKotor,
    beban,
    laba_sebelum_zis: labaSebelumZis,
    zis,
    pendapatan_lainnya: { total: pendapatanLain, rows: pendapatanLainRows },
    laba_bersih: labaBersih,
    memo,
  };
}

/**
 * LPE PER-TAHUN: pembuka = saldo 30xx kumulatif s.d. awal tahun;
 * shu = jurnal closing periode; alokasi = coop normal periode;
 * distribusi = placeholder 0 (pola lpe.ts W2.6).
 */
function lpeAnnual(before: Map<string, RowDC>, at: Map<string, RowDC>, bucket: Bucket): RatLpe {
  const byType = (code: string, type: string): RowDC => {
    const prefix = `${code}|${type}|`;
    let d = 0;
    let c = 0;
    for (const [key, row] of bucket) {
      if (key.startsWith(prefix)) {
        d += row.debit;
        c += row.credit;
      }
    }
    return { debit: d, credit: c };
  };
  const triple = (code: string, type: string, ref: string): RowDC =>
    bucket.get(`${code}|${type}|${ref}`) ?? { debit: 0, credit: 0 };

  const columns: RatLpeColumn[] = LPE_COLUMNS.map((col) => {
    const pembuka = cBal(col.code, before); // saldo akhir tahun lalu
    const shu = balCredit(byType(col.code, 'closing'));
    const alokasi = balCredit(triple(col.code, 'normal', 'coop'));
    const distribusi = 0; // placeholder W2.6 (alokasi coop sudah memuat distribusi)
    const penutup = pembuka + shu + alokasi - distribusi;
    return { code: col.code, name: col.name, pembuka, shu, alokasi, distribusi, penutup };
  });

  // Memo simpanan 2050-2070 (kewajiban, bukan ekuitas) -- saldo s.d. akhir tahun.
  const simpanan = SIMPANAN.map((s) => ({ code: s.code, label: s.label, value: cBal(s.code, at) }));
  const simpananTotal = simpanan.reduce((acc, x) => acc + x.value, 0);

  const totals = { pembuka: 0, shu: 0, alokasi: 0, distribusi: 0, penutup: 0 };
  for (const c of columns) {
    totals.pembuka += c.pembuka;
    totals.shu += c.shu;
    totals.alokasi += c.alokasi;
    totals.distribusi += c.distribusi;
    totals.penutup += c.penutup;
  }

  // Saldo penuh 30xx s.d. akhir tahun (audit).
  let fullEq = 0;
  for (const c of EKUITAS) fullEq += cBal(c, at);

  return { columns, totals, full_balance_ekuitas: fullEq, memos: { simpanan, simpanan_total: simpananTotal } };
}

/** Klasifikasi aktivitas per entry (kaki kas usahanya), Sek.5.4 (mirror lak.ts). */
function classify(counters: string[]): 'operasional' | 'investasi' | 'pendanaan' {
  for (const c of counters) if (INVESTASI.has(c)) return 'investasi';
  for (const c of counters) if (PENDANAAN.has(c)) return 'pendanaan';
  return 'operasional';
}

/** ZIS PER-TAHUN (paparan posting GL, konsisten calk.ts item 7). */
function zisAnnual(m: Map<string, RowDC>): RatZis {
  const rows = ZIS_PANEL_ROWS.map((r) => ({
    code: r.code,
    label: r.label,
    sisi: r.sisi,
    value: r.sisi === 'diterima' ? cBal(r.code, m) : dBal(r.code, m),
  }));
  let diterima = 0;
  let disalurkan = 0;
  for (const r of rows) {
    if (r.sisi === 'diterima') diterima += r.value;
    else disalurkan += r.value;
  }
  return { diterima, disalurkan, rows };
}

/** Agregasi SHU per tahun dari baris coop_shu (paparan -- bukan hitung anyar). */
function shuAggregate(rows: RatShuRow[]): RatShu {
  const totals = { cadangan_umum: 0, cadangan_khusus: 0, jasa_anggota: 0, dibagi: 0 };
  let totalShu = 0;
  for (const r of rows) {
    totalShu += r.shu_total;
    totals.cadangan_umum += r.cadangan_umum;
    totals.cadangan_khusus += r.cadangan_khusus;
    totals.jasa_anggota += r.jasa_anggota;
    totals.dibagi += r.dibagi;
  }
  return { counts: rows.length, total_shu: totalShu, totals, rows };
}

/**
 * Bangun Laporan Tahunan (RAT) utk `tahun` (YYYY, jendela [YYYY-01-01,
 * (YYYY+1)-01-01)). Import-free: hanya `QueryDb` + buildPosisi (modul
 * hermetis). Nama akun (COA) dikandung modul; modul mengembalikan
 * kode + angka saja (pola buildLka).
 *
 * @throws Error('RAT_YEAR_INVALID') bila `tahun` bukan 4 digit.
 */
export async function buildRat(db: QueryDb, tahun: string): Promise<RatPayload> {
  if (!/^\d{4}$/.test(tahun)) throw new Error('RAT_YEAR_INVALID');
  const from = tahun + '-01-01';
  const to = String(Number(tahun) + 1) + '-01-01';

  const [period, before, at, bucket, entries, dk, shuRs, posisi] = await Promise.all([
    perAccountPeriod(db, from, to),
    perCodeBefore(db, from), // pembuka LPE/LAK (saldo akhir tahun lalu)
    perCodeBefore(db, to), // saldo penuh s.d. akhir tahun (audit)
    perBucketPeriod(db, from, to),
    perEntryPeriod(db, from, to),
    journalTotals(db, to),
    shuRows(db, tahun),
    buildPosisi(db, to), // neraca kumulatif s.d. akhir tahun
  ]);

  const lka = lkaFromPeriod(period);
  const lpe = lpeAnnual(before, at, bucket);
  const lak = lakAnnual(before, entries);
  const zis = zisAnnual(period);
  const shu = shuAggregate(shuRs);

  const gap = dk.debit - dk.credit;
  const balanced = dk.debit === dk.credit;

  return {
    tahun,
    period_from: from,
    period_to: to,
    lka,
    lpe,
    posisi,
    lak,
    shu,
    zis,
    d_k: { total_debit: dk.debit, total_credit: dk.credit, balanced, gap },
    // B4 (audit W2.2): flag_rekon15 ini PROXY D=K GLOBAL -- SUM(debit) =
    // SUM(credit) kumulatif s.d. akhir tahun (JOIN journal_entries),
    // BUKAN cek per-entry + orphan JOURNAL_BAL yang otoritatif. Validasi
    // penuh (per-entry + orphan) ada di /admin/rekonsiliasi (#15).
    flag_rekon15: !balanced,
  };
}





/** LKA PER-TAHUN: field sama dgn LkaPayload (kecuali as_of/d_k/flag). */
export type RatLka = {
  pendapatan: { bruto: number; diskon: number; retur_penjualan: number; neto: number };
  hpp: { bruto: number; retur: number; neto: number };
  laba_kotor: number;
  beban: number;
  laba_sebelum_zis: number;
  zis: number;
  pendapatan_lainnya: { total: number; rows: { code: string; label: string; value: number }[] };
  laba_bersih: number;
  /** Memo (4040/2030/3020) per tahun -- TIDAK dijumlahkan. */
  memo: { code: string; label: string; value: number }[];
};

/** Satu kolom ekuitas LPE per tahun (pembuka = saldo akhir tahun lalu). */
export type RatLpeColumn = {
  code: string;
  name: string;
  /** Saldo 30xx kumulatif s.d. awal tahun (penutup tahun sebelumnya). */
  pembuka: number;
  /** (+) SHU (jurnal closing) periode. */
  shu: number;
  /** (+/-) Alokasi SHU (coop, W4.4) periode. */
  alokasi: number;
  /** (-) Distribusi (placeholder 0 -- pola lpe.ts; W2.6). */
  distribusi: number;
  /** pembuka + shu + alokasi - distribusi. */
  penutup: number;
};

/** LPE PER-TAHUN: opening (tahun lalu) + mutasi periode. */
export type RatLpe = {
  columns: RatLpeColumn[];
  totals: { pembuka: number; shu: number; alokasi: number; distribusi: number; penutup: number };
  /** Saldo penuh 30xx s.d. akhir tahun (audit). */
  full_balance_ekuitas: number;
  /** Memo kaki: simpanan 2050-2070 (kewajiban, bukan ekuitas). */
  memos: { simpanan: { code: string; label: string; value: number }[]; simpanan_total: number };
};

/** Kas per akun LAK per tahun (pembuka = saldo akhir tahun lalu). */
export type RatKasRow = {
  code: string;
  name: string;
  pembuka: number;
  masuk: number;
  keluar: number;
  transfer: number;
  /** masuk - keluar + transfer. */
  neto: number;
  penutup: number;
};

/** Satu aktivitas LAK per tahun (Sek.5.4). */
export type RatActivity = { masuk: number; keluar: number; neto: number; codes: string[] };

/** Kas sosial 1100 (seksi terpisah, anti-campur, Sek.5.4). */
export type RatKasSosial = {
  code: string;
  name: string;
  pembuka: number;
  masuk: number;
  keluar: number;
  transfer: number;
  neto: number;
  penutup: number;
  rincian: { code: string; label: string; masuk: number; keluar: number }[];
};

/** LAK PER-TAHUN: saldo awal (akhir tahun lalu) + arus periode. */
export type RatLak = {
  kas: RatKasRow[];
  aktivitas: { operasional: RatActivity; investasi: RatActivity; pendanaan: RatActivity };
  kas_sosial: RatKasSosial;
  /** Identitas konstruktif: saldo_akhir = saldo_awal + neto_aktivitas + pergeseran. */
  footer: {
    /** Pembuka kas usaha (1010+1020, s.d. awal tahun + jurnal opening periode). */
    saldo_awal: number;
    /** Netto operasional + investasi + pendanaan. */
    neto_aktivitas: number;
    /** Pergeseran kas usaha <-> 1100 (bukan aktivitas). */
    pergeseran_kas_sosial: number;
    /** Penutup kas usaha s.d. akhir tahun. */
    saldo_akhir: number;
  };
};

