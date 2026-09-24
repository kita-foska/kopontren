/**
 * FASE A3 — Neraca Sederhana V1 (endpoint /api/neraca).
 *
 * Modul ini INTENSI BEBAS-IMPORT runtime (hanya import type, dihapus
 * saat compile) supaya bisa diuji langsung oleh Node (type-stripping)
 * lewat node:sqlite in-memory — lihat scripts/test-neraca.ts. Pola sama
 * dengan keuangan.ts (FASE A1; pola harness scripts/test-split.ts).
 *
 * ── Keputusan A3 (V1, "foto posisi per hari ini") ──────────────────────
 *  - Neraca = SNAPSHOT, BUKAN laporan berbasis periode: semua query
 *    TANPA filter tanggal (saldo kas kumulatif, stok saat ini, tagihan
 *    terbuka). Berbeda dgn Laba-Rugi/Arus Kas (FASE A1/A2).
 *  - Kas memakai rumus KANONIS halaman Kas (/api/kas kasAgg):
 *      Σsales.total + Σcash_entries(income)
 *      − Σpurchases(qty×unit_cost) − Σexpenses.amount
 *      − Σcash_entries(expense)
 *    → angka identik dgn "Saldo Kas" halaman Kas (tidak boleh beda
 *    antar-halaman). Mencakup metode transfer/WhatsApp, bukan kas
 *    fisik.
 *  - Stok dinilai HARGA BELI (products.cost_price), BUKAN harga jual
 *    — basis HPP, konsisten dgn agregat "Kas keluar (belanja)"
 *    /api/reports. Stok negatif (oversell) & cost_price 0 (legacy
 *    tanpa harga beli) diabaikan: WHERE stock > 0 AND cost_price > 0.
 *  - Piutang = debts.status='open' → SUM(remaining) (sisa tagihan),
 *    BUKAN SUM(amount) (total tagihan awal). Hutang = sama untuk
 *    payables.status='open'. Pelunasan otomatis terekam karena
 *    remaining diperbarui saat tagihan di-settle.
 *  - Saldo reward member (members.cashback_balance > 0) = KEWAJIBAN
 *    (kumulasi cashback belum ditebus) → liabilitas, BUKAN beban —
 *    konsisten dgn keputusan A1 (cashback = kewajiban, bukan beban).
 *  - Konsinyasi TERBUKA (consignment_items.status='open') = tagihan
 *    ke pemilik yang BELUM menjadi utang resmi (belum di-settle) →
 *    ditampilkan OFF-BALANCE (memo), TIDAK dijumlahkan ke
 *    liabilitas, selayaknya konsinyasi off-P&L pada FASE A1.
 *  - "Modal Setara" = Total Aset − Total Kewajiban. BUKAN ekuitas
 *    akuntansi formal (sistem tidak menyimpan saldo awal/modal
 *    disetor) — label "setara" disengaja.
 *
 * Ini "Neraca sederhana V1 berdasarkan transaksi yang tercatat dalam
 * sistem" — BUKAN akuntansi final (lihat NERACA_NOTES).
 */

import type { QueryDb } from './keuangan.ts';

/** Detail 5 stok terbesar (nilai harga beli) — daftar ringkas UI. */
export type NeracaStokDetail = {
  name: string;
  qty: number;
  unit_value: number;
  total: number;
};

/** Detail 5 tagihan terbuka terbesar (remaining). */
export type NeracaTagihanDetail = {
  name: string;
  remaining: number;
  due_date: string;
};

export type NeracaPayload = {
  /**
   * Saldo kas kumulatif — rumus identik /api/kas:
   * Σsales + cash_in − Σpurchases(qty×unit_cost) − Σexpenses − cash_out.
   */
  kas: number;
  stok: {
    /** Σ stock × cost_price (hanya stock > 0 AND cost_price > 0). */
    total: number;
    /** Jumlah SKU dengan stok & harga beli tercatat. */
    count: number;
    /** Total unit (stock > 0). */
    units: number;
  };
  /** Σ debts.remaining WHERE status='open'. */
  piutang: { total: number; count: number };
  /** kas + stok.total + piutang.total */
  aset_total: number;
  /** Σ payables.remaining WHERE status='open'. */
  hutang: { total: number; count: number };
  /** Σ members.cashback_balance (>0) — kewajiban reward member. */
  cashback: { total: number; count: number };
  /** hutang.total + cashback.total (TIDAK termasuk off-balance). */
  liabilitas_total: number;
  /** aset_total − liabilitas_total (bukan ekuitas akuntansi). */
  modal_setara: number;
  /**
   * OFF-BALANCE: TIDAK dijumlahkan ke liabilitas (keputusan A3,
   * selayaknya konsinyasi off-P&L FASE A1).
   */
  off_balance: {
    /** Σ consignment_items.amount (status='open', belum di-settle). */
    konsinyasi: { total: number; count: number };
  };
  rincian: {
    /** 5 stok terbesar (urutan nilai harga beli DESC). */
    stok_top: NeracaStokDetail[];
    /** 5 piutang terbuka terbesar (remaining DESC). */
    piutang_top: NeracaTagihanDetail[];
    /** 5 hutang terbuka terbesar (remaining DESC). */
    hutang_top: NeracaTagihanDetail[];
  };
};

/**
 * Catatan keterbatasan V1 — ditampilkan UI (kotak "Catatan V1"),
 * konsisten dgn KEUANGAN_NOTES (FASE A1). Setiap baris = keputusan A3.
 */
