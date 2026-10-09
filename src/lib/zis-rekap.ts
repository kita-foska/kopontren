/**
 * P3b -- ZIS Rekap: agregasi baca-only modul ZIS (W2.7).
 *
 * Import-free (type-only QueryDb, pola lib/laporan: posisi/calk/lka)
 * -- diuji Node langsung (type-stripping + SQLite in-memory) lewat
 * scripts/test-zis.ts (blok Z8). TIDAK diimpor komponen client:
 * route API /api/zis/rekap memanggil buildZisRekap; zis-client
 * menduplikasi type payload (pola ZisRow di zis-client.tsx/route zis).
 *
 * Semantik (OQ-1, LABEL ONLY -- builder lib/zis.ts tak diubah):
 *  - by_kind / monthly / grand = agregat tabel `zis` scope periode
 *    (occurred_at >= from AND occurred_at < to; all-time bila null).
 *  - c2090.gl_balance = SUM(credit) - SUM(debit) COA 2090, ALL-TIME
 *    (JOIN journal_entries anti-orphan, pola lib/laporan/posisi.ts;
 *    2xxx kredit-normal). KUMULATIF: keluar ZIS (OQ-1) dibook 5090/
 *    5100 via 1100 dan TIDAK mengurangi 2090. posted_in/unposted_in
 *    = count baris zis direction='in' dgn/tanpa posted_entry (D1/
 *    D6: baris gl-off tidak di-backfill -> tidak masuk gl_balance).
 *  - `from`/`to` = ISO-WIB seragam dgn zis.occurred_at ('YYYY-MM-DD
 *    THH:MM[:SS[.fff][+07:00]]'); 'YYYY-MM-DD' dinormalisasi caller
 *    (route) ke tengah-malam WIB. Perbandingan string leksikografis
 *    valid karena format seragam (+07:00).
 */
import type { QueryDb } from './keuangan.ts';

/** Jenis zis (mirror ZIS_KINDS lib/zis.ts; konstan lokal agar modul
 * tetap import-free -- pola lib/laporan tak import modul runtime). */
const ZIS_KINDS_REKAP = ['zakat', 'infak', 'sedekah', 'wakaf'] as const;

/** Baris total per jenis (zero-fill: selalu 4 jenis). */
export type ZisRekapKindRow = {
  kind: string;
  in_total: number;
  out_total: number;
  /** in_total - out_total. */
  net: number;
};

/** Baris aliran per bulan (label 'YYYY-MM'; ASC). */
export type ZisRekapMonthRow = {
  month: string;
  in_total: number;
  out_total: number;
  net: number;
};

/** Hasil `buildZisRekap` -- dikirim GET /api/zis/rekap. */
export type ZisRekapPayload = {
  /** Batas periode (echo input; null = all-time). from inklusif, to eksklusif. */
  period: { from: string | null; to: string | null };
  /** Total per jenis, scope periode (zero-fill 4 jenis). */
  by_kind: ZisRekapKindRow[];
  /** Aliran per bulan, scope periode (ASC; 'YYYY-MM'). */
  monthly: ZisRekapMonthRow[];
  /** Total seluruh jenis, scope periode. */
  grand: { in_total: number; out_total: number; net: number };
  /**
   * Saldo COA 2090 -- ALL-TIME (TIDAK ikut filter periode; invariant
   * OQ-1, angka formal neraca/CALK item 5).
   */
  c2090: {
    /** SUM(credit) - SUM(debit) akun 2090 (kredit-normal) s.d. sekarang. */
    gl_balance: number;
    /** Count baris zis masuk (semua jenis) yang punya posted_entry. */
    posted_in: number;
    /** Count baris zis masuk tanpa jurnal (D1: gl-off; D6: tak di-backfill). */
    unposted_in: number;
  };
};

type KindAgg = { kind: string; i: number; o: number };

