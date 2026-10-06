/**
 * W4.2 -- modul koperasi: engine simpanan (Sek.7.2 langkah 3 proposal;
 * skema v24 W4.1) + validasi ketat + pencatatan atomik pola W2.7/W3.2
 * (recordAkadEventInTx, lib/akad.ts).
 *
 * Dependensi runtime: jurnal.ts (postJournalInTx/nowWib) -- jurnal.ts
 * bebas-import (type-only), jadi modul ini tetap bisa diuji Node
 * (type-stripping) dgn SQLite in-memory: scripts/test-coop.ts C-suite.
 * TIDAK diimpor komponen client (modul server-side + test).
 *
 * Mapping Sek.7.2.3 (ref_table='coop'; akun flip open W4.1):
 *   setor    : D1010 -> K2050 (pokok) / K2060 (wajib) / K2070 (sukarela)
 *               per `kind`.
 *   tarik
 *   sukarela : D2070 -> K1010 (sisa >= 0 per anggota; ketentuan tarik
 *               = PKGF; app hanya cek sisa, bukan aturan PKGF).
 *   keluar   : D2050 -> K1010 (pokok kembali sesuai simpanan pokok;
 *               wajib/sukarela TIDAK dikembalikan -- literal
 *               Sek.7.2.3).
 *
 * Rancangan disetujui (ruling Gus Fi 6 Okt, Option A):
 *   - 0 preset: SEMUA nominal = input admin (PKGF 13.10 jumlah &
 *     jadwal simpanan wajib; PKGF 2.3 bobot jasa anggota = rata-rata,
 *     ruling Q5 W4.1). App = wadah pencatatan, bukan penentu
 *     besaran.
 *   - tarik sukarela dicatat sebagai baris NEGATIF
 *     (member_id,'sukarela',-n) di coop_savings; saldo = SUM
 *     aljabar; PK komposit (member_id,kind,saved_at,amount) tak
 *     bentrok (n vs -n beda baris); audit trail in/out satu tabel.
 *   - Guard: SUM('sukarela') - n >= 0, selain itu throw.
 *
 * ref_id (F1, ruling W3.1; per EVENT, deterministic utk
 * idempoten postJournalInTx via UNIQUE(ref_table,ref_id,type)):
 *   setor  : 'coop#<memberId>:sv#<savedAt>:<kind>@<amount>'
 *   tarik  : 'coop#<memberId>:wd#<savedAt>@<amount>'
 *   keluar : 'coop#<memberId>:exit#<changedAt>'
 *
 * D1 (pola W2.1/W2.7): event SELALU tercatat; auto-jurnal hanya saat
 * gl_enabled='1' (gl-off = zero GL behavior change; D6: tanpa
 * backfill). Idempoten: posting ulang ref sama = no-op
 * (kembalikan id entry yang ada).
 */

