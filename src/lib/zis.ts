/**
 * F3.4+ W2.7 -- modul ZIS (Zakat, Infak, Sedekah): tabel `zis` (Sek.8.2,
 * skema v22) + auto-posting mapping OQ-1.
 *
 * Dependensi runtime: jurnal.ts (postJournalInTx + nowWib) -- jurnal.ts
 * sendiri bebas-import (type-only), jadi modul ini tetap saged diuji
 * Node (type-stripping) dgn SQLite in-memory: scripts/test-zis.ts.
 * TIDAK diimpor komponen client (modul server-side + test).
 *
 * Mapping OQ-1 (approved):
 *   masuk              : Debit  1100 (Kas ZIS)              / Kredit 2090
 *   keluar zakat       : Debit  5090 (Zakat Keluar)         / Kredit 1100
 *   keluar infak/sdkeh : Debit  5100 (Infak/Sedekah Keluar) / Kredit 1100
 *   wakaf masuk (W3.5) : Debit  1120 (Aset Wakaf)            / Kredit 4100
 *   wakaf keluar       : DICATET TANPA auto-jurnal (D3) --
 *                        disposal/penyaluran = jurnal manual
 *                        ke 6020/1120 (PSAK 112).
 *
 * Anti-campur #16: 1100 (Kas ZIS) MURNI -- tidak pernah campur
 * 1010/1020 (builder menulis 1100/2090/5090/5100 utk
 * zakat/infak/sedekah; 1120/4100 utk wakaf masuk; W3.5).
 * D1: baris zis SELALU dicatat; auto-jurnal hanya saat gl_enabled='1'
 * (pola W2.1; gl-off = zero GL behavior change). D6: baris gl-off
 * TIDAK di-backfill otomatis. Idempoten: UNIQUE(zis.id, type='auto').
 */

