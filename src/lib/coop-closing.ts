/**
 * W4.5a -- modul koperasi: jurnal closing periode (Sek.3.2.6 proposal;
 * ruling Gus Fi 7 Okt 2026, audit STEP 2 W4.5: OQ1/OQ2/OQ9/OQ10 +
 * F-flag1/2/3).
 *
 * Nol-kan net akun laba-rugi ke 3020 (SHU Ditahan):
 *  - Subset OQ1 (literal ruling): laba = net 4010/4020/4030; rugi =
 *    net 5010/5020/5030/5040. EKSKLUSIF: 4040 (ujrah konsinyasi,
 *    F-flag1) & 4090 (ZIS -- bukan akun P&L yang dinol-kan).
 *  - Kumulatif (F-flag2 APPROVED): net = SUM(debit/credit) SELURUH
 *    riwayat GL, TIDAK ber-window per bulan. Efek: self-healing --
 *    closing periode N mencakup seluruh aktivitas, dan closing periode
 *    berikutnya hanya menutup aktivitas BARU (legs net-0 otomatis
 *    gugur, OQ9). Re-closing = menutup selisih, bukan duplikat.
 *  - OQ2: 3020 BOLEH NEGATIF saat rugi (jurnal D3020) -- tanpa clamp.
 *  - OQ10: 2080 (SHU anggota) belum ada di skema v24 -- closing
 *    1-ke-1 dgn 3020; 2080 tetap pending (W4.5b).
 *  - F-flag3: re-closing SETELAH pembalikan manual = jurnal manual
 *    /admin/jurnal di v1; fitur v2.
 *
 * SATU jurnal per periode, type='closing', entry_date = hari TERAKHIR
 * periode (OQ9):
 *  - laba: legs D<akun P&L net!=0> + K3020 = total laba
 *  - rugi: legs C<akun P&L net!=0> + D3020 = total rugi
 * Idempoten via UNIQUE(ref_table, ref_id, type): 1 periode = 1 closing
 * (ref_id 'coop#closing#<period>'); re-post = no-op.
 *
 * File lib BARU (ruling W4.5: engine src/lib/coop.ts TAK DISENTUH).
 * Pola = src/lib/shu.ts (murni, TxDb dari pemanggil; logAudit di
 * route). Pre-check CLOSING_NO_ACTIVITY (DeepSeek ADDITIONAL NOTE 2):
 * periode tanpa aktivitas P&L (semua net = 0) -> 400, bukan jurnal
 * kosong (postJournalInTx menolak 0 legs).
 */

import { postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';

/** Akun P&L subset yang dinol-kan (OQ1; 4040 & 4090 TIDAK -- F-flag1). */
export const CLOSING_PNL_CODES = [
  '4010',
  '4020',
  '4030',
  '5010',
  '5020',
  '5030',
  '5040',
] as const;

/** Target closing (SHU Ditahan; 2080 = W4.5b, OQ10). */
export const CLOSING_TARGET = '3020';

export type ClosingLeg = { code: string; debit: number; credit: number; net: number };

/** Hasil hitung closing: shu > 0 = laba, shu < 0 = rugi (OQ2). */
export type ClosingCompute = { profit: boolean; shu: number; legs: ClosingLeg[] };

/** Validasi periode YYYY-MM (lembur route 400; testable). */
export function validateClosingPeriod(v: unknown): string {
  const p = String(v ?? '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) throw new Error('CLOSING_PERIOD_INVALID');
  return p;
}

/** Hari terakhir periode (OQ9: entry_date = hari terakhir). */
export function closingEntryDate(period: string): string {
  const [y, m] = validateClosingPeriod(period).split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return period + '-' + String(last).padStart(2, '0');
}

/**
 * Hitung legs closing utk `period` dari GL KUMULATIF (F-flag2): net
 * per akun = SUM(credit)-SUM(debit) SELURUH riwayat (tanpa filter
 * tanggal); legs hanya utk akun net != 0 (OQ9) + legs 3020 (sisi laba
 * = K3020, sisi rugi = D3020, OQ2). D=K terjamin: SUM legs = 0.
 */
export async function computeClosingLegs(d: TxDb, period: string): Promise<ClosingCompute> {
  const p = validateClosingPeriod(period);
  const inList = CLOSING_PNL_CODES.map(() => '?').join(',');
  const rows = await d
    .prepare(
      'SELECT jl.account_code, COALESCE(SUM(jl.debit), 0) d, COALESCE(SUM(jl.credit), 0) c ' +
        'FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id ' +
        'WHERE jl.account_code IN (' +
        inList +
        ') GROUP BY jl.account_code'
    )
    .all(...CLOSING_PNL_CODES);
  // Net per akun: credit - debit (positif = saldo kredit = laba-like;
  // negatif = saldo debit = beban-like).
  let shu = 0;
  const legs: ClosingLeg[] = [];
  for (const r of rows as { account_code: string; d: number; c: number }[]) {
    const n = Math.round(Number(r.c || 0)) - Math.round(Number(r.d || 0));
    if (n === 0) continue; // OQ9: legs net-0 ditiada
    shu += n;
    legs.push({ code: r.account_code, debit: n > 0 ? n : 0, credit: n > 0 ? 0 : -n, net: n });
  }
  if (shu !== 0) {
    legs.push({
      code: CLOSING_TARGET,
      debit: shu < 0 ? -shu : 0,
      credit: shu > 0 ? shu : 0,
      net: shu,
    });
  }
  return { profit: shu > 0, shu, legs };
}

/** JSpec closing (murni, teruji test suite). entry_date = akhir periode. */
export function buildClosingSpec(period: string, calc: ClosingCompute, createdBy: string | null): JSpec {
  const p = validateClosingPeriod(period);
  const lines: JLine[] = calc.legs.map((l) => ({
    account_code: l.code,
    debit: l.debit,
    credit: l.credit,
    source: 'closing ' + p,
  }));
  const desc =
    'Jurnal closing ' +
    p +
    ': ' +
    (calc.shu >= 0 ? 'laba ' + calc.shu : 'rugi ' + -calc.shu) +
    ' -> ' +
    CLOSING_TARGET;
  return {
    id: 'JE-closing-' + p,
    ref_table: 'coop',
    ref_id: 'coop#closing#' + p,
    entry_date: closingEntryDate(p),
    type: 'closing',
    desc,
    created_by: createdBy ?? undefined,
    lines,
  };
}

/**
 * Posting jurnal closing utk `period` (route -> 409 closing sudah ada;
 * 400 periode tak valid / tak ada aktivitas; 500 tak terduga).
 * Pre-check CLOSING_NO_ACTIVITY (DeepSeek ADDITIONAL NOTE 2): semua net
 * = 0 -> TIDAK ada jurnal (postJournalInTx menolak 0 legs), route 400.
 * Idempoten: re-post spec sama = no-op (ref_id unik per periode).
 * GL-off: compute tetap, entryId = null (tanpa jurnal).
 *
 * Throw: CLOSING_PERIOD_INVALID (400), CLOSING_PERIOD_EXISTS (409),
 * CLOSING_NO_ACTIVITY (400).
 */
export async function postCoopClosingInTx(
  d: TxDb,
  p: { period: string; glEnabled: boolean; createdBy: string | null }
): Promise<{ period: string; shu: number; profit: boolean; entryId: string | null; gl: boolean }> {
  const period = validateClosingPeriod(p.period);
  const ex = await d
    .prepare(
      "SELECT 1 AS x FROM journal_entries WHERE ref_table = 'coop' AND ref_id = ? AND type = 'closing'"
    )
    .get('coop#closing#' + period);
  if (ex) throw new Error('CLOSING_PERIOD_EXISTS');
  const calc = await computeClosingLegs(d, period);
  if (calc.legs.length === 0) throw new Error('CLOSING_NO_ACTIVITY');
  let entryId: string | null = null;
  if (p.glEnabled) entryId = await postJournalInTx(d, buildClosingSpec(period, calc, p.createdBy));
  return { period, shu: calc.shu, profit: calc.profit, entryId, gl: p.glEnabled };
}

