/**
 * F3.4+ W1.2 -- GL journal engine (modul inti GL; TANPA runtime import).
 *
 * Hanya `import type` (QueryDb dari ./keuangan.ts; dihapus saat compile)
 * supaya modul ini bisa diuji Node (type-stripping) dgn SQLite in-memory
 * -- lihat scripts/test-gl.ts (Phase 2/3). Pola sama dgn keuangan.ts /
 * neraca.ts (modul baca); beda: postJournal/reverseJournal MENULIS,
 * sehingga memakai permukaan JdB (bukan QueryDb, yang hanya baca).
 *
 * Ketentuan: docs/akuntansi-proposal.md (SAK-EP; grup 2 digit).
 *  - debit XOR credit per baris; SUM debit = SUM credit per entry
 *    (rekonsiliasi #15 JOURNAL_BAL). Rupiah integer penuh.
 *  - Immutable: koreksi = jurnal pembalik (type='reversal'), reversed_by
 *    dua arah; posting ulang pasca-reversal pakai ref_id baru (...#rev1).
 *  - Auto-posting: satu tx per transaksi; idempoten via
 *    UNIQUE(ref_table, ref_id, type) -- ulang = no-op.
 *  - entry_date/created_at = ISO WIB (+07:00) (disuplai caller).
 */

import type { QueryDb } from './keuangan.ts';

/** Kode COA utk auto-posting Wave-1 (proposal Sek.2, Sek.4.1). */
export const ACCT = {
  KAS_TOKO: '1010',
  KAS_BANK: '1020',
  PIUTANG: '1030',
  PERSEDIAAN: '1040',
  HPP: '5010',
  BEBAN_OPER: '5030',
  RETUR_PENJUALAN: '4030',
  PEND_PENJUALAN: '4010',
  POTONGAN: '4020',
  UJRAH: '4040',
  ZIS_MASUK: '4090',
  HUTANG_PEMBELIAN: '2010',
  HUTANG_KONSINYASI: '2020', // W3/W4 (OQ-7 Option C): goods-receipt + settlement; idle di W2.1
  MODAL: '3010',
  RETUR_HPP: '5020',
} as const;

/** Satu baris jurnal (debit XOR credit; source = bagian PK journal_lines). */
export type JLine = {
  account_code: string;
  debit: number;
  credit: number;
  source?: string;
};

/** Spesifikasi entry (hasil mapper / input postJournal). */
export type JSpec = {
  id: string;
  ref_table: string;
  ref_id: string | number | null;
  entry_date: string;
  type:
    | 'auto'
    | 'manual'
    | 'reversal'
    | 'opening'
    | 'closing'
    // W2.1 (F3.4+): tipe jurnal auto Wave 2 (OQ-4 + struktur OQ-3).
    // OQ-7 resolved W3.4: settlement konsinyasi (D2020/K1010) sekarang
    // aktif -- K2020 dibuat oleh akad settlement recognition (bridge,
    // Sek.6.4). 2020 reconciles to 0 when fully paid.
    | 'debt_payment'
    | 'payable_payment'
    | 'sales_return'
    | 'purchase_return'
    | 'consignment_ujrah'
    | 'consignment_settlement';
  desc?: string;
  created_by?: string;
  lines: JLine[];
};

/**
 * Permukaan DB yang bisa MENULIS (sinkron; node:sqlite / libsql). Didefinisikan
 * lokal agar modul tetap bebas-import. QueryDb (keuangan.ts) hanya baca.
 */
export type JdB = {
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  exec(sql: string): unknown;
};

/** Rupiah integer penuh. */
export const round = (n: unknown): number => Math.round(Number(n) || 0);

/** JOURNAL_BAL: SUM(debit) === SUM(credit). */
export function isBalanced(lines: JLine[]): boolean {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d = round(d + l.debit);
    c = round(c + l.credit);
  }
  return d === c;
}

