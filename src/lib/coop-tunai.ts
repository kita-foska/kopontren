/**
 * W4.5b -- modul koperasi: pencairan tunai/transfer SHU dibagi
 * (Sisa Dibagi 3060 -> Kas 1010 / Bank-Transfer 1020; ruling Gus Fi
 * 7 Okt 2026, OQ7-A + audit STEP 1 W4.5b OQ12-OQ16).
 *
 * Pencairan = pengeluaran kas/transfer ke anggota atas bagian "SHU
 * dibagi" (akun 3060). OQ7-A: SATU jurnal per periode D3060 ->
 * C1010 (kas) ATAU C1020 (bank/transfer) -- TUNDAI bukan beban:
 * 5080 "Distribusi SHU" BUKAN leg (invariant: saldo 5080 tetap 0;
 * 5080 hanya label COA, tak dipakai jurnal). OQ8: 1 periode = 1
 * pencairan (guard jurnal ref_id 'coop#tunai#<period>', pola
 * closing W4.5a -> 409 TUNAI_PERIOD_EXISTS; koreksi via jurnal
 * pembalik, OQ16).
 *
 * OQ12: nominal = input admin (PKGF: nominal ditetapkan pengurus;
 * aplikasi hanya wadah pencatatan -- pola W4.2 "0 preset"), dgn
 * guard nominal <= saldo GL 3060 (kumulatif all-time, kredit-debit
 * journal_lines); saldo 3060 <= 0 -> 400 TUNAI_NO_POOL. Konsekuensi
 * OQ12+OQ15: gl-off = saldo 3060 tak teramati (tak ada jurnal) ->
 * pencairan selalu 400 TUNAI_NO_POOL; "tercatat utk audit" (OQ15)
 * = logAudit route utk event sukses saja.
 * OQ13: param akun '1010' | '1020' (default '1010'); entry_date =
 * hari posting (nowWib pemanggil -- BUKAN akhir periode, konsisten
 * modal W4.5a). OQ14: tier koperasi (admin+manajer) -- di route.
 * OQ15 (D1): gl-off = tanpa jurnal (entryId null).
 *
 * File lib BARU (engine src/lib/coop.ts TAK DISENTUH; W4.4/W4.5a tak
 * diubah). Pola = W4.4 src/lib/shu.ts + W4.5a coop-modal.ts /
 * coop-closing.ts (record*InTx + builder spec murni, TxDb dari
 * pemanggil; logAudit di route).
 */

