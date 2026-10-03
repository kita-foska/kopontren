/**
 * W3.2 -- modul akad syariah: mapping jurnal per event (Sek.6.4) +
 * validasi terms (Sek.6.5: 0 preset, semua input manual) + pencatatan
 * atomik pola W2.7 (recordZisInTx).
 *
 * Dependensi runtime: jurnal.ts (postJournalInTx/nowWib/round) --
 * jurnal.ts bebas-import (type-only), jadi modul ini tetap bisa diuji
 * Node (type-stripping) dgn SQLite in-memory: scripts/test-akad.ts
 * (A1-A7). TIDAK diimpor komponen client (modul server-side + test).
 *
 * Mapping Sek.6.4 (ref_table='akad'; akun = COA v23 flip W3.1):
 *   murabahah  pencairan  : D1010 (terima pembayaran pertama)
 *                             C2040 (sisa pokok+margin, bila bertahap)
 *                           / C4060 (lunas saat pencairan, recognition)
 *   murabahah  angsuran   : D1010 -> C2040 (nominal angsuran)
 *   murabahah  settlement : D2040 (sisa) -> C4060 (recognition margin
 *                           sisa) -- literal Sek.6.4 (OQ-A1, ruling
 *                           Gus Fi 3 Okt: "sisa" = nominal event,
 *                           bukan hitung margin tersembunyi).
 *   mudharabah pencairan  : D1010 (P diterima) -> C1080 (P ditahan
 *                           s/d settlement)
 *   mudharabah bagi_hasil : 1 entry 4 sisi: D1080 (Pc) + D5060 (Pp)
 *                             -> C4070 (Pc, porsi koperasi) + C1010
 *                           (Pp, dibayar cash); Pp ditahan dulu ->
 *                           C2040. Pc = porsi koperasi, Pp = porsi
 *                           partner = round(T * nisbah / 100);
 *                           Pc = T - Pp (D=K persis, NOTE 3).
 *   musyarakah pencairan  : D1010 (K diterima) -> C1090
 *   musyarakah bagi_hasil : 1 entry 4 sisi: D1090 (Pc) + D5060 (Pp)
 *                             -> C4080 (Pc) + C1010 (Pp)
 *   mudharabah/musyarakah settlement: D1080/1090 (sisa pokok) -> C1010
 *                           (pengembalian ke shahib/pemilik)
 *   ijarah     pencairan  : D1010 (imbalan awal, bila ada) -> C4050
 *   ijarah     periodik   : D1010 -> C4050 (imbalan sewa)
 *   wakalah    settlement  : D1010(bruto) -> C2020(neto) + C4010(uyrah)
 *                           (W3.4 bridge; Sek.6.4; rate = terms.rate %)
 *   wakalah    ujrah       : D1010 -> C4040 (sama W2.1; NOTE: helper
 *                           utk /api/akad path, BUKAN production --
 *                           production ujrah via konsinyasi route
 *                           journalForConsignmentUjrah; do NOT
 *                           double-post; mutually exclusive Sek.6.1)
 *   denda      : TIDAK DIANGKAT (F3.3 #6: tak ada skema denda; akun
 *                           5050 status=closed) -- event boleh
 *                           tercatat, TIDAK pernah di-post.
 * 1070 (Piutang Murabahah) TIDAK dipakai builder Sek.6.4 (sisa
 * kewajiban duduk di 2040; OQ-A2: 1070 utk rekap piutang/laporan).
 *
 * ref_id (F1, ruling W3.1): 'akad#<akad_id>:evt#<akad_events.id>'
 * -- PER EVENT, bukan ':evt#<kind>' (Sek.6.4), karena kind berulang
 * (2 angsuran / 2 bagi_hasil pada akad sama) akan bentrok di
 * UNIQUE(ref_table, ref_id, type) jurnal_entries (dibuktikan test A6).
 *
 * D1 (pola W2.1/W2.7): event SELALU tercatat; auto-jurnal hanya saat
 * gl_enabled='1' (gl-off = zero GL behavior change; D6: tanpa
 * backfill). Idempoten: postJournalInTx (UNIQUE ref_table/ref_id/
 * type); posting ulang = no-op, kembalikan id entry yang ada.
 */