import { nowWib, postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';

/** Akun GL modul ZIS (OQ-1; seluruhnya COA v22 status 'open'). */
export const ZIS_ACCT = {
  KAS: '1100', // Kas ZIS (aset, murni -- anti-campur #16)
  TERKUMPUL: '2090', // ZIS Terkumpul Belum Disalurkan (kewajiban)
  ZAKAT_OUT: '5090', // Zakat Keluar (beban)
  INFAK_OUT: '5100', // Infak/Sedekah Keluar (beban)
  ASET_WAKAF: '1120', // Aset Wakaf (aset; PSAK 112; WAJIB -- memo di neraca)
  WAKAF_IN: '4100', // Wakaf Masuk (pendapatan; PSAK 112; WAJIB -- laba/rugi)
} as const;

/** Jenis ZIS (kolom `kind` tabel zis). */
export const ZIS_KINDS = ['zakat', 'infak', 'sedekah', 'wakaf'] as const;
export type ZisKind = (typeof ZIS_KINDS)[number];

/**
 * Jenis yang auto-posting. Wakaf (W3.5) auto-post hanya utk arah 'in'
 * (D1120/K4100); arah 'out' = tercatat tanpa jurnal (lihat recordZisInTx).
 */
export const ZIS_AUTO_KINDS = ['zakat', 'infak', 'sedekah', 'wakaf'] as const;

export type ZisDirection = 'in' | 'out';

/** Input pencatatan ZIS (recordZisInTx). */
export interface ZisRecord {
  id: string;
  kind: ZisKind;
  direction: ZisDirection;
  /** Rupiah integer penuh (> 0; nilai pecahan di-bulat, <= 0 ditolak). */
  amount: number;
  payer?: string | null;
  /** ISO WIB (+07:00); default nowWib(). */
  occurred_at?: string;
  created_by?: string | null;
  /** D1: true hanya saat settings.gl_enabled='1'. */
  gl_enabled?: boolean;
}

/** Rp penuh (mirror `round` jurnal.ts; tolak <= 0). */
export function zisValidateAmount(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  if (n <= 0) throw new Error('zis: amount harus positif (rupiah integer)');
  return n;
}

function assertKind(kind: string): asserts kind is ZisKind {
  if (!(ZIS_KINDS as readonly string[]).includes(kind)) {
    throw new Error('zis: kind tidak dikenal: ' + String(kind));
  }
}

function assertDirection(dir: string): asserts dir is ZisDirection {
  if (dir !== 'in' && dir !== 'out') throw new Error('zis: direction harus "in" atau "out"');
}

/**
 * Kaki jurnal ZIS (OQ-1; anti-campur #16: HANYA akun
 * 1100/2090/5090/5100 utk zakat/infak/sedekah, 1120/4100 utk
 * wakaf masuk; TIDAK PERNAH 1010/1020). Wakaf 'out' (D3):
 * returned [] = tercatat tanpa auto-jurnal (PSAK 112: manual 6020/1120).
 */
export function zisLines(kind: string, direction: string, amount: number): JLine[] {
  assertKind(kind);
  assertDirection(direction);
  const amt = zisValidateAmount(amount);
  if (kind === 'wakaf') {
    if (direction === 'in') {
      const src = 'zis#wakaf';
      return [
        { account_code: ZIS_ACCT.ASET_WAKAF, debit: amt, credit: 0, source: src },
        { account_code: ZIS_ACCT.WAKAF_IN, debit: 0, credit: amt, source: src },
      ];
    }
    return []; // wakaf keluar = tercatat tanpa auto-jurnal (D3)
  }
  const src = 'zis#' + kind + direction;
  if (direction === 'in') {
    return [
      { account_code: ZIS_ACCT.KAS, debit: amt, credit: 0, source: src },
      { account_code: ZIS_ACCT.TERKUMPUL, debit: 0, credit: amt, source: src },
    ];
  }
  if (kind === 'zakat') {
    return [
      { account_code: ZIS_ACCT.ZAKAT_OUT, debit: amt, credit: 0, source: src },
      { account_code: ZIS_ACCT.KAS, debit: 0, credit: amt, source: src },
    ];
  }
  // infak / sedekah keluar
  return [
    { account_code: ZIS_ACCT.INFAK_OUT, debit: amt, credit: 0, source: src },
    { account_code: ZIS_ACCT.KAS, debit: 0, credit: amt, source: src },
  ];
}

/** Spesifikasi entry auto-posting ZIS (ref_table='zis'; idempoten per id). */
export function zisJournalFor(rec: ZisRecord): JSpec {
  const amount = zisValidateAmount(rec.amount);
  return {
    id: 'JE-zis-' + rec.id,
    ref_table: 'zis',
    ref_id: rec.id,
    entry_date: rec.occurred_at ?? nowWib(),
    type: 'auto',
    desc: `ZIS ${rec.kind} ${rec.direction === 'in' ? 'masuk' : 'keluar'} ${amount}`,
    created_by: rec.created_by ?? undefined,
    lines: zisLines(rec.kind, rec.direction, amount),
  };
}

/**
 * Pencatatan atomik (dijalankan DI DALAM tx pemanggil, pola W2.1/W2.6):
 * INSERT zis -> (gl_on && auto-postable) auto-post OQ-1 via
 * postJournalInTx + UPDATE posted_entry. Wakaf 'in' + gl_on = auto
 * 1120/4100 (W3.5); wakaf 'out' & gl-off = tercatat tanpa jurnal
 * (posted_entry NULL; D3/D6). Mengembalikan id entry (atau null).
 */
export async function recordZisInTx(
  db: TxDb,
  rec: ZisRecord
): Promise<{ entryId: string | null }> {
  assertKind(rec.kind);
  assertDirection(rec.direction);
  const amount = zisValidateAmount(rec.amount);
  await db
    .prepare(
      'INSERT INTO zis (id, kind, direction, amount, payer, occurred_at, posted_entry, created_by, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)'
    )
    .run(
      rec.id,
      rec.kind,
      rec.direction,
      amount,
      rec.payer ?? null,
      rec.occurred_at ?? nowWib(),
      rec.created_by ?? null,
      nowWib()
    );
  const auto =
    rec.gl_enabled === true &&
    (ZIS_AUTO_KINDS as readonly string[]).includes(rec.kind) &&
    (rec.kind !== 'wakaf' || rec.direction === 'in');
  if (!auto) return { entryId: null };
  const entryId = await postJournalInTx(db, zisJournalFor(rec));
  await db.prepare('UPDATE zis SET posted_entry = ? WHERE id = ?').run(entryId, rec.id);
  return { entryId };
}
