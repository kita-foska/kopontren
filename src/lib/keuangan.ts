/**
 * FASE A1 — Laporan Laba-Rugi Operasional V1 (endpoint /api/keuangan).
 *
 * Modul ini INTENSI BEBAS-IMPORT runtime (hanya import type, dihapus saat
 * compile) supaya bisa diuji langsung oleh Node (type-stripping) lewat
 * libsql in-memory — lihat scripts/test-keuangan.ts. Pola sama dengan
 * perks.ts (diuji scripts/test-margin.ts).
 *
 * ── Keputusan A1 (di-approve user, pasca audit A0) ─────────────────────
 * V1:
 *  - Return revenue dikurangkan (seluruh `returns.amount` yang tercatat).
 *  - Return COGS BELUM dibalik: baris return tidak menyimpan cost
 *    snapshot → angka konservatif. Skema `returns` JANGAN diubah di V1.
 *  - `sales.total` sudah NETO (diskon manual, diskon member, dan redeem
 *    sudah dipotong saat transaksi) → Pendapatan Bersih = Σsales.total −
 *    Σreturns.amount. "Bruto" hanya dipakai utk detail ekspansi UI.
 *  - Cashback = kewajiban member (saldo tertunda), BUKAN beban →
 *    ditampilkan sebagai MEMO saja (anti dobel hitung: redeem cashback
 *    sudah mengurangi transaksi saat dipakai).
 *  - Zakat tercatat di zakat_history (bukan expenses) → MEMO, terpisah.
 *  - Settlement konsinyasi = cash-out ke pemilik (label cash_entries
 *    'Kon. …'); penjualan barangnya TIDAK masuk `sales` → off-P&L,
 *    ditampilkan sebagai MEMO, bukan beban operasional.
 *  - FASE P4: komisi konsinyasi (ujrah, akad ju'alah; setting
 *    konsinyasi_commission default 20%) tercatat OTOMATIS sebagai kas
 *    masuk 'Ujrah Kon. …' saat barang terjual (/api/konsinyasi action
 *    'sell') → MEMO off-P&L selayaknya settlement; tagihan pemilik di
 *    /api/konsinyasi sudah NETO komisi (pemilik 80%, toko 20%).
 *  - Piutang manual (debts) & hutang supplier (payables) BUKAN modul
 *    penjualan/pembelian (off-POS) → TIDAK dibaca oleh P&L; pelunasannya
 *    hanya pergerakan kas (cakupan FASE A2 Arus Kas).
 *
 * Ini "Laporan Laba-Rugi Operasional V1 berdasarkan transaksi yang
 * tercatat dalam sistem" — BUKAN akuntansi final (lihat KEUANGAN_NOTES).
 */

/**
 * Permukaan DB minimal (match type `Db` di src/db.ts). Didefinisikan
 * lokal agar modul tetap bebas-import untuk unit test native-node.
 */
export type QueryDb = {
  prepare(sql: string): {
    get(...args: unknown[]): Promise<unknown>;
    all(...args: unknown[]): Promise<unknown[]>;
  };
};

/** Agregat per kategori beban operasional (detail akordeon UI). */
export type BebanKategori = { kategori: string; total: number; count: number };

export type KeuanganPayload = {
  /** Jumlah transaksi penjualan di periode (info, bukan angka uang). */
  sales_count: number;
  pendapatan: {
    /** Σ(total + discount + member_discount + redeem) — utk detail saja. */
    bruto: number;
    /** Σ sales.total (neto diskon/redeem) — basis pendapatan. */
    penjualan: number;
    /** Σ sales.discount (potongan manual/kasir). */
    diskonManual: number;
    /** Σ sales.member_discount (perk member, tercatat terpisah). */
    diskonMember: number;
    /** Σ sales.redeem (tebus poin/saldo). */
    redeem: number;
    /** Σ returns.amount — seluruh retur tercatat. */
    retur: number;
    /** penjualan − retur. */
    bersih: number;
  };
  /** HPP: Σ si.qty × COALESCE(NULLIF(si.cost_price,0), p.cost_price, 0). */
  hpp: number;
  /** pendapatan.bersih − hpp. */
  labaKotor: number;
  beban: {
    /** Σ expenses.amount [periode]. */
    total: number;
    count: number;
    byCategory: BebanKategori[];
  };
  /** labaKotor − beban.total. */
  labaBersih: number;
  /**
   * Memo: TIDAK dijumlahkan ke labaBersih. UI wajib menampilkan terpisah
   * dan tidak menjumlahkan.
   */
  memo: {
    cashback: { total: number };
    zakat: { total: number; count: number };
    konsinyasi: { total: number; count: number };
    ujrah_konsinyasi: { total: number; count: number };
  };
};

/**
 * Catatan keterbatasan V1 — ditampilkan UI (kotak "Catatan V1") dan
 * ikut di-export CSV. JANGAN diedit sembarangan: setiap baris = keputusan
 * A1 yang di-approve user.
 */