import { nowWib, postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';

/** Kind simpanan (kolom `kind` tabel coop_savings; Sek.7.1). */
export const COOP_KINDS = ['pokok', 'wajib', 'sukarela'] as const;
export type CoopKind = (typeof COOP_KINDS)[number];

/** Status anggota (kolom `status` tabel coop_members; Sek.7.1). */
export const COOP_STATUSES = ['aktif', 'nonaktif', 'keluar'] as const;
export type CoopStatus = (typeof COOP_STATUSES)[number];

/** Akun GL modul koperasi (COA -- 4 kode; flip open W4.1). */
export const COOP_ACCT = {
  KAS: '1010', // Kas Toko
  POKOK: '2050', // Simpanan Pokok
  WAJIB: '2060', // Simpanan Wajib
  SUKARELA: '2070', // Simpanan Sukarela
} as const;

/** Akun kredit setor per kind (Sek.7.2.3: D1010 -> K2050/2060/2070). */
export function coopKindAccount(kind: string): string {
  assertKind(kind);
  switch (kind) {
    case 'pokok':
      return COOP_ACCT.POKOK;
    case 'wajib':
      return COOP_ACCT.WAJIB;
    default:
      return COOP_ACCT.SUKARELA;
  }
}

/** Rupiah integer penuh (> 0; nilai pecahan di-bulat, <= 0 ditolak). */
export function coopValidateAmount(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  if (n <= 0) throw new Error('coop: amount harus positif (rupiah integer)');
  return n;
}

function assertKind(kind: string): asserts kind is CoopKind {
  if (!(COOP_KINDS as readonly string[]).includes(kind)) {
    throw new Error('coop: kind tidak dikenal: ' + String(kind));
  }
}

function assertStatus(status: string): asserts status is CoopStatus {
  if (!(COOP_STATUSES as readonly string[]).includes(status)) {
    throw new Error('coop: status tidak dikenal: ' + String(status));
  }
}

/** Rek member baru (id disuplai caller; status awal selalu 'aktif'). */
export interface CoopMemberRec {
  id: string;
  name: string;
  npwp?: string | null;
  /** ISO WIB (+07:00). */
  memberSince: string;
  /** Kolom rumpun (ruling Q4 W4.1; opsional). */
  rumpun?: string | null;
}

/** Rek setor simpanan (nominal = input admin, 0 preset). */
export interface CoopSavingsRec {
  memberId: string;
  kind: string;
  amount: number;
  /** ISO WIB; default nowWib(). */
  savedAt?: string;
  createdBy?: string | null;
  /** D1: true hanya saat settings.gl_enabled='1'. */
  gl_enabled?: boolean;
}

/** Rek tarik sukarela (negative guard: sisa sukarela >= 0). */
export interface CoopWithdrawRec {
  memberId: string;
  amount: number;
  savedAt?: string;
  createdBy?: string | null;
  gl_enabled?: boolean;
}

/** Rek anggota keluar (refund pokok D2050 -> K1010). */
export interface CoopKeluarRec {
  memberId: string;
  /** ISO WIB stempel peralihan status; default nowWib(). */
  changedAt?: string;
  createdBy?: string | null;
  gl_enabled?: boolean;
}

/** Rek perubahan status (tanpa jurnal). */
export interface CoopStatusRec {
  memberId: string;
  status: string;
}

/** Cek anggota ada; selain itu throw (DDL Sek.7.1 tanpa FK). */
async function assertMemberExists(db: TxDb, memberId: string): Promise<void> {
  const r = (await db
    .prepare('SELECT 1 ok FROM coop_members WHERE id = ?')
    .get(memberId)) as { ok: number } | undefined;
  if (!r) throw new Error('coop: anggota tidak ditemukan: ' + String(memberId));
}

/**
 * Membuat anggota (INSERT coop_members; UNIQUE(name) clash -> throw).
 * TIDAK ada jurnal (Sek.7.2 tak mendefinisikan posting pembuatan).
 * Status awal selalu 'aktif'. (DDL v24: tanpa kolom created_by --
 * literal Sek.7.1; audit trail dibuat lewat jurnal ref_table='coop'.)
 */
export async function createCoopMemberInTx(
  db: TxDb,
  rec: CoopMemberRec
): Promise<void> {
  const id = String(rec.id ?? '').trim();
  const name = String(rec.name ?? '').trim();
  if (!id) throw new Error('coop: id anggota wajib diisi');
  if (!name) throw new Error('coop: nama anggota wajib diisi');
  await db
    .prepare(
      'INSERT INTO coop_members (id, name, npwp, member_since, status, rumpun) ' +
        'VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, name, rec.npwp ?? null, rec.memberSince, 'aktif', rec.rumpun ?? null);
}

/**
 * Mengubah status anggota (aktif <-> nonaktif bebas; keluar TERMINAL
 * -- tak bisa kembali; status sama = no-op). Tanpa jurnal. Anggota
 * keluar diproses via recordCoopMemberKeluarInTx (refund pokok +
 * guard terminal).
 */
export async function setCoopMemberStatusInTx(
  db: TxDb,
  rec: CoopStatusRec
): Promise<void> {
  await assertMemberExists(db, rec.memberId);
  assertStatus(rec.status);
  const cur = ((await db
    .prepare('SELECT status s FROM coop_members WHERE id = ?')
    .get(rec.memberId)) as { s: string })?.s;
  if (cur === rec.status) return;
  if (cur === 'keluar') {
    throw new Error(
      'coop: status keluar terminal -- anggota tidak dapat dikembalikan ke ' +
        rec.status
    );
  }
  await db
    .prepare('UPDATE coop_members SET status = ? WHERE id = ?')
    .run(rec.status, rec.memberId);
}


/**
 * Spesifikasi entry setor (Sek.7.2.3: D1010 -> K2050/2060/2070 per
 * kind; type='auto', ref_table='coop').
 */
export function coopSavingsJournalFor(rec: CoopSavingsRec): JSpec {
  const amt = coopValidateAmount(rec.amount);
  const src = 'coop#' + rec.memberId + ':setor';
  const lines: JLine[] = [
    { account_code: COOP_ACCT.KAS, debit: amt, credit: 0, source: src },
    { account_code: coopKindAccount(rec.kind), debit: 0, credit: amt, source: src },
  ];
  const savedAt = rec.savedAt ?? nowWib();
  return {
    id: 'JE-coopsv-' + rec.memberId + '-' + savedAt + '-' + rec.kind,
    ref_table: 'coop',
    ref_id:
      'coop#' +
      rec.memberId +
      ':sv#' +
      savedAt +
      ':' +
      rec.kind +
      '@' +
      amt,
    entry_date: savedAt,
    type: 'auto',
    desc: 'Setor simpanan ' + rec.kind + ' anggota ' + rec.memberId + ' ' + amt,
    created_by: rec.createdBy ?? undefined,
    lines,
  };
}

/**
 * Setor simpanan per kind (Sek.7.2.3). Atomik DI DALAM tx pemanggil:
 * INSERT coop_savings (amount positif) -> (gl_on) auto-posting
 * D1010 -> K205x via postJournalInTx. Idempoten: posting ulang ref
 * sama = no-op (kembalikan id entry yang ada). Mengembalikan entryId
 * (null bila gl-off / tak dipost).
 */
export async function recordCoopSavingsInTx(
  db: TxDb,
  rec: CoopSavingsRec
): Promise<{ entryId: string | null }> {
  await assertMemberExists(db, rec.memberId);
  assertKind(rec.kind); // validasi selalu (termasuk gl-off, D1)
  const amt = coopValidateAmount(rec.amount);
  const savedAt = rec.savedAt ?? nowWib();
  await db
    .prepare('INSERT INTO coop_savings (member_id, kind, amount, saved_at) VALUES (?, ?, ?, ?)')
    .run(rec.memberId, rec.kind, amt, savedAt);
  if (rec.gl_enabled !== true) return { entryId: null };
  const entryId = await postJournalInTx(db, coopSavingsJournalFor(rec));
  return { entryId };
}

/**
 * Spesifikasi entry tarik sukarela (Sek.7.2.3: D2070 -> K1010;
 * nominal POSITIF n walau baris coop_savings negatif -n).
 */
export function coopWithdrawJournalFor(rec: CoopWithdrawRec): JSpec {
  const amt = coopValidateAmount(rec.amount);
  const src = 'coop#' + rec.memberId + ':tarik';
  const lines: JLine[] = [
    { account_code: COOP_ACCT.SUKARELA, debit: amt, credit: 0, source: src },
    { account_code: COOP_ACCT.KAS, debit: 0, credit: amt, source: src },
  ];
  const savedAt = rec.savedAt ?? nowWib();
  return {
    id: 'JE-coopwd-' + rec.memberId + '-' + savedAt + '-' + amt,
    ref_table: 'coop',
    ref_id: 'coop#' + rec.memberId + ':wd#' + savedAt + '@' + amt,
    entry_date: savedAt,
    type: 'auto',
    desc: 'Tarik sukarela anggota ' + rec.memberId + ' ' + amt,
    created_by: rec.createdBy ?? undefined,
    lines,
  };
}

/**
 * Tarik sukarela (Sek.7.2.3; Option A ruling 6 Okt): INSERT baris
 * NEGATIF (member_id,'sukarela',-n); guard sisa = SUM('sukarela')
 * (sisa - n < 0 -> throw). (gl_on) auto-posting D2070 -> K1010 dgn
 * nominal n. Idempoten seperti recordCoopSavingsInTx.
 */
export async function recordCoopWithdrawInTx(
  db: TxDb,
  rec: CoopWithdrawRec
): Promise<{ entryId: string | null }> {
  await assertMemberExists(db, rec.memberId);
  const amt = coopValidateAmount(rec.amount);
  const r = (await db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) s FROM coop_savings WHERE member_id = ? AND kind = 'sukarela'"
    )
    .get(rec.memberId)) as { s: number };
  if (r.s - amt < 0) {
    throw new Error(
      'coop: tarik sukarela melebihi sisa (sisa ' +
        r.s +
        ', diminta ' +
        amt +
        ')'
    );
  }
  const savedAt = rec.savedAt ?? nowWib();
  await db
    .prepare('INSERT INTO coop_savings (member_id, kind, amount, saved_at) VALUES (?, ?, ?, ?)')
    .run(rec.memberId, 'sukarela', -amt, savedAt);
  if (rec.gl_enabled !== true) return { entryId: null };
  const entryId = await postJournalInTx(db, coopWithdrawJournalFor(rec));
  return { entryId };
}