/** Rute akun kas utk sales: cash/QRIS/WA -> 1010; transfer -> 1020; kredit -> 1030. */
export function saleCashAccount(payMethod: string): string {
  const m = String(payMethod || '').trim().toLowerCase();
  if (m === 'tf' || m === 'transfer') return ACCT.KAS_BANK;
  if (m === 'credit' || m === 'tempo' || m === 'piutang') return ACCT.PIUTANG;
  return ACCT.KAS_TOKO;
}

/** Akun lawan cash_entries (Sek.4.1) berbasis label; default didokumentasikan. */
export function cashEntryCounterpart(type: string, label: string): string {
  const l = String(label || '').trim().toLowerCase();
  if (type === 'income') {
    if (l.startsWith('ujrah')) return ACCT.UJRAH;
    if (/(zakat|infak|sedekah|zis)/.test(l)) return ACCT.ZIS_MASUK;
    if (/(modal|setor)/.test(l)) return ACCT.MODAL;
    return ACCT.MODAL; // tak terklasifikasi = setoran modal (provisional)
  }
  if (l.startsWith('retur')) return ACCT.RETUR_PENJUALAN;
  return ACCT.BEBAN_OPER;
}

/** Akun kas cash_entries: bank/transfer/QRIS -> 1020, selain itu 1010. */
export function cashEntryCashAccount(label: string, explicit?: string): string {
  if (explicit) return explicit;
  if (/(bank|transfer|tf|qris)/i.test(String(label || ''))) return ACCT.KAS_BANK;
  return ACCT.KAS_TOKO;
}

/**
 * Permukaan DB tulis-lintas transaksi: `tx` dari db.ts TIDAK menambah
 * argumen ke closure (fn tetap memakai `d` asal; TxDb dipetakan ke
 * transaksi di balik layar). `d` di dalam tx() TIDAK bisa dipergunakan
 * untuk `postJournal` (permukaan sync) -- jadi varian ini menerima TxDb
 * (async) + `d` sama. Semua statement berjalan DI DALAM transaksi yang
 * sama dgn write bisnis pemanggil (atomik), tanpa buka/commit sendiri.
 */
