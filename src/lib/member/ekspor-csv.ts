/**
 * P3c -- Builder CSV "Unduh Data Saya" (sisi pengguna, SELF-SCOPE).
 *
 * Modul utk endpoint GET /api/members/ekspor (jenis = poin | transaksi |
 * koperasi): string query per jenis (self-scope: user HANYA bisa mengambil
 * data kartu sendiri) + pembangun CSV (BOM, escape, header Indonesia,
 * tanggal WIB, nama file). Query diletakkan di sini (satu sumber utk
 * route + test scope) sehingga "user A tak bisa unduh data user B" teruji
 * di level SQL (scripts/test-member-export.ts).
 *
 * Hermetis utk test Node (scripts/test-member-export.ts): TIDAK ada
 * impor alias @/; satu-satunya impor = isoToWib dari modul murni
 * zakat-period.ts (relatif, pola import .ts test-brand-sync.ts).
 * Duplikasi label REASON/PAY di bawah disengaja (pola P3d: modul
 * hermetis tanpa dependensi runtime; sumber aslinya = src/lib/points.ts
 * dan src/lib/pay-methods.ts).
 *
 * Tanpa emoji/unicode (teks CSV = ASCII; BOM ditulis escape '\uFEFF').
 * Batas baris: TIDAK ADA (keputusan D3 -- data per-member kecil).
 */
import { isoToWib } from '../zakat-period.ts';

/** Tiga jenis unduhan valid (guard 400 di route). */
export type EksporJenis = 'poin' | 'transaksi' | 'koperasi';
export const EKSPOR_JENIS: readonly EksporJenis[] = ['poin', 'transaksi', 'koperasi'];

/** Baris ledger poin/reward (DB: point_history). */
export interface EksporPoinRow {
  member_id: number;
  delta: number;
  reason: string;
  amount: number;
  sale_id: number | null;
  created_at: string;
}

/** Baris transaksi saya (DB: sales). */
export interface EksporTransaksiRow {
  id: number;
  member_id: number;
  total: number;
  pay_method: string;
  status: string;
  member_points: number;
  created_at: string;
}

/** Baris pinjaman koperasi saya (DB: coop_pinjaman). */
export interface EksporKoperasiRow {
  id: string;
  member_id: string;
  akad: string;
  pokok: number;
  sisa: number;
  tanggal_mulai: string;
  tanggal_jatuh_tempo: string;
  status: string;
  catatan: string | null;
}

/** Query siap-eksekusi (sql + args) -- satu sumber utk route & test. */
export interface EksporQuery {
  sql: string;
  args: (string | number)[];
}

/** Hasil build: CSV utuh (sudah BOM di depan) + nama file disarankan. */
export interface EksporHasil {
  csv: string;
  filename: string;
}

/** BOM CSV utk Excel (pola P3d / riwayat zakat). */
export const CSV_BOM = '\uFEFF';

/** Escape CSV: field mengandung " , atau baris-baru -> kutip; " digandakan
 * (pola route riwayat zakat). null/undefined -> string kosong. */
export function csvEscape(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Label mirror (duplikat sengaja -- hermetis tanpa impor @/)

/** Mirror POINT_REASON_LABEL (src/lib/points.ts); key tak dikenal -> uppercase. */
const REASON_LABEL: Record<string, string> = {
  earn: 'Poin Masuk',
  redeem: 'Tukar Poin',
  void: 'Poin Dibatalkan',
  refund: 'Tukar Dikembalikan',
  cashback: 'Reward Masuk',
  cashback_use: 'Reward Terpakai',
  refund_cash: 'Reward Dikembalikan',
};

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] || reason.toUpperCase();
}

/** Mirror PAY_METHOD_LABEL (src/lib/pay-methods.ts); key tak dikenal -> uppercase. */
const PAY_LABEL: Record<string, string> = {
  cash: 'Tunai',
  tf: 'Transfer',
  wa: 'QRIS / WA',
  qris: 'QRIS / WA',
  transfer: 'Transfer',
  split: 'Campur',
};

function payLabel(m: string): string {
  return PAY_LABEL[m] || m.toUpperCase();
}

/** Delta berunit POIN (bukan rupiah)? (mirror isPointUnit di points.ts). */
function isPointReason(reason: string): boolean {
  return reason === 'earn' || reason === 'redeem' || reason === 'void' || reason === 'refund';
}

// Query (SELF-SCOPE; tanpa batas baris -- keputusan D3)