/** Saldo aljabar (SUM amount, termasuk baris negatif) per anggota. */
export async function coopSavingsBalance(
  db: TxDb,
  memberId: string,
  kind?: string
): Promise<number> {
  const r = (await db
    .prepare(
      'SELECT COALESCE(SUM(amount), 0) s FROM coop_savings WHERE member_id = ?' +
        (kind ? " AND kind = ?" : '')
    )
    .get(...(kind ? [memberId, kind] : [memberId]))) as { s: number };
  return Math.round(Number(r?.s ?? 0));
}

/**
 * Anggota KELUAR (Sek.7.2.3: pokok kembali D2050 -> K1010 sesuai
 * simpanan pokok; wajib/sukarela TIDAK dikembalikan). Guard: status
 * asal aktif/nonaktif; sudah 'keluar' = no-op (TIDAK ada refund
 * kedua -- idempoten). Refund hanya saat gl_on & pokok > 0.
 */
export async function recordCoopMemberKeluarInTx(
  db: TxDb,
  rec: CoopKeluarRec
): Promise<{ entryId: string | null }> {
  await assertMemberExists(db, rec.memberId);
  const cur = ((await db
    .prepare('SELECT status s FROM coop_members WHERE id = ?')
    .get(rec.memberId)) as { s: string })?.s;
  if (cur === 'keluar') return { entryId: null };
  const changedAt = rec.changedAt ?? nowWib();
  await db
    .prepare('UPDATE coop_members SET status = ? WHERE id = ?')
    .run('keluar', rec.memberId);
  const pokok = await coopSavingsBalance(db, rec.memberId, 'pokok');
  if (rec.gl_enabled !== true || pokok <= 0) return { entryId: null };
  const src = 'coop#' + rec.memberId + ':keluar';
  const spec: JSpec = {
    id: 'JE-coopexit-' + rec.memberId + '-' + changedAt,
    ref_table: 'coop',
    ref_id: 'coop#' + rec.memberId + ':exit#' + changedAt,
    entry_date: changedAt,
    type: 'auto',
    desc: 'Anggota keluar -- refund pokok ' + rec.memberId + ' ' + pokok,
    created_by: rec.createdBy ?? undefined,
    lines: [
      { account_code: COOP_ACCT.POKOK, debit: pokok, credit: 0, source: src },
      { account_code: COOP_ACCT.KAS, debit: 0, credit: pokok, source: src },
    ],
  };
  const entryId = await postJournalInTx(db, spec);
  return { entryId };
}

