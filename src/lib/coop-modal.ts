/**
 * W4.5a -- modul koperasi: modal anggota (Modal 3010; Sek.3.2.2 proposal;
 * ruling Gus Fi 7 Okt 2026, audit STEP 2 W4.5).
 *
 * Setoran modal = penyertaan ke modal KOPERASI (kekuatan kooperasi; tidak
 * berisiko; hak bersama, TIDAK bisa didistribusikan per anggota). Dicatat
 * di coop_savings kind 'modal' (PK komposit (member_id,kind,saved_at,
 * amount) aman) + (gl-on) SATU jurnal:
 *   D 1010 (kas, uang masuk) -> K 3010 (modal, ekuitas)
 * D1 (pola W4.2/W4.4): event SELALU tercatat; auto-jurnal hanya saat
 * gl_enabled='1' (gl-off = tanpa jurnal).
 *
 * ref_id (DeepSeek W4.5a ADDITIONAL NOTE 1: tambah uuid, karena
 * nowWib()/savedAt graining TIDAK unik -- saved_at UI = date-only;
 * dua event beda dgn anggota+tanggal+nominal sama tak mungkin lewat
 * PK komposit, jadi uuid membuat ref jurnal per-EVENT unik tanpa
 * membuka celah duplikat):
 *   modal : 'coop#<memberId>:md#<savedAt>@<amount>#<uuid>'
 * Idempotensi event-pakai-same: PK komposit coop_savings adalah
 * guard (pre-check -> COOP_MODAL_DUPLICATE, route 409) -- bukan
 * UNIQUnya ref jurnal.
 *
 * File lib BARU (ruling W4.5: engine src/lib/coop.ts TAK DISENTUH;
 * semua kode baru W4.5 di file lib baru). Pola = W4.4 src/lib/shu.ts
 * (record*InTx + builder spec murni, tanpa state modul, TxDb dari
 * pemanggil; logAudit di route).
 */

import crypto from 'node:crypto';
import { nowWib, postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';
import { coopValidateAmount } from './coop.ts';

/** Akun GL modal (COA -- 2 kode; flip open W4.1). */
export const COOP_MODAL_ACCT = {
  KAS: '1010', // Kas Toko (uang modal masuk)
  MODAL: '3010', // Modal (penyertaan anggota; ekuitas non-distribusi)
} as const;

/** Catatan setoran modal anggota (route -> recordCoopModalInTx). */
export type CoopModalRec = {
  memberId: string;
  /** Rupiah integer (kovalidasi; > 0). */
  amount: unknown;
  /** YYYY-MM-DD (default hari ini WIB; bagian PK komposit). */
  savedAt?: string;
  /** Uniq per event (default crypto.randomUUID()); bagian ref_id. */
  uuid?: string;
  gl_enabled: boolean;
  createdBy?: string | null;
};

/** Jurnal modal (murni, teruji test suite): D1010 -> K3010. */
export function buildCoopModalSpec(rec: CoopModalRec, amt: number, uuid: string): JSpec {
  const savedAt = rec.savedAt ?? nowWib();
  const lines: JLine[] = [
    { account_code: COOP_MODAL_ACCT.KAS, debit: amt, credit: 0, source: 'modal kas' },
    {
      account_code: COOP_MODAL_ACCT.MODAL,
      debit: 0,
      credit: amt,
      source: 'modal ' + rec.memberId + ' ' + amt,
    },
  ];
  return {
    id: 'JE-coopmodal-' + rec.memberId + '-' + uuid,
    ref_table: 'coop',
    ref_id: 'coop#' + rec.memberId + ':md#' + savedAt + '@' + amt + '#' + uuid,
    entry_date: savedAt,
    type: 'auto',
    desc: 'Modal anggota ' + rec.memberId + ' ' + amt,
    created_by: rec.createdBy ?? undefined,
    lines,
  };
}

async function assertCoopMemberExists(db: TxDb, memberId: string): Promise<void> {
  const r = await db.prepare('SELECT 1 AS x FROM coop_members WHERE id = ?').get(memberId);
  if (!r) throw new Error('COOP_MEMBER_NOT_FOUND');
}

/**
 * Catat setoran modal anggota (route -> 404 anggota tak ada; 409 event
 * duplikat; 400 validasi nominal). INSERT baris kind 'modal' di
 * coop_savings + postJournalInTx (hanya saat gl_enabled). Semua tulis
 * via TxDb pemanggil -- atomik dgn logAudit (pola W2.7/W3.3/W4.4).
 *
 * Throw: COOP_MEMBER_NOT_FOUND (404), COOP_MODAL_DUPLICATE (409, event
 * sama = member+tanggal+nominal sudah tercatat), 'coop: amount ...'
 * (400 validasi, pola coop.ts W4.2).
 */
export async function recordCoopModalInTx(
  db: TxDb,
  rec: CoopModalRec
): Promise<{ entryId: string | null; uuid: string }> {
  await assertCoopMemberExists(db, rec.memberId);
  const amt = coopValidateAmount(rec.amount);
  const savedAt = rec.savedAt ?? nowWib();
  const uuid = rec.uuid ?? crypto.randomUUID();
  // Event duplikat (M5): PK komposit (member_id,kind,saved_at,amount)
  // -- retry event yang sama = 409, bukan baris/jurnal kedua.
  const dup = await db
    .prepare(
      "SELECT 1 AS x FROM coop_savings WHERE member_id = ? AND kind = 'modal' AND saved_at = ? AND amount = ?"
    )
    .get(rec.memberId, savedAt, amt);
  if (dup) throw new Error('COOP_MODAL_DUPLICATE');
  await db
    .prepare('INSERT INTO coop_savings (member_id, kind, amount, saved_at) VALUES (?, ?, ?, ?)')
    .run(rec.memberId, 'modal', amt, savedAt);
  if (rec.gl_enabled !== true) return { entryId: null, uuid };
  const entryId = await postJournalInTx(db, buildCoopModalSpec(rec, amt, uuid));
  return { entryId, uuid };
}