/** Filter periode occurred_at (ISO-WIB seragam; string compare valid). */
function periodFilter(from?: string | null, to?: string | null): { where: string; params: unknown[] } {
  const wheres: string[] = [];
  const params: unknown[] = [];
  if (from) {
    wheres.push('occurred_at >= ?');
    params.push(from);
  }
  if (to) {
    wheres.push('occurred_at < ?');
    params.push(to);
  }
  return { where: wheres.length ? ' WHERE ' + wheres.join(' AND ') : '', params };
}

export async function buildZisRekap(
  db: QueryDb,
  from?: string | null,
  to?: string | null
): Promise<ZisRekapPayload> {
  const { where, params } = periodFilter(from, to);

  // by_kind: agregat per jenis (zero-fill utk 4 jenis di JS).
  const kindRows = (await db
    .prepare(
      "SELECT kind, " +
        "COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) i, " +
        "COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) o " +
        'FROM zis' +
        where +
        ' GROUP BY kind'
    )
    .all(...params)) as KindAgg[];
  const m = new Map<string, KindAgg>();
  for (const r of kindRows) {
    m.set(String(r.kind), { kind: String(r.kind), i: Math.round(Number(r.i) || 0), o: Math.round(Number(r.o) || 0) });
  }
  const by_kind: ZisRekapKindRow[] = ZIS_KINDS_REKAP.map((k) => {
    const r = m.get(k) ?? { kind: k, i: 0, o: 0 };
    return { kind: r.kind, in_total: r.i, out_total: r.o, net: r.i - r.o };
  });

  // monthly: bucket 'YYYY-MM' via substr -- format occurred_at seragam
  // ISO-WIB ('YYYY-MM-DDTHH:MM:SS.fff+07:00') sehingga prefix string
  // deterministik; tanpa konversi zona waktu (Turso-safe).
  const monthRows = (await db
    .prepare(
      "SELECT substr(occurred_at, 1, 7) m, " +
        "COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) i, " +
        "COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) o " +
        'FROM zis' +
        where +
        ' GROUP BY m ORDER BY m'
    )
    .all(...params)) as { m: string; i: number; o: number }[];
  const monthly: ZisRekapMonthRow[] = monthRows.map((r) => {
    const i = Math.round(Number(r.i) || 0);
    const o = Math.round(Number(r.o) || 0);
    return { month: String(r.m), in_total: i, out_total: o, net: i - o };
  });

  const gIn = by_kind.reduce((a, r) => a + r.in_total, 0);
  const gOut = by_kind.reduce((a, r) => a + r.out_total, 0);
  const grand = { in_total: gIn, out_total: gOut, net: gIn - gOut };

  // c2090 (ALL-TIME, tak ikut filter periode):
  //  - gl_balance: SUM(credit)-SUM(debit) akun 2090, JOIN journal_entries
  //    (anti-orphan; pola lib/laporan/posisi.ts perAccount).
  //  - posted/unposted: count baris zis masuk (OQ-1: hanya 'in' menulis
  //    2090); baris gl-off (D6) tak di-backfill -> tak ikut gl_balance.
  const balRow = (await db
    .prepare(
      'SELECT COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) bal ' +
        'FROM journal_lines jl ' +
        'JOIN journal_entries je ON je.id = jl.entry_id ' +
        "WHERE jl.account_code = '2090'"
    )
    .get()) as { bal: number } | undefined;
  const postedRow = (await db
    .prepare(
      'SELECT COALESCE(SUM(CASE WHEN posted_entry IS NOT NULL THEN 1 ELSE 0 END), 0) p, ' +
        'COALESCE(SUM(CASE WHEN posted_entry IS NULL THEN 1 ELSE 0 END), 0) u ' +
        "FROM zis WHERE direction = 'in'"
    )
    .get()) as { p: number; u: number } | undefined;
  const c2090 = {
    gl_balance: Math.round(Number(balRow?.bal ?? 0) || 0),
    posted_in: Math.round(Number(postedRow?.p ?? 0) || 0),
    unposted_in: Math.round(Number(postedRow?.u ?? 0) || 0),
  };

  return {
    period: { from: from ?? null, to: to ?? null },
    by_kind,
    monthly,
    grand,
    c2090,
  };
}
