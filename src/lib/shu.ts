/**
 * W4.4 -- modul koperasi: distribusi SHU (Sisa Hasil Usaha), rasio input admin.
 *
 * Sisi-pasif PKGF (Sek.13 / keputusan #13.4): angka rasio TIDAK ada default di
 * aplikasi; admin yang mengisikannya per periode (disimpan sebagai rasio_json
 * di coop_shu). Periode SHU = input admin (Sek.7.2.1 "hitung = input, distribusi
 * = jurnal").
 *
 * Alur Sek.7.2.2 (ruling OQ1=A, W4.4): SATU jurnal alokasi
 *   D 3020 (SHU Ditahan) = shu_total
 *   K 3030 cadangan umum + 3040 cadangan khusus + 3050 jasa anggota
 *     + 3060 SHU dibagi  (per rasio; porsi "dibagi" = residu agar
 *     SUM porsi = shu_total -> D=K)
 * Jasa-ke-anggota (per orang, bobot rata-rata -- keputusan Q5) + pencairan
 * tunai (akun 5080) = W4.5 (ditunda). 3020 boleh negatif sementara sampai
 * jurnal closing (W4.5); GL menegakkan D=K, bukan non-negatif.
 *
 * Murni: tanpa state modul; semua tulis via TxDb pemanggil (tx db.ts),
 * pola lib/coop.ts W4.2. Entry GL: ref_table='coop',
 * ref_id='coop#shu#<period>' (idempoten UNIQUE(ref_table,ref_id,type)),
 * type='auto', entry_date = AWAL PERIODE (period + '-01'), BUKAN tanggal
 * posting (ruling correction 2: menjaga jejak audit ke periode SHU).
 *
 * Akun SHU (COA -- flip open W4.1): 3020/3030/3040/3050/3060.
 * 5080 (Distribusi SHU, tunai) = W4.5, TIDAK disentuh di modul ini.
 */

import { postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';

/** Akun GL modul SHU (COA -- 5 kode ekuitas 30xx; flip open W4.1). */
export const SHU_ACCT = {
  DITAHAN: '3020', // SHU Ditahan
  CAD_UMUM: '3030', // SHU Cadangan Umum
  CAD_KHUSUS: '3040', // SHU Cadangan Khusus
  JASA: '3050', // SHU Jasa Anggota
  DIBAGI: '3060', // SHU Dibagi
} as const;

/** Rasio alokasi SHU (persen 0-100; SUM(cad_umum+cad_khusus+jasa) <= 100). */
export interface ShuRasio {
  cad_umum: number;
  cad_khusus: number;
  jasa: number;
}

/** Rasio lengkap (termasuk porsi "dibagi" = residu; disimpan ke rasio_json). */
export interface ShuRasioFull extends ShuRasio {
  dibagi: number;
}

/** 4 porsi alokasi (rupiah integer); SUM porsi selalu = shu_total (garansi D=K). */
export interface ShuAmounts {
  cad_umum: number;
  cad_khusus: number;
  jasa: number;
  dibagi: number;
}

/** Hasil validasi input admin (route memakai utk catat + susun jurnal). */
export type ShuValidated = {
  period: string;
  shu_total: number;
  rasio: ShuRasioFull;
  amounts: ShuAmounts;
};

/**
 * Hitung 4 porsi alokasi (rupiah integer). OQ2/OQ3: 3 porsi dibulatkan
 * (round(total*pct/100)); "dibagi" = residu (total - SUM(cad_umum+cad_khusus+jasa)) agar total PASTI
 * = shu_total -> D=K terjamin.
 *
 * Throw (route petakan ke 400):
 *   - SHU_TOTAL_INVALID  : total <= 0 / bukan integer rupiah
 *   - SHU_RATIO_INVALID  : rasio bukan angka, atau negatif
 *   - SHU_RATIO_SUM      : SUM(cad_umum+cad_khusus+jasa) > 100
 */
export function computeShuAllocation(shuTotal: number, rasio: ShuRasio): ShuAmounts {
  const total = Math.round(Number(shuTotal) || 0);
  if (total <= 0) throw new Error('SHU_TOTAL_INVALID');
  const pct = (v: unknown): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error('SHU_RATIO_INVALID');
    return n;
  };
  const cad_umum = pct(rasio?.cad_umum);
  const cad_khusus = pct(rasio?.cad_khusus);
  const jasa = pct(rasio?.jasa);
  if (cad_umum + cad_khusus + jasa > 100 + 1e-9) throw new Error('SHU_RATIO_SUM');
  const aCadUmum = Math.round((total * cad_umum) / 100);
  const aCadKhusus = Math.round((total * cad_khusus) / 100);
  const aJasa = Math.round((total * jasa) / 100);
  const aDibagi = total - (aCadUmum + aCadKhusus + aJasa); // residu (pasti >= 0)
  return { cad_umum: aCadUmum, cad_khusus: aCadKhusus, jasa: aJasa, dibagi: aDibagi };
}