import { nowWib, postJournalInTx } from './jurnal.ts';
import type { JLine, JSpec, TxDb } from './jurnal.ts';

/** Tipe akad (kolom `type` tabel akad; Sek.6.1/6.2). */
export const AKAD_TYPES = ['murabahah', 'mudharabah', 'musyarakah', 'ijarah', 'wakalah'] as const;
export type AkadType = (typeof AKAD_TYPES)[number];

/** Kind event (kolom `kind` tabel akad_events; per tipe, lihat matrix). */
export const AKAD_KINDS = ['pencairan', 'angsuran', 'settlement', 'bagi_hasil', 'ijarah_periodik', 'denda', 'ujrah'] as const;
export type AkadKind = (typeof AKAD_KINDS)[number];

/** Akun GL modul akad (COA v23 -- 13 kode; 9 flip open W3.1 + 3 W3.4). */
export const AKAD_ACCT = {
  KAS: '1010', // Kas Toko (event "terima pembayaran" saja; Sek.6.4)
  PIUTANG_MURABAHAH: '1070', // (OQ-A2: rekap piutang -- TAK dipakai builder)
  INVESTASI_MUDHARABAH: '1080', // P ditahan s/d settlement
  INVESTASI_MUSYARAKAH: '1090', // K ditahan s/d settlement
  KEWAJIBAN_AKAD: '2040', // sisa pokok+margin; Pp ditahan
  HUTANG_KONSINYASI: '2020', // W3.4: bridge wakalah (settlement neto; OQ-7)
  PEND_PENJUALAN: '4010', // W3.4: bridge wakalah (uyrah as sales revenue)
  PEND_IJARAH: '4050', // imbalan sewa
  LABA_MURABAHAH: '4060',
  BHM_MUDHARABAH: '4070', // porsi koperasi
  BHM_MUSYARAKAH: '4080', // porsi koperasi
  BGH_PARTNER: '5060', // porsi partner (beban; masuk Beban lka.ts)
  UJRAH: '4040', // W3.4: bridge wakalah (ujrah income, W2.1)
} as const;

/** Terms ter-validasi (Sek.6.5: 0 preset -- semua dari input user). */
export interface AkadTerms {
  /** % porsi PARTNER (0-100, integer) utk bagi hasil mudharabah/musyarakah. */
  nisbah?: number;
  /** Margin murabahah (% per akad; input manual). */
  margin?: number;
  /** Rate ijarah (nominal per periode; input manual). */
  rate?: number;
}

/**
 * Validasi terms_json (Sek.6.5): null/'' = {} (0 preset); JSON korup
 * -> throw; nisbah = integer 0-100 (desimal ditolak, NOTE 2); margin
 * / rate >= 0. Key lain (schedule, jangka, ...) diabaikan -- terms_json
 * JSON bebas (Sek.6.1), hanya key dikenal yang divalidasi.
 */
export function akadValidateTerms(termsJson: string | null | undefined): AkadTerms {
  if (termsJson == null || String(termsJson).trim() === '') return {};
  let raw: unknown;
  try {
    raw = JSON.parse(String(termsJson));
  } catch {
    throw new Error('akad: terms_json bukan JSON valid');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('akad: terms_json harus objek JSON (mis {"nisbah":40})');
  }
  const t = raw as Record<string, unknown>;
  const out: AkadTerms = {};
  if (t.nisbah !== undefined) {
    const n = Number(t.nisbah);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      throw new Error('akad: nisbah harus integer 0-100');
    }
    out.nisbah = n;
  }
  if (t.margin !== undefined) {
    const m = Number(t.margin);
    if (!Number.isFinite(m) || m < 0) throw new Error('akad: margin harus >= 0');
    out.margin = m;
  }
  if (t.rate !== undefined) {
    const r = Number(t.rate);
    if (!Number.isFinite(r) || r < 0) throw new Error('akad: rate harus >= 0');
    out.rate = r;
  }
  return out;
}

