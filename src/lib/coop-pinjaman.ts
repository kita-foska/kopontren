/**
 * W5.1 (PINJ-1) -- engine pinjaman anggota koperasi (QARDH, F3.2 #5):
 * pencairan (pinjam) + pelunasan (bayar = lunas SEKALIGUS, tashih OQ9-1).
 * Modul mandiri ala coop-modal.ts: SATU transaksi atomik op + logAudit
 * (dilakukan caller/route), state penuh di DB, TAK ADA state modul.
 *
 * Ruling/tashih (W5.1, skema v27):
 * - OQ7: akun COA 1130 'Piutang Anggota (Koperasi)' (BUKAN 1030 -- 1030
 *   Piutang Penjualan tetap live di jurnal/akad/posisi; tak dipakai modul
 *   ini). GL saat gl-on: pinjam D 1130 -> K 1010; bayar D 1010 -> K 1130.
 * - OQ8: denda bila lewat jatuh tempo = SADAQAH manual input, HANYA
 *   dicatat di kolom catatan pinjaman (MEMO, F3.3 #6: tak pernah jadi
 *   pendapatan) -- TIDAK ada kaki jurnal (tak ada akun 5xxx/ZIS).
 * - OQ9: semua YA: bayar sekaligus; pinjam ganda diizinkan; pinjaman tetap
 *   aktif walau anggota keluar; tabel di coop_members (member_id);
 *   sadaqah input manual (tanpa rumus).
 * - Qardh = kebajikan: margin 0 selamanya; jumlah utuh kembali (pokok).
 *
 * 0 emoji/unicode; semua label/definisi bahasa Indonesia.
 */
