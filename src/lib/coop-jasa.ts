/**
 * W4.5b -- modul koperasi: jasa per anggota (Jasa 3050 -> Sukarela 2070;
 * proposal Sek.7.2.2 "jasa anggota: Debit 3050 -> Kredit 2070 (per
 * anggota)"; ruling Gus Fi 7 Okt 2026, audit STEP 1 W4.5b OQ4-OQ17).
 *
 * Jasa = bagian SHU utk imbal jasa/modal anggota (akun 3050). Pembagian
 * Q5 = rata-rata konservatif (bukan bunga): pool = SELURUH
 * coop_shu.jasa_anggota periode (tanpa input nominal, OQ10);
 * N = anggota status='aktif' (OQ4); per anggota = floor(pool/N),
 * sisa (pool % N) dipas +1 ke r anggota PERTAMA URUTAN NAMA
 * (COLLATE NOCASE) -- deterministik; SUM porsi = pool (D=K).
 * OQ6: dicatat di coop_savings kind 'jasa' (saved_at = hari terakhir
 * periode, OQ11). OQ9: SATU jurnal agregat per periode -- 1 kaki
 * D3050 (jasa_total) + N kaki K2070 (source per anggota; detail per
 * anggota = baris coop_savings). Akun 5080 TAK PERNAH jadi leg
 * (invariant OQ7-A: saldo tetap 0).
 *
 * OQ8/OQ16: 1 periode = 1 distribusi -- pre-check EVENT-LEVEL di
 * coop_savings (baris kind 'jasa' saved_at = akhir periode), bukan di
 * jurnal: dengan OQ15 (D1, gl-off = tercatat tanpa jurnal) guard jurnal
 * saja tak cukup utk gl-off. Duplikat -> throw 'JASA_PERIOD_EXISTS'
 * (route 409; koreksi via jurnal pembalik, pola closing W4.5a).
 *
 * OQ14: tier koperasi (admin+manajer) -- di route, bukan di sini.
 * OQ15: gl-off = N baris tetap tercatat, tanpa jurnal.
 *
 * File lib BARU (engine src/lib/coop.ts TAK DISENTUH; W4.4/W4.5a tak
 * diubah -- helper lastDayOfMonthIso diduplikasi kecil di sini karena
 * coop-closing.ts tak boleh ditambah export). Pola = W4.4
 * src/lib/shu.ts + W4.5a src/lib/coop-modal.ts (record*InTx + builder
 * spec murni, TxDb dari pemanggil; logAudit di route).
 */

import { postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';

/** Akun GL jasa (COA -- 2 kode; flip open W4.1). */
export const JASA_ACCT = {
  JASA: '3050', // SHU Jasa Anggota (pool dari coop_shu.jasa_anggota)
  SUKARELA: '2070', // Simpanan sukarela (jasa "dihitung di tabungan")
} as const;

/** Anggota aktif (id + nama) -- input hitung rata-rata. */
export type CoopJasaMember = { id: string; name: string };

/** Porsi per anggota (ORDER BY name COLLATE NOCASE). */
export type CoopJasaPerMember = { memberId: string; name: string; amount: number };

export type CoopJasaResult = {
  period: string;
  jasaTotal: number;
  perMember: CoopJasaPerMember[];
  entryId: string | null;
};

/**
 * Hari terakhir periode YYYY-MM (leap-aware: 2024-02 -> 2024-02-29;
 * 2026-12 -> 2026-12-31). Salinan kecil helper privat coop-closing.ts
 * (W4.5a; TAK diubah -- ruling W4.5b STEP 2).
 */
export function lastDayOfMonthIso(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error('coop_jasa:period_must_be_yyyymm');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // hari terakhir bln mo
  return period + '-' + String(dim).padStart(2, '0');
}

/**
 * Hitung porsi rata-rata Q5 (murni, teruji test suite): floor + sisa
 * deterministik. members = urutan NAMA (COLLATE NOCASE, dipilih route);
 * porsi[i] = floor(pool/N) + 1 bila i < pool%N. N = 0 / pool < 0 /
 * pool non-integer = throw galat (route 400).
 */
export function computeJasaPerMember(
  pool: number,
  members: CoopJasaMember[]
): CoopJasaPerMember[] {
  if (!Number.isInteger(pool) || pool < 0)
    throw new Error('coop_jasa:pool_must_be_nonnegative_int');
  if (members.length === 0) throw new Error('coop_jasa:no_active_members');
  const n = members.length;
  const base = Math.floor(pool / n);
  const r = pool % n;
  return members.map((m, i) => ({ memberId: m.id, name: m.name, amount: base + (i < r ? 1 : 0) }));
}


/**
 * Spesifikasi entry jasa (OQ9: SATU agregat per periode; OQ11:
 * entry_date = hari terakhir periode). 1 kaki D3050 (jasa_total) +
 * N kaki K2070 (source per anggota -- detail ada di coop_savings kind
 * 'jasa'). ref_id 'coop#jasa#<period>' (UNIQUE(ref_table,ref_id,type)
 * = backstop idempoten; pre-check utama = event-level di
 * recordCoopJasaInTx).
 */
export function buildCoopJasaSpec(input: {
  period: string;
  jasaTotal: number;
  perMember: CoopJasaPerMember[];
  entryDate: string;
  createdBy?: string | null;
}): JSpec {
  const lines: JLine[] = [
    {
      account_code: JASA_ACCT.JASA,
      debit: input.jasaTotal,
      credit: 0,
      source: 'coop#jasa#' + input.period + ':3050',
    },
    ...input.perMember.map(
      (m): JLine => ({
        account_code: JASA_ACCT.SUKARELA,
        debit: 0,
        credit: m.amount,
        source: 'coop#jasa#' + input.period + '#' + m.memberId,
      })
    ),
  ];
  return {
    id: 'JE-coopjasa-' + input.period,
    ref_table: 'coop',
    ref_id: 'coop#jasa#' + input.period,
    entry_date: input.entryDate,
    type: 'auto',
    desc:
      'Jasa per anggota periode ' +
      input.period +
      ': ' +
      input.jasaTotal +
      ' (N ' +
      input.perMember.length +
      ' anggota)',
    created_by: input.createdBy ?? undefined,
    lines,
  };
}

/**
 * Bagi jasa per anggota untuk SATU periode (route -> tx pemanggil).
 * Semua tulis via TxDb -- atomik dgn logAudit (pola W2.7/W3.3/W4.4).
 * Urutan langkah (di dalam tx):
 *  1. validasi periode (YYYY-MM; 'coop_jasa:...' -> route 400);
 *  2. pre-check event-level: baris kind 'jasa' saved_at = akhir periode
 *     sudah ada -> 'JASA_PERIOD_EXISTS' (route 409; OQ15 gl-off pun
 *     terdeteksi -- tidak bergantung jurnal, OQ16);
 *  3. pool = coop_shu.jasa_anggota periode: baris tak ada ->
 *     'JASA_SHU_MISSING' (route 404); pool <= 0 -> 'JASA_NO_POOL'
 *     (route 400, OQ10);
 *  4. N = anggota status 'aktif' (ORDER BY name COLLATE NOCASE):
 *     N = 0 -> 'JASA_NO_ACTIVE' (route 400, OQ4/OQ10);
 *  5. hitung porsi rata-rata (Q5) -> INSERT N baris coop_savings
 *     kind 'jasa' (amount = porsi, saved_at = akhir periode, OQ6/OQ11);
 *  6. gl-on: SATU jurnal agregat D3050 -> K2070 (OQ9; OQ15: gl-off =
 *     baris saja, entryId null).
 *
 * @throws 'coop_jasa:...' (400 validasi), 'JASA_SHU_MISSING' (404),
 * 'JASA_NO_POOL' / 'JASA_NO_ACTIVE' (400), 'JASA_PERIOD_EXISTS' (409).
 */
export async function recordCoopJasaInTx(
  db: TxDb,
  input: { period: string; gl_enabled: boolean; createdBy?: string | null }
): Promise<CoopJasaResult> {
  const period = String(input.period ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('coop_jasa:period_must_be_yyyymm');
  const entryDate = lastDayOfMonthIso(period);
  // OQ15 (D1) + OQ16: guard duplikat tingkat EVENT (coop_savings),
  // bukan jurnal -- gl-off tetap terdeteksi.
  const dup = await db
    .prepare("SELECT 1 AS x FROM coop_savings WHERE kind = 'jasa' AND saved_at = ?")
    .get(entryDate);
  if (dup) throw new Error('JASA_PERIOD_EXISTS');
  const shuRow = (await db
    .prepare('SELECT jasa_anggota AS v FROM coop_shu WHERE period = ?')
    .get(period)) as { v: number | null } | undefined;
  if (!shuRow) throw new Error('JASA_SHU_MISSING');
  const pool = Number(shuRow.v) || 0;
  if (pool <= 0) throw new Error('JASA_NO_POOL');
  const members = (await db
    .prepare(
      "SELECT id, name FROM coop_members WHERE status = 'aktif' ORDER BY name COLLATE NOCASE"
    )
    .all()) as { id: string; name: string }[];
  if (members.length === 0) throw new Error('JASA_NO_ACTIVE');
  const perMember = computeJasaPerMember(pool, members);
  const ins = db.prepare(
    'INSERT INTO coop_savings (member_id, kind, amount, saved_at) VALUES (?, ?, ?, ?)'
  );
  for (const m of perMember) await ins.run(m.memberId, 'jasa', m.amount, entryDate);
  let entryId: string | null = null;
  if (input.gl_enabled === true) {
    entryId = await postJournalInTx(
      db,
      buildCoopJasaSpec({
        period,
        jasaTotal: pool,
        perMember,
        entryDate,
        createdBy: input.createdBy,
      })
    );
  }
  return { period, jasaTotal: pool, perMember, entryId };
}