/** Ledger poin/reward satu member (terbaru lebih dulu; tanpa LIMIT).
 *  `member_id` ikut dipilih: bukti self-scope di level SQL (uji test). */
export function poinQuery(memberId: number): EksporQuery {
  return {
    sql: `SELECT member_id, delta, reason, amount, sale_id, created_at
          FROM point_history
          WHERE member_id = ?
          ORDER BY created_at DESC, id DESC`,
    args: [memberId],
  };
}

/** Transaksi satu member (terbaru lebih dulu; tanpa LIMIT).
 *  `member_id` ikut dipilih: bukti self-scope di level SQL (uji test). */
export function transaksiQuery(memberId: number): EksporQuery {
  return {
    sql: `SELECT id, member_id, total, pay_method, status, member_points, created_at
          FROM sales
          WHERE member_id = ?
          ORDER BY created_at DESC, id DESC`,
    args: [memberId],
  };
}

/** ID anggota koperasi dicocokkan dari NAMA (pola P1c: lower(trim(name))). */
export function coopMemberIdsQuery(name: string): EksporQuery {
  return {
    sql: 'SELECT id FROM coop_members WHERE lower(trim(name)) = lower(?)',
    args: [name],
  };
}

/** Pinjaman koperasi utk id anggota koperasi yg diberikan
 * (args kosong = jangan eksekusi; route mengembalikan baris kosong).
 *  `member_id` (id anggota koperasi) ikut dipilih: bukti self-scope. */
export function koperasiQuery(coopMemberIds: string[]): EksporQuery {
  const ph = coopMemberIds.map(() => '?').join(', ');
  return {
    sql: `SELECT id, member_id, akad, pokok, sisa, tanggal_mulai, tanggal_jatuh_tempo, status, catatan
          FROM coop_pinjaman
          WHERE member_id IN (${ph})
          ORDER BY created_at DESC`,
    args: [...coopMemberIds],
  };
}

// Build CSV

/** Nama file: member-ekspor-{jenis}-{YYYY-MM-DD WIB}.csv (param tanggal
 *  dipisah agar hermetis/testable). */
export function eksporFilename(jenis: EksporJenis, tanggalWib: string): string {
  return 'member-ekspor-' + jenis + '-' + tanggalWib + '.csv';
}

/** CSV ledger poin/reward: tanggal WIB, label peristiwa Indonesia,
 *  unit delta (poin/rupiah), nomor transaksi (kosong bila koreksi). */
export function buildPoinCsv(rows: EksporPoinRow[], tanggalWib: string): EksporHasil {
  const lines = ['Tanggal (WIB),Peristiwa,Delta,Unit,Jumlah (Rupiah),No. Transaksi'];
  for (const r of rows) {
    const unit = isPointReason(r.reason) ? 'poin' : 'rupiah';
    lines.push(
      [isoToWib(r.created_at), reasonLabel(r.reason), r.delta, unit, r.amount, r.sale_id ?? '']
        .map(csvEscape)
        .join(','),
    );
  }
  return { csv: CSV_BOM + lines.join('\n'), filename: eksporFilename('poin', tanggalWib) };
}

/** CSV transaksi saya: tanggal WIB, label metode bayar Indonesia,
 *  status mentah (DB). */
export function buildTransaksiCsv(rows: EksporTransaksiRow[], tanggalWib: string): EksporHasil {
  const lines = ['No.,Tanggal (WIB),Total (Rupiah),Metode Bayar,Status,Poin'];
  for (const r of rows) {
    lines.push(
      [r.id, isoToWib(r.created_at), r.total, payLabel(r.pay_method), r.status, r.member_points]
        .map(csvEscape)
        .join(','),
    );
  }
  return { csv: CSV_BOM + lines.join('\n'), filename: eksporFilename('transaksi', tanggalWib) };
}

/** CSV pinjaman koperasi: tanggal mentah (sudah tanggal kalender WIB),
 *  catatan NULL -> kolom kosong. */
export function buildKoperasiCsv(rows: EksporKoperasiRow[], tanggalWib: string): EksporHasil {
  const lines = ['No.,Akad,Pokok (Rupiah),Sisa (Rupiah),Tgl Mulai,Tgl Jatuh Tempo,Status,Catatan'];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.akad,
        r.pokok,
        r.sisa,
        r.tanggal_mulai,
        r.tanggal_jatuh_tempo,
        r.status,
        r.catatan ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return { csv: CSV_BOM + lines.join('\n'), filename: eksporFilename('koperasi', tanggalWib) };
}