/** Porsi persen "dibagi" (residu 100 - SUM(cad_umum+cad_khusus+jasa)) utk pratinjau UI + rasio_json. */
export function shuDibagiPct(rasio: ShuRasio): number {
  const n = (v: unknown): number => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return Math.round((100 - n(rasio?.cad_umum) - n(rasio?.cad_khusus) - n(rasio?.jasa)) * 100) / 100;
}

/**
 * Validasi input admin (murni, tanpa DB). Cek format periode YYYY-MM + total
 * + rasio; hasil: rasio lengkap (termasuk dibagi) + 4 porsi rupiah.
 * Throw: SHU_PERIOD_INVALID / SHU_TOTAL_INVALID / SHU_RATIO_INVALID /
 * SHU_RATIO_SUM (route map ke 400).
 */
export function validateShuInput(input: {
  period: string;
  shu_total: number;
  rasio: ShuRasio;
}): ShuValidated {
  const period = String(input.period ?? '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('SHU_PERIOD_INVALID');
  const total = Math.round(Number(input.shu_total) || 0);
  const amounts = computeShuAllocation(total, input.rasio);
  const rasioFull: ShuRasioFull = {
    cad_umum: Number(input.rasio.cad_umum) || 0,
    cad_khusus: Number(input.rasio.cad_khusus) || 0,
    jasa: Number(input.rasio.jasa) || 0,
    dibagi: shuDibagiPct(input.rasio),
  };
  return { period, shu_total: total, rasio: rasioFull, amounts };
}

/**
 * Susun SATU JSpec alokasi (OQ1=A): D3020 = shu_total -> C3030/3040/3050/3060
 * (kaki bernilai nol dikecualikan; D=K terjamin karena SUM porsi = shu_total).
 * entry_date = glDate (disuplai = awal periode, period + '-01').
 */
export function buildShuAllocationSpec(
  period: string,
  shuTotal: number,
  amounts: ShuAmounts,
  glDate: string,
  createdBy: string | null
): JSpec {
  const legs: Array<[string, number, string]> = [
    [SHU_ACCT.CAD_UMUM, amounts.cad_umum, 'cad umum'],
    [SHU_ACCT.CAD_KHUSUS, amounts.cad_khusus, 'cad khusus'],
    [SHU_ACCT.JASA, amounts.jasa, 'jasa'],
    [SHU_ACCT.DIBAGI, amounts.dibagi, 'dibagi'],
  ];
  const lines: JLine[] = [
    { account_code: SHU_ACCT.DITAHAN, debit: shuTotal, credit: 0, source: 'SHU ' + period },
  ];
  for (const [code, amt, tag] of legs) {
    if (amt > 0) lines.push({ account_code: code, debit: 0, credit: amt, source: 'SHU ' + period + ' ' + tag });
  }
  return {
    id: 'JE-shu-' + period,
    ref_table: 'coop',
    ref_id: 'coop#shu#' + period,
    entry_date: glDate,
    type: 'auto',
    desc: 'SHU ' + period + ': alokasi D3020 -> C3030/3040/3050/3060',
    created_by: createdBy ?? undefined,
    lines,
  };
}

/**
 * Catat distribusi SHU (route -> 409 bila periode sudah ada). INSERT
 * coop_shu (rasio_json = rasio lengkap term. dibagi) + postJournalInTx
 * (hanya saat glEnabled; saat gl-off = tercatat tanpa jurnal, pola D1).
 * Semua tulis via TxDb pemanggil -- atomik dgn logAudit.
 *
 * Throw: SHU_PERIOD_EXISTS (periode sudah ada, UNIQUE(period)).
 */
export async function recordShuInTx(
  d: TxDb,
  p: {
    id: string;
    period: string;
    shu_total: number;
    rasio: ShuRasioFull;
    amounts: ShuAmounts;
    glDate: string;
    glEnabled: boolean;
    createdBy: string | null;
  }
): Promise<{ id: string; entryId: string | null; gl: boolean; amounts: ShuAmounts }> {
  const dup = (await d
    .prepare('SELECT 1 AS x FROM coop_shu WHERE period = ?')
    .get(p.period)) as { x?: number } | undefined;
  if (dup) throw new Error('SHU_PERIOD_EXISTS');
  await d
    .prepare(
      'INSERT INTO coop_shu (id, period, shu_total, cadangan_umum, cadangan_khusus, jasa_anggota, dibagi, rasio_json, created_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      p.id,
      p.period,
      p.shu_total,
      p.amounts.cad_umum,
      p.amounts.cad_khusus,
      p.amounts.jasa,
      p.amounts.dibagi,
      JSON.stringify(p.rasio),
      p.createdBy ?? ''
    );
  let entryId: string | null = null;
  if (p.glEnabled) {
    entryId = await postJournalInTx(
      d,
      buildShuAllocationSpec(p.period, p.shu_total, p.amounts, p.glDate, p.createdBy)
    );
  }
  return { id: p.id, entryId, gl: p.glEnabled, amounts: p.amounts };
}