export const NERACA_NOTES: string[] = [
  'Kas memakai rumus halaman Kas: penjualan − belanja − pengeluaran + jurnal kas manual (masuk − keluar). Mencakup pembayaran transfer/WhatsApp, bukan kas fisik saja.',
  'Stok dinilai pada harga beli (cost_price), bukan harga jual — konsisten dengan basis HPP; stok negatif (oversell) & produk tanpa harga beli diabaikan.',
  'Piutang & hutang hanya tagihan status TERBUKA (sisa outstanding, kolom remaining). Pelunasan otomatis memperbarui sisa saat tagihan di-settle.',
  'Saldo reward member (cashback) dicatat sebagai KEWAJIBAN, bukan beban — selaras keputusan FASE A1.',
  'Tagihan konsinyasi terbuka (barang titipan belum di-settle) ditampilkan OFF-BALANCE, tidak dijumlahkan ke neraca.',
  '"Modal Setara" = total aset − total kewajiban; bukan ekuitas akuntansi formal (sistem belum menyimpan saldo awal/modal disetor).',
];

/**
 * Hitung Neraca Sederhana V1 (snapshot "per hari ini" — tanpa argumen
 * tanggal). Yang INTENSI TIDAK dibaca: shifts, sale_items, returns,
 * zakat_history — posisi asset/liabilitas hanya berasal dari tabel
 * di atas (anti dobel hitung dgn P&L/Arus Kas FASE A1/A2: mis. retur &
 * HPP historis sudah tercermin di Σsales.total neto, jangan ditambah
 * kembali).
 */
export async function queryNeraca(d: QueryDb): Promise<NeracaPayload> {
  // ── ASET ──
  // Kas: rumus KANONIS halaman Kas (/api/kas kasAgg) — global kumulatif.
  const sales = (await d
    .prepare('SELECT COALESCE(SUM(total), 0) v FROM sales')
    .get()) as { v: number };
  const purchases = (await d
    .prepare('SELECT COALESCE(SUM(qty * unit_cost), 0) v FROM purchases')
    .get()) as { v: number };
  const expenses = (await d
    .prepare('SELECT COALESCE(SUM(amount), 0) v FROM expenses')
    .get()) as { v: number };
  const cashIn = (await d
    .prepare("SELECT COALESCE(SUM(amount), 0) v FROM cash_entries WHERE type = 'income'")
    .get()) as { v: number };
  const cashOut = (await d
    .prepare("SELECT COALESCE(SUM(amount), 0) v FROM cash_entries WHERE type = 'expense'")
    .get()) as { v: number };
  const kas = sales.v + cashIn.v - purchases.v - expenses.v - cashOut.v;

  // Stok: basis harga beli; stok negatif (oversell) & tanpa harga beli
  // (legacy cost_price 0) diabaikan.
  const stokRow = (await d
    .prepare(
      `SELECT COUNT(*) c,
              COALESCE(SUM(stock * cost_price), 0) v,
              COALESCE(SUM(stock), 0) units
       FROM products
       WHERE stock > 0 AND cost_price > 0`
    )
    .get()) as { c: number; v: number; units: number };

  // Piutang: sisa tagihan terbuka (bukan total tagihan awal).
  const piutangRow = (await d
    .prepare(
      "SELECT COUNT(*) c, COALESCE(SUM(remaining), 0) v FROM debts WHERE status = 'open'"
    )
    .get()) as { c: number; v: number };

  // ── KEWAJIBAN ──
  const hutangRow = (await d
    .prepare(
      "SELECT COUNT(*) c, COALESCE(SUM(remaining), 0) v FROM payables WHERE status = 'open'"
    )
    .get()) as { c: number; v: number };

  // Saldo reward member: akumulasi cashback belum ditebus (kewajiban).
  const cashbackRow = (await d
    .prepare(
      `SELECT COUNT(CASE WHEN cashback_balance > 0 THEN 1 END) c,
              COALESCE(SUM(CASE WHEN cashback_balance > 0 THEN cashback_balance ELSE 0 END), 0) v
       FROM members`
    )
    .get()) as { c: number; v: number };

  // ── OFF-BALANCE (memo, TIDAK dijumlahkan ke neraca) ──
  const konRow = (await d
    .prepare(
      "SELECT COUNT(*) c, COALESCE(SUM(amount), 0) v FROM consignment_items WHERE status = 'open'"
    )
    .get()) as { c: number; v: number };

  // ── Detail 5 terbesar per pos (UI ringkas, batas LIMIT 5) ──
  const stokTop = (await d
    .prepare(
      `SELECT name, stock qty, cost_price unit_value, stock * cost_price total
       FROM products
       WHERE stock > 0 AND cost_price > 0
       ORDER BY total DESC
       LIMIT 5`
    )
    .all()) as NeracaStokDetail[];

  const piutangTop = (await d
    .prepare(
      `SELECT customer_name name, remaining, due_date
       FROM debts
       WHERE status = 'open'
       ORDER BY remaining DESC
       LIMIT 5`
    )
    .all()) as NeracaTagihanDetail[];

  const hutangTop = (await d
    .prepare(
      `SELECT owner_name name, remaining, due_date
       FROM payables
       WHERE status = 'open'
       ORDER BY remaining DESC
       LIMIT 5`
    )
    .all()) as NeracaTagihanDetail[];

  const aset_total = kas + stokRow.v + piutangRow.v;
  const liabilitas_total = hutangRow.v + cashbackRow.v;

  return {
    kas,
    stok: { total: stokRow.v, count: stokRow.c, units: stokRow.units },
    piutang: { total: piutangRow.v, count: piutangRow.c },
    aset_total,
    hutang: { total: hutangRow.v, count: hutangRow.c },
    cashback: { total: cashbackRow.v, count: cashbackRow.c },
    liabilitas_total,
    modal_setara: aset_total - liabilitas_total,
    off_balance: { konsinyasi: { total: konRow.v, count: konRow.c } },
    rincian: { stok_top: stokTop, piutang_top: piutangTop, hutang_top: hutangTop },
  };
}