import { nowWib, postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';
import { coopValidateAmount } from './coop.ts';

/** Akun GL tunai (COA -- 3 kode; flip open W4.1/W4.2). */
export const TUNAI_ACCT = {
  DIBAGI: '3060', // SHU Dibagi (sumber pencairan)
  KAS: '1010', // Kas Toko (pencairan tunai)
  BANK: '1020', // Bank/Transfer (pencairan transfer)
} as const;

/** Pilihan akun pencairan (OQ13); default = KAS. */
export const TUNAI_ACCTS: readonly string[] = [TUNAI_ACCT.KAS, TUNAI_ACCT.BANK];

export type TunaiValidated = {
  period: string;
  /** Rupiah integer > 0. */
  amount: number;
  /** '1010' | '1020'. */
  acct: string;
};

/** Catatan pencairan tunai/transfer (route -> recordCoopTunaiInTx). */
export type CoopTunaiRec = {
  /** Periode SHU (YYYY-MM; bagian ref_id; 1 periode = 1 pencairan). */
  period: string;
  /** Rupiah integer (kovalidasi; > 0). */
  amount: unknown;
  /** '1010' | '1020'; absen/'' = default KAS '1010' (OQ13). */
  acct?: string;
  gl_enabled: boolean;
  createdBy?: string | null;
  /** OQ13: hari posting (default nowWib()); entry_date jurnal. */
  entryDate?: string;
};

/**
 * Validasi input tunai (murni, teruji test suite): period YYYY-MM,
 * amount rupiah integer > 0 (coopValidateAmount W4.2), acct dalam
 * TUNAI_ACCTS (default KAS bila absen/kosong -- OQ13).
 *
 * @throws 'coop_tunai:period_invalid' / 'coop_tunai:amount_invalid'
 * ('coop: amount ...' dari coopValidateAmount) / 'coop_tunai:acct_invalid'.
 */
export function validateTunaiInput(rec: CoopTunaiRec): TunaiValidated {
  const period = String(rec.period ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('coop_tunai:period_must_be_yyyymm');
  const amount = coopValidateAmount(rec.amount);
  const raw = rec.acct == null || String(rec.acct).trim() === '' ? TUNAI_ACCT.KAS : String(rec.acct).trim();
  if (!TUNAI_ACCTS.includes(raw)) throw new Error('coop_tunai:acct_must_be_1010_or_1020');
  return { period, amount, acct: raw };
}

/**
 * Saldo GL 3060 (kredit - debit kumulatif all-time; akun kredit-normal)
 * = pool tersedia utk pencairan (pola saldo rekap route W4.3; negatif /
 * tak ada baris = 0).
 */
export async function getTunaiPoolInTx(db: TxDb): Promise<number> {
  const r = (await db
    .prepare(
      "SELECT COALESCE(SUM(credit) - SUM(debit), 0) AS v FROM journal_lines WHERE account_code = ?"
    )
    .get(TUNAI_ACCT.DIBAGI)) as { v: number };
  return Math.max(0, Math.round(Number(r?.v) || 0));
}

/**
 * Spesifikasi entry tunai (OQ7-A: SATU jurnal D3060 -> C1010/C1020;
 * 5080 TIDAK jadi leg). OQ13: entry_date = hari posting (nowWib).
 * ref_id 'coop#tunai#<period>' (UNIQUE(ref_table,ref_id,type) =
 * backstop; pre-check utama = getTunaiPeriodExists, di bawah).
 */
export function buildCoopTunaiSpec(input: TunaiValidated & {
  entryDate: string;
  createdBy?: string | null;
}): JSpec {
  const lines: JLine[] = [
    {
      account_code: TUNAI_ACCT.DIBAGI,
      debit: input.amount,
      credit: 0,
      source: 'coop#tunai#' + input.period + ':3060',
    },
    {
      account_code: input.acct,
      debit: 0,
      credit: input.amount,
      source: 'coop#tunai#' + input.period + ':' + input.acct,
    },
  ];
  return {
    id: 'JE-cooptunai-' + input.period + '-' + input.acct,
    ref_table: 'coop',
    ref_id: 'coop#tunai#' + input.period,
    entry_date: input.entryDate,
    type: 'auto',
    desc: 'Pencairan tunai/transfer SHU dibagi periode ' + input.period + ': ' + input.amount,
    created_by: input.createdBy ?? undefined,
    lines,
  };
}

/**
 * Ada pencairan periode ini? (OQ8/OQ16: 1 periode = 1 pencairan;
 * guard pola closing W4.5a -- ref jurnal 'coop', tipe 'auto').
 */
export async function hasTunaiPeriod(db: TxDb, period: string): Promise<boolean> {
  const r = (await db
    .prepare(
      "SELECT 1 AS x FROM journal_entries WHERE ref_table = 'coop' AND ref_id = ? AND type = 'auto'"
    )
    .get('coop#tunai#' + period)) as { x?: number } | undefined;
  return !!r;
}

/**
 * Catat pencairan tunai/transfer SHU dibagi (route -> tx pemanggil).
 * Urutan langkah (di dalam tx):
 *  1. validasi input (400 'coop_tunai:...');
 *  2. pre-check periode: sudah ada pencairan -> 'TUNAI_PERIOD_EXISTS'
 *     (route 409; koreksi = jurnal pembalik, OQ16);
 *  3. guard pool (OQ12): saldo GL 3060 <= 0 -> 'TUNAI_NO_POOL'
 *     (route 400; konsekuensi gl-off = selalu 400, tak ada pool);
 *     nominal > saldo -> 'coop_tunai:exceeds_balance' (route 400);
 *  4. gl-on: postJournalInTx SATU jurnal D3060 -> C1010/C1020 (OQ7-A;
 *     OQ15: gl-off = tanpa jurnal, entryId null).
 *
 * @throws 'coop_tunai:...' (400 validasi/saldo), 'TUNAI_PERIOD_EXISTS'
 * (409), 'TUNAI_NO_POOL' (400).
 */
export async function recordCoopTunaiInTx(
  db: TxDb,
  rec: CoopTunaiRec
): Promise<{ entryId: string | null }> {
  const v = validateTunaiInput(rec);
  if (await hasTunaiPeriod(db, v.period)) throw new Error('TUNAI_PERIOD_EXISTS');
  const pool = await getTunaiPoolInTx(db);
  if (pool <= 0) throw new Error('TUNAI_NO_POOL');
  if (v.amount > pool) throw new Error('coop_tunai:exceeds_balance');
  if (rec.gl_enabled !== true) return { entryId: null };
  const entryId = await postJournalInTx(
    db,
    buildCoopTunaiSpec({ ...v, entryDate: rec.entryDate ?? nowWib(), createdBy: rec.createdBy })
  );
  return { entryId };
}