export type TxDb = {
  prepare(sql: string): {
    run(...args: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
    get(...args: unknown[]): Promise<unknown>;
    all(...args: unknown[]): Promise<unknown[]>;
  };
};

/** Normalisasi baris (Rupiah integer; source default ''). */
function normLines(lines: JLine[]): JLine[] {
  return lines.map((l) => ({
    account_code: String(l.account_code),
    debit: round(l.debit),
    credit: round(l.credit),
    source: l.source ? String(l.source) : '',
  }));
}

/** Saldo (debit - credit) tiap akun di `codes` SEBELUM `before`. */
function priorBalances(db: JdB, codes: string[], before: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of codes) map.set(c, 0);
  if (codes.length === 0) return map;
  const inList = codes.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT account_code, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ? AND jl.account_code IN (${inList})
       GROUP BY account_code`
    )
    .all(before, ...codes) as { account_code: string; d: number; c: number }[];
  for (const r of rows) map.set(r.account_code, round(r.d) - round(r.c));
  return map;
}

/** Async mirror dari priorBalances (dipakai postJournalInTx, TxDb). */
async function priorBalancesTx(
  db: TxDb,
  codes: string[],
  before: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const c of codes) map.set(c, 0);
  if (codes.length === 0) return map;
  const inList = codes.map(() => '?').join(',');
  const rows = (await db
    .prepare(
      `SELECT account_code, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ? AND jl.account_code IN (${inList})
       GROUP BY account_code`
    )
    .all(before, ...codes)) as { account_code: string; d: number; c: number }[];
  for (const r of rows) map.set(r.account_code, round(r.d) - round(r.c));
  return map;
}

/**
 * Tulis 1 entry + barisnya atomik. Idempoten: jika (ref_table, ref_id, type)
 * sudah ada -> no-op, kembalikan id yang ada. Menolak jurnal tak seimbang.
 */
function postSpec(db: JdB, input: JSpec): string {
  const lines: JLine[] = input.lines.map((l) => ({
    account_code: String(l.account_code),
    debit: round(l.debit),
    credit: round(l.credit),
    source: l.source ? String(l.source) : '',
  }));
  if (lines.length === 0) throw new Error('postJournal: no lines');
  if (!isBalanced(lines)) {
    throw new Error('postJournal: journal not balanced (SUM debit != SUM credit)');
  }

  if (input.ref_id !== null && input.ref_id !== undefined) {
    const ex = db
      .prepare(
        'SELECT id FROM journal_entries WHERE ref_table = ? AND ref_id = ? AND type = ?'
      )
      .get(input.ref_table, String(input.ref_id), input.type) as
      | { id: string }
      | undefined;
    if (ex && ex.id) return ex.id;
  }

  const codes = Array.from(new Set(lines.map((l) => l.account_code)));
  const prior = priorBalances(db, codes, input.entry_date);

  db.prepare(
    'INSERT INTO journal_entries (id, ref_table, ref_id, entry_date, type, desc, created_by, reversed_by) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, '')"
  ).run(
    input.id,
    input.ref_table,
    input.ref_id === null ? null : String(input.ref_id),
    input.entry_date,
    input.type,
    input.desc ?? '',
    input.created_by ?? null
  );
  const ins = db.prepare(
    'INSERT INTO journal_lines (entry_id, account_code, debit, credit, balance_running, source) ' +
      'VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const l of lines) {
    const bal = (prior.get(l.account_code) ?? 0) + round(l.debit) - round(l.credit);
    ins.run(input.id, l.account_code, round(l.debit), round(l.credit), bal, l.source ?? '');
  }
  return input.id;
}

/** Posting atomik (satu tx). Kembalikan id entry (baru / yang sudah ada). */
export function postJournal(db: JdB, input: JSpec): string {
  db.exec('BEGIN');
  try {
    const id = postSpec(db, input);
    db.exec('COMMIT');
    return id;
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* tx sudah menutup */
    }
    throw e;
  }
}

/**
 * W1.3 auto-posting: varian ASINKRON (lapisan API) dari postJournal, utk
 * dijalankan DI DALAM transaksi pemanggil (route API, TxDb dari db.ts):
 * TIDAK membuka BEGIN/COMMIT sendiri, jadi write GL ikut commit/rollback
 * atomik dgn write bisnis. Semantik sama dgn postJournal: tolak jurnal
 * tak seimbang (JOURNAL_BAL), idempoten via UNIQUE(ref_table, ref_id,
 * type) -- posting ulang = no-op (kembalikan id yang ada).
 */
export async function postJournalInTx(db: TxDb, input: JSpec): Promise<string> {
  const lines = normLines(input.lines);
  if (lines.length === 0) throw new Error('postJournalInTx: no lines');
  if (!isBalanced(lines)) {
    throw new Error('postJournalInTx: journal not balanced (SUM debit != SUM credit)');
  }
  const codes = Array.from(new Set(lines.map((l) => l.account_code)));
  const prior = await priorBalancesTx(db, codes, input.entry_date);

  if (input.ref_id !== null && input.ref_id !== undefined) {
    const ex = (await db
      .prepare(
        'SELECT id FROM journal_entries WHERE ref_table = ? AND ref_id = ? AND type = ?'
      )
      .get(input.ref_table, String(input.ref_id), input.type)) as
      | { id: string }
      | undefined;
    if (ex && ex.id) return ex.id;
  }

  await db
    .prepare(
      'INSERT INTO journal_entries (id, ref_table, ref_id, entry_date, type, desc, created_by, reversed_by) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?, '')"
    )
    .run(
      input.id,
      input.ref_table,
      input.ref_id === null ? null : String(input.ref_id),
      input.entry_date,
      input.type,
      input.desc ?? '',
      input.created_by ?? null
    );
  const ins = db.prepare(
    'INSERT INTO journal_lines (entry_id, account_code, debit, credit, balance_running, source) ' +
      'VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const l of lines) {
    const bal = (prior.get(l.account_code) ?? 0) + round(l.debit) - round(l.credit);
    await ins.run(input.id, l.account_code, round(l.debit), round(l.credit), bal, l.source ?? '');
  }
  return input.id;
}

/**
 * W1.4: mirror ASINKRON reverseJournal (JdB) utk lapisan API (TxDb):
 * dijalankan DI DALAM transaksi pemanggil (route POST /api/jurnal).
 * Semantik sama: entry tak ditemukan / tanpa baris -> null; sudah dibalik
 * -> kembalikan id pembalik yang ada (idempoten); aksi lain: tandai
 * reversed_by entry asal lalu tulis entry type='reversal' ber-kaki terbalik
 * via postJournalInTx (UNIQUE(ref_table,ref_id+'#rev1',type) = backstop
 * idempoten untuk ref_id non-null).
 */
export async function reverseJournalInTx(
  db: TxDb,
  entryId: string,
  reason: string,
  user: string
): Promise<string | null> {
  const original = (await db
    .prepare('SELECT * FROM journal_entries WHERE id = ?')
    .get(entryId)) as
    | (Record<string, unknown> & {
        ref_table: string;
        ref_id: string | null;
        entry_date: string;
        reversed_by: string | null;
      })
    | undefined;
  if (!original) return null;
  if (original.reversed_by) return original.reversed_by;

  const lines = (await db
    .prepare('SELECT account_code, debit, credit, source FROM journal_lines WHERE entry_id = ?')
    .all(entryId)) as {
    account_code: string;
    debit: number;
    credit: number;
    source: string;
  }[];
  if (lines.length === 0) return null;

  const revId = entryId + '#rev1';
  await db
    .prepare('UPDATE journal_entries SET reversed_by = ? WHERE id = ?')
    .run(revId, entryId);
  await postJournalInTx(db, {
    id: revId,
    ref_table: original.ref_table,
    ref_id:
      original.ref_id === null || original.ref_id === undefined
        ? null
        : String(original.ref_id) + '#rev1',
    entry_date: original.entry_date,
    type: 'reversal',
    desc: 'Reversal of ' + entryId + ' (alasan: ' + String(reason) + ')',
    created_by: user,
    lines: lines.map((l) => ({
      account_code: l.account_code,
      debit: round(l.credit),
      credit: round(l.debit),
      source: l.source,
    })),
  });
  return revId;
}

/**
 * Jurnal pembalik (koreksi Sek.3.2.2): entry type='reversal' dgn kaki terbalik,
 * reversed_by dua arah, ref_id baru (...#rev1). Idempoten.
 */
export function reverseJournal(
  db: JdB,
  entryId: string,
  reason: string,
  user: string
): string | null {
  const original = db
    .prepare('SELECT * FROM journal_entries WHERE id = ?')
    .get(entryId) as
    | (Record<string, unknown> & {
        ref_table: string;
        ref_id: string | null;
        entry_date: string;
        reversed_by: string | null;
      })
    | undefined;
  if (!original) return null;
  if (original.reversed_by) return original.reversed_by;

  const lines = db
    .prepare(
      'SELECT account_code, debit, credit, source FROM journal_lines WHERE entry_id = ?'
    )
    .all(entryId) as {
    account_code: string;
    debit: number;
    credit: number;
    source: string;
  }[];
  if (lines.length === 0) return null;

  const revId = entryId + '#rev1';
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE journal_entries SET reversed_by = ? WHERE id = ?').run(revId, entryId);
    postSpec(db, {
      id: revId,
      ref_table: original.ref_table,
      ref_id: original.ref_id === null ? null : String(original.ref_id) + '#rev1',
      entry_date: original.entry_date,
      type: 'reversal',
      desc: 'Reversal of ' + entryId + ' (alasan: ' + String(reason) + ')',
      created_by: user,
      lines: lines.map((l) => ({
        account_code: l.account_code,
        debit: round(l.credit),
        credit: round(l.debit),
        source: l.source,
      })),
    });
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* tx sudah menutup */
    }
    throw e;
  }
  return revId;
}

/**
 * Saldo tiap akun SEBELUM tanggal `date` (debit - credit, entry_date < date).
 * Basis buku pembuka (type='opening', Sek.10; 3010 = selisih agar D=K).
 */
export async function openingBalance(
  db: QueryDb,
  date: string
): Promise<Record<string, number>> {
  const rows = (await db
    .prepare(
      `SELECT account_code, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?
       GROUP BY account_code`
    )
    .all(date)) as { account_code: string; d: number; c: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.account_code] = round(r.d) - round(r.c);
  return out;
}

/**
 * Wave-1: penjualan (sales INSERT, Sek.4.1).
 *   Debit kas/bank/piutang = NETO (sales.total)
 *   Kredit 4010 = BRUTO (neto + potongan)
 *   Debit 4020 = diskon + redeem (kontra pendapatan, bila ada)
 *   Debit 5010 HPP / Kredit 1040 Persediaan (bila ada HPP)
 * `discount` = total diskon+redeem; `cogs` = HPP penjualan (disuplai caller
 * dari sale_items x cost_price). Selalu seimbang: HPP menambah sisi debit
 * 2 kaki (5010) dan kredit 2 kaki (1040) dgn jumlah sama.
 */
export function journalForSale(inp: {
  id: number;
  total: number;
  discount?: number;
  pay_method?: string;
  cogs?: number;
  created_at?: string;
  customer?: string;
}): JSpec {
  const total = round(inp.total);
  const contra = round(inp.discount ?? 0);
  const gross = total + contra;
  const hpp = round(inp.cogs ?? 0);
  const cash = saleCashAccount(inp.pay_method ?? '');
  const lines: JLine[] = [
    { account_code: cash, debit: total, credit: 0, source: 'sale' },
    { account_code: ACCT.PEND_PENJUALAN, debit: 0, credit: gross, source: 'sale' },
  ];
  if (contra > 0) {
    lines.push({ account_code: ACCT.POTONGAN, debit: contra, credit: 0, source: 'sale' });
  }
  if (hpp > 0) {
    lines.push({ account_code: ACCT.HPP, debit: hpp, credit: 0, source: 'sale' });
    lines.push({ account_code: ACCT.PERSEDIAAN, debit: 0, credit: hpp, source: 'sale' });
  }
  return {
    id: 'JE-sale-' + inp.id,
    ref_table: 'sales',
    ref_id: inp.id,
    entry_date: inp.created_at ?? '',
    type: 'auto',
    desc: 'Penjualan #' + inp.id + (inp.customer ? ' - ' + inp.customer : ''),
    lines,
  };
}

/**
 * Wave-1: pembelian (purchases INSERT, Sek.4.1).
 *   Debit 1040 Persediaan = qty x unit_cost
 *   Kredit 1010 (lunas) / 2010 Hutang Pembelian (tempo).
 */
export function journalForPurchase(inp: {
  id: number;
  qty: number;
  unit_cost: number;
  on_account?: boolean;
  created_at?: string;
  supplier?: string;
}): JSpec {
  const value = round(inp.qty) * round(inp.unit_cost);
  const counter = inp.on_account ? ACCT.HUTANG_PEMBELIAN : ACCT.KAS_TOKO;
  return {
    id: 'JE-purchase-' + inp.id,
    ref_table: 'purchases',
    ref_id: inp.id,
    entry_date: inp.created_at ?? '',
    type: 'auto',
    desc: 'Pembelian #' + inp.id + (inp.supplier ? ' - ' + inp.supplier : ''),
    lines: [
      { account_code: ACCT.PERSEDIAAN, debit: value, credit: 0, source: 'purchase' },
      { account_code: counter, debit: 0, credit: value, source: 'purchase' },
    ],
  };
}

/**
 * Wave-1: belanja/operasional (expenses INSERT, Sek.4.1).
 *   Debit 5030 Beban Operasional (atau `expense_account` bila ada 50xx lain)
 *   Kredit 1010/1020 (via `pay_acct`; default 1010).
 */
export function journalForExpense(inp: {
  id: number;
  amount: number;
  expense_account?: string;
  pay_acct?: string;
  created_at?: string;
  name?: string;
}): JSpec {
  const amount = round(inp.amount);
  const expAcct = inp.expense_account || ACCT.BEBAN_OPER;
  const payAcct = inp.pay_acct || ACCT.KAS_TOKO;
  return {
    id: 'JE-expense-' + inp.id,
    ref_table: 'expenses',
    ref_id: inp.id,
    entry_date: inp.created_at ?? '',
    type: 'auto',
    desc: 'Beban #' + inp.id + (inp.name ? ' - ' + inp.name : ''),
    lines: [
      { account_code: expAcct, debit: amount, credit: 0, source: 'expense' },
      { account_code: payAcct, debit: 0, credit: amount, source: 'expense' },
    ],
  };
}

/**
 * Wave-1: kas manual (cash_entries INSERT, Sek.4.1).
 *   income:  Debit 1010/1020 -> Kredit 4040(ujrah)/4090(ZIS)/3010(modal)
 *   expense: Debit 5030/4030 -> Kredit 1010/1020
 * Akun lawan via cashEntryCounterpart (berbasis label).
 */
export function journalForCashEntry(inp: {
  id: number;
  type: string;
  label: string;
  amount: number;
  created_at?: string;
  pay_acct?: string;
}): JSpec {
  const amount = round(inp.amount);
  const counter = cashEntryCounterpart(inp.type, inp.label);
  const cash = cashEntryCashAccount(inp.label, inp.pay_acct);
  const lines: JLine[] =
    inp.type === 'income'
      ? [
          { account_code: cash, debit: amount, credit: 0, source: 'cash' },
          { account_code: counter, debit: 0, credit: amount, source: 'cash' },
        ]
      : [
          { account_code: counter, debit: amount, credit: 0, source: 'cash' },
          { account_code: cash, debit: 0, credit: amount, source: 'cash' },
        ];
  return {
    id: 'JE-cash-' + inp.id,
    ref_table: 'cash_entries',
    ref_id: inp.id,
    entry_date: inp.created_at ?? '',
    type: 'auto',
    desc: 'Kas ' + inp.type + ' - ' + inp.label,
    lines,
  };
}

/**
 * W2.1 (F3.4+) -- builder auto-posting Wave 2 (proposal Sek.4.2, OQ-3/OQ-4):
 * pembayaran piutang/hutang, retur penjualan/pembelian, konsinyasi
 * (ujrah + settlement). Dipanggil route DI DALAM tx V1, hanya jika
 * settings.gl_enabled='1' (flag off -> nol perubahan V1).
 *
 * Catatan arsitektur (tidak ada double-booking kas): V1 menulis baris
 * cash_entries label "Bayar piutang" / "Bayar hutang" / "Retur #.." /
 * "Ujrah Kon." / "Kon." LANGSUNG ke tabel cash_entries (bukan lewat
 * POST /api/kas) -- jadi auto-poster cash_entries W1.3 TIDAK pernah
 * mem-posting label-label itu. Jurnal di atas adalah satu-satunya
 * pencatatan GL dari peristiwa-peristiwa tersebut.
 */

/** Stempel saat ini zona WIB (+07:00) utk entry_date (rekon #17). */
export function nowWib(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().replace('Z', '+07:00');
}

/**
 * Sek.4.2 (3): pembayaran piutang customer (cicilan debts/[id] pay).
 *   Debit 1010 Kas -> Kredit 1030 Piutang Penjualan.
 * OQ-4: ref_id komposit 'debts:<id>:<cumPaid>' (cumPaid = total `paid`
 * SAAT event; UNIQUE(ref_table,ref_id,type) = idempoten per cicilan;
 * double-submit -> ref sama -> no-op).
 */
export function journalForDebtPayment(inp: {
  debtId: number;
  cumPaid: number;
  amount: number;
  customer?: string;
  entry_date?: string;
}): JSpec {
  const a = round(inp.amount);
  if (a <= 0) throw new Error('journalForDebtPayment: amount harus > 0');
  return {
    id: 'JE-debtpay-' + inp.debtId + '-' + inp.cumPaid,
    ref_table: 'debts',
    ref_id: 'debts:' + inp.debtId + ':' + inp.cumPaid,
    entry_date: inp.entry_date ?? nowWib(),
    type: 'debt_payment',
    desc: 'Pembayaran piutang #' + inp.debtId + (inp.customer ? ' - ' + inp.customer : ''),
    lines: [
      { account_code: ACCT.KAS_TOKO, debit: a, credit: 0, source: 'debt_payment' },
      { account_code: ACCT.PIUTANG, debit: 0, credit: a, source: 'debt_payment' },
    ],
  };
}

/**
 * Sek.4.2 (2): pembayaran hutang supplier (cicilan payables/[id] pay).
 *   Debit 2010 Hutang Pembelianan -> Kredit 1010 Kas.
 * OQ-4: ref_id komposit 'payables:<id>:<cumPaid>'.
 */
export function journalForPayablePayment(inp: {
  payableId: number;
  cumPaid: number;
  amount: number;
  supplier?: string;
  entry_date?: string;
}): JSpec {
  const a = round(inp.amount);
  if (a <= 0) throw new Error('journalForPayablePayment: amount harus > 0');
  return {
    id: 'JE-payablepay-' + inp.payableId + '-' + inp.cumPaid,
    ref_table: 'payables',
    ref_id: 'payables:' + inp.payableId + ':' + inp.cumPaid,
    entry_date: inp.entry_date ?? nowWib(),
    type: 'payable_payment',
    desc: 'Pembayaran hutang #' + inp.payableId + (inp.supplier ? ' - ' + inp.supplier : ''),
    lines: [
      { account_code: ACCT.HUTANG_PEMBELIAN, debit: a, credit: 0, source: 'payable_payment' },
      { account_code: ACCT.KAS_TOKO, debit: 0, credit: a, source: 'payable_payment' },
    ],
  };
}

/**
 * OQ-3 (sales return, struktur APPROVED): baris returns POST.
 *   D4030 (retur harga) X  +  D1040 (stok kembali) C
 *   K(cashAcct) X (1010 = refund tunai / 1030 = offset piutang)
 *   +  K5020 (HPP reversal) C.
 * cogs = snapshot HPP jumlah diretur (0/kurang -> kaki HPP di-skip,
 * 2 kaki sisanya tetap seimbang).
 */
export function journalForSalesReturn(inp: {
  returnId: number;
  saleId: number;
  amount: number;
  cogs: number;
  cashAcct: '1010' | '1030';
  product?: string;
  entry_date?: string;
}): JSpec {
  const a = round(inp.amount);
  const c = round(inp.cogs);
  const lines: JLine[] = [
    { account_code: ACCT.RETUR_PENJUALAN, debit: a, credit: 0, source: 'sales_return' },
    { account_code: inp.cashAcct, debit: 0, credit: a, source: 'sales_return' },
  ];
  if (c > 0) {
    lines.push({ account_code: ACCT.PERSEDIAAN, debit: c, credit: 0, source: 'sales_return' });
    lines.push({ account_code: ACCT.RETUR_HPP, debit: 0, credit: c, source: 'sales_return' });
  }
  return {
    id: 'JE-salesretur-' + inp.returnId,
    ref_table: 'returns',
    ref_id: String(inp.returnId),
    entry_date: inp.entry_date ?? nowWib(),
    type: 'sales_return',
    desc:
      'Retur #' + inp.returnId + ' (transaksi #' + inp.saleId + ')' +
      (inp.product ? ' - ' + inp.product : ''),
    lines,
  };
}

/**
 * OQ-3 RULING (purchase return): 1 entry, refund DI HARGA POKOK,
 * tanpa dampak P&L (nada kaki 5xxx):
 *   Debit 2010 Hutang Pembelianan -> Kredit 1040 Persediaan.
 * V1 belum punya fitur retur pembelian -> builder utk posting manual
 * / penutupan periode (W5); tidak ada hook route di W2.1.
 */
export function journalForPurchaseReturn(inp: {
  returnRef: string;
  cost: number;
  supplier?: string;
  entry_date?: string;
}): JSpec {
  const a = round(inp.cost);
  if (a <= 0) throw new Error('journalForPurchaseReturn: cost harus > 0');
  return {
    id: 'JE-purchretur-' + inp.returnRef,
    ref_table: 'purchase_returns',
    ref_id: String(inp.returnRef),
    entry_date: inp.entry_date ?? nowWib(),
    type: 'purchase_return',
    desc: 'Retur pembelian (harga pokok)' + (inp.supplier ? ' - ' + inp.supplier : ''),
    lines: [
      { account_code: ACCT.HUTANG_PEMBELIAN, debit: a, credit: 0, source: 'purchase_return' },
      { account_code: ACCT.PERSEDIAAN, debit: 0, credit: a, source: 'purchase_return' },
    ],
  };
}

/**
 * Sek.4.2 + COA 154: ujrah konsinyasi (aksi sell, akad ju'alah --
 * P4 tashih 30 Sep: ujrah -> pendapatan 4040; V1 kas masuk "Ujrah
 * Kon."). Debit 1010 -> Kredit 4040 (ujrah = n x unit komisi;
 * dipanggil HANYA bila > 0). OQ-4: ref_id komposit
 * 'kons:<id>:sell:<qtySoldAfter>'.
 *
 * OQ-7 Option C (1 Okt 2026): settlement (aksi pay, D2020/K1010)
 * DITUNDA ke W3/W4 bersama goods-receipt (D1040/K2020) agar 2020
 * rekonsiliasi. W2.1 HANYA post ujrah (builder ini).
 */
export function journalForConsignmentUjrah(inp: {
  consId: number;
  qtySoldAfter: number;
  ujrah: number;
  owner?: string;
  entry_date?: string;
}): JSpec {
  const a = round(inp.ujrah);
  if (a <= 0) throw new Error('journalForConsignmentUjrah: ujrah harus > 0');
  return {
    id: 'JE-konsujrah-' + inp.consId + '-' + inp.qtySoldAfter,
    ref_table: 'konsinyasi',
    ref_id: 'kons:' + inp.consId + ':sell:' + inp.qtySoldAfter,
    entry_date: inp.entry_date ?? nowWib(),
    type: 'consignment_ujrah',
    desc: 'Ujrah konsinyasi #' + inp.consId + (inp.owner ? ' - ' + inp.owner : ''),
    lines: [
      { account_code: ACCT.KAS_TOKO, debit: a, credit: 0, source: 'consignment_ujrah' },
      { account_code: ACCT.UJRAH, debit: 0, credit: a, source: 'consignment_ujrah' },
    ],
  };
}

// ---------------------------------------------------------------------------
// W3.4 (bridge wakalah, Sek.6.4): settlement konsinyasi (aksi pay).
// D2020 (hutang konsinyasi dibayar) / K1010 (kas keluar).
// OQ-7 resolved: K2020 dibuat oleh akad settlement recognition
// (D1010/K2020+K4010 via lib/akad.ts) -- 2020 reconciles to 0
// when fully paid. OQ-4: ref_id 'kons:<id>:pay:<cumPaid>'.
// ---------------------------------------------------------------------------
/**
 * W3.4: settlement konsinyasi (aksi pay).
 * D2020 (hutang konsinyasi dibayar) / K1010 (kas keluar).
 * OQ-7: K2020 eksis via akad settlement recognition (bridge, Sek.6.4).
 */
export function journalForConsignmentSettlement(inp: {
  consId: number;
  cumPaid: number;
  amount: number;
  owner?: string;
  entry_date?: string;
}): JSpec {
  const a = round(inp.amount);
  if (a <= 0) throw new Error('journalForConsignmentSettlement: amount harus > 0');
  return {
    id: 'JE-konssettle-' + inp.consId + '-' + inp.cumPaid,
    ref_table: 'konsinyasi',
    ref_id: 'kons:' + inp.consId + ':pay:' + inp.cumPaid,
    entry_date: inp.entry_date ?? nowWib(),
    type: 'consignment_settlement',
    desc: 'Settlement konsinyasi #' + inp.consId + (inp.owner ? ' - ' + inp.owner : ''),
    lines: [
      { account_code: ACCT.HUTANG_KONSINYASI, debit: a, credit: 0, source: 'consignment_settlement' },
      { account_code: ACCT.KAS_TOKO,         debit: 0, credit: a, source: 'consignment_settlement' },
    ],
  };
}