/** Rupiah integer penuh (> 0; nilai pecahan di-bulat, <= 0 ditolak). */
export function akadValidateAmount(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  if (n <= 0) throw new Error('akad: amount harus positif (rupiah integer)');
  return n;
}

function assertType(type: string): asserts type is AkadType {
  if (!(AKAD_TYPES as readonly string[]).includes(type)) {
    throw new Error('akad: type tidak dikenal: ' + String(type));
  }
}

function assertKind(kind: string): asserts kind is AkadKind {
  if (!(AKAD_KINDS as readonly string[]).includes(kind)) {
    throw new Error('akad: kind tidak dikenal: ' + String(kind));
  }
}

/** Kind valid per tipe (Sek.6.2; W3.4: wakalah bridge; denda = tak dipost). */
const KINDS_BY_TYPE: Record<string, readonly string[]> = {
  murabahah: ['pencairan', 'angsuran', 'settlement'],
  mudharabah: ['pencairan', 'bagi_hasil', 'settlement'],
  musyarakah: ['pencairan', 'bagi_hasil', 'settlement'],
  ijarah: ['pencairan', 'ijarah_periodik'],
  wakalah: ['settlement', 'ujrah'], // W3.4: bridge (was [] pre-W3.4)
};

/** Validasi kind utk tipe (route /api/akad: 400, bukan 500 utk kombinasi invalid). */
export function akadKindAllowed(type: string, kind: string): boolean {
  return (KINDS_BY_TYPE[type] ?? []).includes(kind);
}

/**
 * W3.3: pesan UNIQUE constraint (route /api/akad + UI + test).
 * NOTE 3 W3.1: "Akad dgn counterparty, tanggal, jumlah sama sudah ada --
 * periksa riwayat atau ubah salah satu parameter."
 */
export const AKAD_UNIQUE_ERROR =
  'Akad dgn counterparty, tanggal, jumlah sama sudah ada -- periksa riwayat atau ubah salah satu parameter.';

/** Status valid utk PUT /api/akad (soft status, bukan DELETE). */
export const AKAD_STATUS = ['active', 'settled'] as const;

export interface AkadLinesOpts {
  /** Murabahah pencairan: true = lunas saat pencairan -> C4060 (Sek.6.4). */
  lunas?: boolean;
  /** Bagi hasil: true = Pp ditahan dulu -> C2040 (Sek.6.4; bukan C1010). */
  heldPp?: boolean;
}

function bagiHasilPp(terms: AkadTerms, total: number): number {
  if (terms.nisbah === undefined) {
    throw new Error('akad: bagi_hasil butuh terms.nisbah (% porsi partner, 0-100)');
  }
  return Math.round((total * terms.nisbah) / 100);
}

/**
 * Kaki jurnal per event (Sek.6.4; D=K terjamin per entry; debit/credit
 * non-negatif -- konvensi posisi.ts/lka.ts). Denda/kind di luar
 * matrix -> throw. Wakalah: W3.4 bridge (settlement + ujrah).
 */