export const KEUANGAN_NOTES: string[] = [
  'Perhitungan V1 menggunakan seluruh retur yang tercatat. Status refund belum tersimpan secara permanen — angka bisa mencakup retur tanpa pengembalian uang.',
  'COGS untuk retur belum dibalik (baris retur tidak menyimpan cost snapshot); harga pokok bersifat konservatif.',
  'Cashback adalah kewajiban kepada member (saldo tertunda), bukan beban — ditampilkan sebagai memo agar tidak dobel hitung.',
  'Zakat tercatat terpisah (zakat_history), bukan beban operasional — ditampilkan sebagai memo.',
  'Settlement konsinyasi adalah pembayaran kepada pemilik barang (di luar P&L; penjualan barangnya tidak tercatat di sales) — ditampilkan sebagai memo, bukan beban.',
  "Komisi konsinyasi (ujrah, akad ju'alah; default 20%) tercatat OTOMATIS sebagai kas masuk ('Ujrah Kon. …') saat barang terjual; tagihan pemilik sudah neto komisi — jangan dicatat manual agar tidak dobel hitung.",
  'Piutang manual (debts) dan hutang supplier (payables) tidak memengaruhi laporan ini; pelunasannya hanya pergerakan kas (cakupan laporan arus kas, fase A2).',
];
/**
 * Hitung P&L V1 utk rentang [fromIso, toIso] (batas ISO-UTC, inklusif).
 * Batas dihitung server dari hari kalender WIB (lihat route).
 *
 * Yang INTENSI TIDAK dibaca: debts, payables, purchases, shifts —
 * modul piutang/payable/belanja off-P&L di V1 (regression test #8/#9
 * memverifikasi isolasi ini).
 */
export async function queryKeuangan(
  d: QueryDb,
  fromIso: string,
  toIso: string
): Promise<KeuanganPayload> {
  const p: unknown[] = [fromIso, toIso];

  const sales = (await d
    .prepare(
      `SELECT COUNT(*) c,
              COALESCE(SUM(total), 0) t,
              COALESCE(SUM(discount), 0) disc,
              COALESCE(SUM(member_discount), 0) mdisc,
              COALESCE(SUM(cashback), 0) cb,
              COALESCE(SUM(redeem), 0) red
       FROM sales
       WHERE created_at >= ? AND created_at <= ?`
    )
    .get(...p)) as { c: number; t: number; disc: number; mdisc: number; cb: number; red: number };

  const ret = (await d
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(amount), 0) v
       FROM returns WHERE created_at >= ? AND created_at <= ?`
    )
    .get(...p)) as { c: number; v: number };

  // HPP per-item (snapshot): cost_price saat penjualan; fallback harga
  // produk saat ini hanya bila snapshot 0 (legacy). RUMUS SAMA PERSIS
  // dengan /api/reports (konsistensi angka antar-laporan).
  const hppRow = (await d
    .prepare(
      `SELECT COALESCE(SUM(si.qty * COALESCE(NULLIF(si.cost_price, 0), p.cost_price, 0)), 0) v
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= ? AND s.created_at <= ?`
    )
    .get(...p)) as { v: number };

  const exp = (await d
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(amount), 0) v
       FROM expenses WHERE created_at >= ? AND created_at <= ?`
    )
    .get(...p)) as { c: number; v: number };

  const byCat = (await d
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(category), ''), '(tanpa kategori)') kategori,
              COUNT(*) c, COALESCE(SUM(amount), 0) v
       FROM expenses
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY kategori
       ORDER BY v DESC`
    )
    .all(...p)) as { kategori: string; c: number; v: number }[];

  // Memo zakat: difilter by paid_at (tanggal bayar), bukan created_at.
  const zakat = (await d
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(zakat_amount), 0) v
       FROM zakat_history WHERE paid_at >= ? AND paid_at <= ?`
    )
    .get(...p)) as { c: number; v: number };

  // Memo konsinyasi: settlement = cash_entries expense berlabel
  // 'Kon. <pemilik> - <barang>' (dibuat /api/konsinyasi action 'pay').
  // TIDAK pernah masuk expenses → aman dari dobel hitung beban.
  const kons = (await d
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(amount), 0) v
       FROM cash_entries
       WHERE type = 'expense' AND label LIKE 'Kon. %' AND created_at >= ? AND created_at <= ?`
    )
    .get(...p)) as { c: number; v: number };

  // Memo ujrah (FASE P4, akad ju'alah): komisi konsinyasi = cash_entries
  // INCOME berlabel 'Ujrah Kon. <pemilik> - <barang>' (dibuat
  // /api/konsinyasi action 'sell' saat barang terjual — upah tidak di
  // muka; barang dikembalikan tidak menghasilkan jurnal ini). Off-P&L
  // V1 selayaknya settlement; otomatis, jangan dobel hitung manual.
  const ujrah = (await d
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(amount), 0) v
       FROM cash_entries
       WHERE type = 'income' AND label LIKE 'Ujrah Kon. %' AND created_at >= ? AND created_at <= ?`
    )
    .get(...p)) as { c: number; v: number };

  // Bruto = neto + potongan yang sudah dipotong (hanya utk detail UI).
  const bruto = sales.t + sales.disc + sales.mdisc + sales.red;
  const bersih = sales.t - ret.v;
  const labaKotor = bersih - hppRow.v;

  return {
    sales_count: sales.c,
    pendapatan: {
      bruto,
      penjualan: sales.t,
      diskonManual: sales.disc,
      diskonMember: sales.mdisc,
      redeem: sales.red,
      retur: ret.v,
      bersih,
    },
    hpp: hppRow.v,
    labaKotor,
    beban: {
      total: exp.v,
      count: exp.c,
      byCategory: byCat.map((x) => ({ kategori: x.kategori, total: x.v, count: x.c })),
    },
    labaBersih: labaKotor - exp.v,
    memo: {
      cashback: { total: sales.cb },
      zakat: { total: zakat.v, count: zakat.c },
      konsinyasi: { total: kons.v, count: kons.c },
      ujrah_konsinyasi: { total: ujrah.v, count: ujrah.c },
    },
  };
}