import { nowWib, postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';
import { coopValidateAmount } from './coop.ts';

/** Akun piutang qardh (OQ7: 1130, BUKAN 1030 Piutang Penjualan). */
export const COOP_PINJAMAN_ACCT = '1130';
/** Kas koperasi (kontra 1010, konsisten W2.4/W3.1). */
export const COOP_PINJAMAN_CASH_ACCT = '1010';

export interface CoopLoanInput {
  /** uuid pinjaman (caller = route; kunci ref_id jurnal idempoten). */
  id: string;
  /** Anggota tujuan (route cek eksistensi -> 404 pinjaman_member_not_found). */
  memberId: string;
  /** Pokok (rupiah integer > 0) -- jumlah yang HARI INI dibayar (qardh:
   *  kembali utuh, margin = 0). */
  pokok: number;
  /** Tanggal mulai (YYYY-MM-DD WIB; default hari ini bila route tak kirim). */
  tanggalMulai: string;
  /** Jatuh tempo (YYYY-MM-DD WIB; wajib -- tanpa default; >= tanggalMulai). */
  tanggalJatuh: string;
  /** Catatan bebas (opsional). */
  catatan: string | null;
  /** User yang mencatat (logAudit / created_by jurnal). */
  createdBy: string;
  /** W4.3: true = auto-jurnal D 1130 -> K 1010; false = tercatat tanpa jurnal. */
  gl_enabled: boolean;
  /** Timestamp pencatatan (default nowWib()); hanya utk jurnal. */
  createdAt?: string;
}

/** Jurnal pencairan qardh (murni, teruji suite): D 1130 -> K 1010.
 *  Qardh tanpa margin: jumlah utuh kembali, margin = 0 selamanya. */
export function buildCoopLoanDisbursementSpec(inp: CoopLoanInput, pokok: number): JSpec {
  const createdAt = inp.createdAt ?? nowWib();
  const lines: JLine[] = [
    {
      account_code: COOP_PINJAMAN_ACCT,
      debit: pokok,
      credit: 0,
      source: 'pinjaman qardh ' + inp.memberId + ' ' + pokok,
    },
    {
      account_code: COOP_PINJAMAN_CASH_ACCT,
      debit: 0,
      credit: pokok,
      source: 'kas keluar qardh ' + inp.memberId + ' ' + pokok,
    },
  ];
  return {
    id: 'JE-cooppinjaman-pnj-' + inp.id,
    ref_table: 'coop',
    ref_id: 'coop#' + inp.memberId + ':pnj#' + inp.id,
    entry_date: createdAt,
    type: 'auto',
    desc: 'Pinjaman qardh W5.1: pokok ' + pokok + ' ke anggota ' + inp.memberId,
    created_by: inp.createdBy || undefined,
    lines,
  };
}

/** op pinjam: insert pinjaman + (gl-on) jurnal pencairan; 1 transaksi. */
export async function recordCoopLoanInTx(
  db: TxDb,
  in_: CoopLoanInput
): Promise<{ entryId: string | null }> {
  // Validasi nominal (pola coop.ts W4.2: throw galat).
  const pokok = coopValidateAmount(in_.pokok);

  await db
    .prepare(
      `INSERT INTO coop_pinjaman (
        id, member_id, akad, margin, pokok, sisa, tanggal_mulai, tanggal_jatuh_tempo,
        status, catatan, created_by, created_at
      ) VALUES (?, ?, 'qardh', 0, ?, ?, ?, ?, 'aktif', ?, ?, ?)`
    )
    .run(
      in_.id,
      in_.memberId,
      pokok,
      pokok,
      in_.tanggalMulai,
      in_.tanggalJatuh,
      in_.catatan,
      in_.createdBy,
      in_.createdAt ?? nowWib()
    );

  if (in_.gl_enabled !== true) return { entryId: null };
  const entryId = await postJournalInTx(db, buildCoopLoanDisbursementSpec(in_, pokok));
  return { entryId };
}

export interface CoopLoanPayInput {
  /** id pinjaman (route cek eksistensi -> 404 pinjaman_not_found). */
  id: string;
  /** Anggota pemilik pinjaman (ref_id jurnal; tak di-cek ulang). */
  memberId: string;
  /** Sisa belum dilunasi (rupiah) -- nominal jurnal D 1010 / K 1130. */
  sisa: number;
  /** Catatan final (termasuk memo denda sadaqah bila diisi; OQ8). */
  catatan: string | null;
  createdBy: string;
  gl_enabled: boolean;
}

/** Jurnal pelunasan qardh (murni, teruji suite): D 1010 -> K 1130.
 *  Sadaqah/denda TIDAK masuk jurnal (F3.3 #6, OQ8) -- memo di catatan saja. */
export function buildCoopLoanPaybackSpec(inp: CoopLoanPayInput, sisa: number): JSpec {
  const lines: JLine[] = [
    {
      account_code: COOP_PINJAMAN_CASH_ACCT,
      debit: sisa,
      credit: 0,
      source: 'kas masuk lunas qardh ' + inp.memberId + ' ' + sisa,
    },
    {
      account_code: COOP_PINJAMAN_ACCT,
      debit: 0,
      credit: sisa,
      source: 'lunas qardh ' + inp.memberId + ' ' + sisa,
    },
  ];
  return {
    id: 'JE-cooppinjaman-byr-' + inp.id,
    ref_table: 'coop',
    ref_id: 'coop#' + inp.memberId + ':byr#' + inp.id,
    entry_date: nowWib(),
    type: 'auto',
    desc: 'Pelunasan pinjaman qardh W5.1 lunas sekaligus: ' + sisa,
    created_by: inp.createdBy || undefined,
    lines,
  };
}

/** op bayar: lunas SEKALIGUS (OQ9-1) -- sisa -> 0 + status 'lunas' +
 *  (gl-on) jurnal D 1010 -> K 1130. Guard status='aktif' membuat op
 *  idempoten: pelunasan ganda = PINJAMAN_NOT_ACTIVE (route -> 409). */
export async function closeCoopLoanInTx(
  db: TxDb,
  in_: CoopLoanPayInput
): Promise<{ entryId: string | null }> {
  const r = await db
    .prepare(
      `UPDATE coop_pinjaman
       SET sisa = 0, status = 'lunas', catatan = ?
       WHERE id = ? AND status = 'aktif'`
    )
    .run(in_.catatan, in_.id);
  if (Number((r as { changes?: unknown }).changes ?? 0) !== 1)
    throw new Error('PINJAMAN_NOT_ACTIVE (sudah lunas / tak ditemukan)');

  if (in_.gl_enabled !== true || in_.sisa <= 0) return { entryId: null };
  const entryId = await postJournalInTx(db, buildCoopLoanPaybackSpec(in_, in_.sisa));
  return { entryId };
}