export function akadLines(
  type: string,
  kind: string,
  amount: number,
  terms: AkadTerms = {},
  opts: AkadLinesOpts = {}
): JLine[] {
  assertType(type);
  assertKind(kind);
  const amt = akadValidateAmount(amount);
  const src = 'akad#' + type + ':' + kind;
  const D = (code: string, a: number): JLine => ({ account_code: code, debit: a, credit: 0, source: src });
  const C = (code: string, a: number): JLine => ({ account_code: code, debit: 0, credit: a, source: src });
  if (type === 'wakalah') {
    // W3.4 bridge (Sek.6.1: modul akad = bridge, bukan duplikat P4)
    if (kind === 'settlement') {
      // D1010(bruto) -> K2020(neto) + K4010(uyrah)
      // OQ-7: K2020 eksis BEFORE D2020 dari konsinyasi pay.
      const rate = terms.rate ?? 0;
      const uyrah = Math.round((amt * rate) / 100);
      const neto  = amt - uyrah;
      const lines: JLine[] = [D(AKAD_ACCT.KAS, amt)];
      if (neto  > 0) lines.push(C(AKAD_ACCT.HUTANG_KONSINYASI, neto));
      if (uyrah > 0) lines.push(C(AKAD_ACCT.PEND_PENJUALAN,    uyrah));
      return lines;
    }
    if (kind === 'ujrah') {
      // D1010 -> K4040 (sama W2.1; NOTE: helper utk /api/akad path.
      // Production ujrah posting via konsinyasi route
      // (journalForConsignmentUjrah). Do NOT double-post;
      // two paths mutually exclusive by design (Sek.6.1 bridge).)
      return [D(AKAD_ACCT.KAS, amt), C(AKAD_ACCT.UJRAH, amt)];
    }
    throw new Error('akad: wakalah tak mendukung kind ' + kind);
  }
  if (kind === 'denda') {
    throw new Error('akad: denda TIDAK DIANGKAT (F3.3 #6: tak ada skema denda; akun 5050 closed)');
  }
  const kinds = KINDS_BY_TYPE[type];
  if (!kinds.includes(kind)) {
    throw new Error(
      'akad: type ' +
        type +
        ' tak mendukung kind ' +
        kind +
        (type === 'ijarah' && kind === 'settlement' ? ' (settlement ijarah: belum ada mapping Sek.6.4, OQ-A3)' : '')
    );
  }
  switch (type) {
    case 'murabahah': {
      if (kind === 'pencairan' || kind === 'angsuran') {
        // Sek.6.4: D1010 (terima pembayaran pertama / nominal angsuran)
        // -> C2040 (sisa pokok+margin, bertahap); lunas saat
        // pencairan -> C4060 (recognition, OQ-A1 literal).
        return [
          D(AKAD_ACCT.KAS, amt),
          C(opts.lunas ? AKAD_ACCT.LABA_MURABAHAH : AKAD_ACCT.KEWAJIBAN_AKAD, amt),
        ];
      }
      // settlement (lunas): D2040 (sisa) -> C4060 (recognition margin sisa).
      return [
        D(AKAD_ACCT.KEWAJIBAN_AKAD, amt),
        C(AKAD_ACCT.LABA_MURABAHAH, amt),
      ];
    }
    case 'mudharabah':
    case 'musyarakah': {
      const inv = type === 'mudharabah' ? AKAD_ACCT.INVESTASI_MUDHARABAH : AKAD_ACCT.INVESTASI_MUSYARAKAH;
      const bgm = type === 'mudharabah' ? AKAD_ACCT.BHM_MUDHARABAH : AKAD_ACCT.BHM_MUSYARAKAH;
      if (kind === 'pencairan') {
        // P/K diterima -> ditahan di aset s/d settlement.
        return [D(AKAD_ACCT.KAS, amt), C(inv, amt)];
      }
      if (kind === 'settlement') {
        // Sisa pokok kembali ke shahib/pemilik.
        return [D(inv, amt), C(AKAD_ACCT.KAS, amt)];
      }
      // bagi_hasil: 1 entry 4 sisi (Sek.6.4). Pp = porsi partner
      // (dibayar cash C1010, atau ditahan C2040 bila heldPp);
      // Pc = porsi koperasi = T - Pp (D=K persis, NOTE 3).
      const pp = bagiHasilPp(terms, amt);
      const pc = amt - pp;
      return [
        D(inv, pc),
        D(AKAD_ACCT.BGH_PARTNER, pp),
        C(bgm, pc),
        C(opts.heldPp ? AKAD_ACCT.KEWAJIBAN_AKAD : AKAD_ACCT.KAS, pp),
      ];
    }
    case 'ijarah':
      // pencairan (imbalan awal, bila ada) + ijarah_periodik:
      // D1010 -> C4050 (imbalan sewa, Sek.6.4). settlement = throw
      // (di luar matrix, OQ-A3).
      return [D(AKAD_ACCT.KAS, amt), C(AKAD_ACCT.PEND_IJARAH, amt)];
  }
  throw new Error('akad: type tak didukung: ' + type);
}

/** Record event akad (permukaan recordAkadEventInTx + akadJournalFor). */
export interface AkadEventRec {
  /** id akad_events (PK). */
  id: string;
  akadId: string;
  type: string;
  kind: string;
  /** Rupiah integer penuh (> 0; pecahan di-bulat, <= 0 ditolak). */
  amount: number;
  /** ISO WIB (+07:00); default nowWib(). */
  event_date?: string;
  /** terms_json asal (divalidasi; null/'' = {}). */
  terms_json?: string | null;
  createdBy?: string | null;
  /** D1: true hanya saat settings.gl_enabled='1'. */
  gl_enabled?: boolean;
  /** Murabahah pencairan: lunas saat pencairan (C4060, Sek.6.4). */
  lunas?: boolean;
  /** Bagi hasil: Pp ditahan dulu (C2040, Sek.6.4). */
  heldPp?: boolean;
}

/**
 * Spesifikasi entry auto-posting (ref_table='akad'; type='auto').
 * ref_id F1 (ruling W3.1): 'akad#<akad_id>:evt#<akad_events.id>' --
 * per EVENT (bukan per kind, pola Sek.6.4 ':evt#<kind>') agar event
 * berulang (angsuran/bagi_hasil ke-2+) tak bentrok di
 * UNIQUE(ref_table, ref_id, type) jurnal_entries.
 */
export function akadJournalFor(rec: AkadEventRec, terms?: AkadTerms): JSpec {
  const t = terms ?? akadValidateTerms(rec.terms_json);
  const lines = akadLines(rec.type, rec.kind, rec.amount, t, { lunas: rec.lunas, heldPp: rec.heldPp });
  return {
    id: 'JE-akadevt-' + rec.id,
    ref_table: 'akad',
    ref_id: 'akad#' + rec.akadId + ':evt#' + rec.id,
    entry_date: rec.event_date ?? nowWib(),
    type: 'auto',
    desc: 'Akad ' + rec.type + ' ' + rec.kind + ' #' + rec.akadId + ' (event ' + rec.id + ')',
    created_by: rec.createdBy ?? undefined,
    lines,
  };
}

/**
 * Pencatatan atomik (DI DALAM tx pemanggil, pola recordZisInTx W2.7):
 * INSERT akad_events -> (gl_on && bukan wakalah/denda) auto-post
 * Sek.6.4 via postJournalInTx + UPDATE posted_entry. Wakalah (bridge
 * W3.4) / denda (F3.3 #6) / gl-off: tercatat tanpa jurnal
 * (posted_entry NULL; D6: tanpa backfill). Idempoten per event:
 * posting ulang = no-op (kembalikan id entry yang ada).
 * Mengembalikan id entry (atau null bila tak dipost).
 */
export async function recordAkadEventInTx(
  db: TxDb,
  rec: AkadEventRec
): Promise<{ entryId: string | null }> {
  assertType(rec.type);
  assertKind(rec.kind);
  const amount = akadValidateAmount(rec.amount);
  const terms = akadValidateTerms(rec.terms_json);
  await db
    .prepare(
      'INSERT INTO akad_events (id, akad_id, kind, amount, event_date, posted_entry, created_by, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, NULL, ?, ?)'
    )
    .run(
      rec.id,
      rec.akadId,
      rec.kind,
      amount,
      rec.event_date ?? nowWib(),
      rec.createdBy ?? null,
      nowWib()
    );
  const auto = rec.gl_enabled === true && rec.kind !== 'denda'; // W3.4: wakalah bridge auto-posted
  if (!auto) return { entryId: null };
  const entryId = await postJournalInTx(db, akadJournalFor(rec, terms));
  await db.prepare('UPDATE akad_events SET posted_entry = ? WHERE id = ?').run(entryId, rec.id);
  return { entryId };
}

