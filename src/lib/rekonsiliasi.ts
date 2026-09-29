/**
 * P0-C3 — Rekonsiliasi data: endpoint /api/reconciliation + halaman
 * /admin/rekonsiliasi.
 *
 * Modul ini INTENSI BEBAS-IMPORT runtime (hanya import type, dihapus saat
 * compile) supaya bisa diuji langsung oleh Node (type-stripping) lewat
 * node:sqlite in-memory — lihat scripts/test-rekonsiliasi.ts. Pola sama
 * dengan keuangan.ts / neraca.ts.
 *
 * ── Keputusan P0-C3 (flag-only, TANPA auto-fix) ──────────────────────
 *  - READ-ONLY: hanya SELECT. Tidak ada penyetaraan/perbaikan data;
 *    selisih dilaporkan sebagai "drift" + detail baris (top 20/cek).
 *  - Mirror kontrak P0-C2 (docs/qa/DATA-INVARIANTS.md, INV-1..7) saat
 *    runtime, ditambah cross-check antarmodul: shif vs window POS,
 *    pembayaran campur, ledger poin/reward, konsinyasi vs pembukuan kas.
 *  - Ledger poin: reason earn/redeem/void/return — penyempurnaan INV-4:
 *    reason 'refund' TIDAK ditulis app manapun; 'return' ditulis saat
 *    rollback retur penuh (returns/route.ts). Ledger cashback:
 *    cashback(+) / cashback_use(−) / return_cash(−) (sales + returns).
 *  - Data legacy (poin tanpa baris ledger, jurnal kas manual berlabel
 *    'Kon. …'/'Ujrah Kon. …') bisa sah-saja memicu flag: modul ini
 *    MELAPORKAN, tidak memutuskan.
 *
 * 13 cek: SALES_PAY, SALES_MONEY, SPLIT, SHIFT, RETURN, STOCK, DEBTS,
 * PAYABLES, POINTS, CASHBACK, KONSIN, KONSIN_UJRAH, KONSIN_PAY.
 */

import type { QueryDb } from './keuangan.ts';

/** ID cek stabil — UI memakai untuk konfigurasi kolom detail. */
export type RekCheckId =
  | 'SALES_PAY'
  | 'SALES_MONEY'
  | 'SPLIT'
  | 'SHIFT'
  | 'RETURN'
  | 'STOCK'
  | 'DEBTS'
  | 'PAYABLES'
  | 'POINTS'
  | 'CASHBACK'
  | 'KONSIN'
  | 'KONSIN_UJRAH'
  | 'KONSIN_PAY';

export type RekCheck = {
  id: RekCheckId;
  label: string;
  status: 'ok' | 'drift';
  /** Jumlah baris/entri selisih (1 utk cek agregat kas). */
  drift_count: number;
  detail: string;
  /** Top ≤20 baris selisih; cek agregat = 1 baris ringkasan. */
  rows: Record<string, unknown>[];
};

export type RekPayload = {
  as_of: string;
  /** true bila SEMUA cek selaras (drift_total = 0). */
  clean: boolean;
  drift_total: number;
  checks: RekCheck[];
};

/** Catatan V1 — ditampilkan UI; setiap baris = keputusan P0-C3. */
export const REKONSILIASI_NOTES: string[] = [
  'Flag-only read-only: modul ini TIDAK memodifikasi data; selisih dilaporkan dengan detail baris (top 20 per cek).',
  'Penjualan vs pembayaran: amount_paid − change harus = total utk semua baris sales (metode tunggal & campur; kontrak INV-7 P0-C2).',
  'Pembayaran campur (pay_split): JSON valid + Σ bagian = total + metode dikenal (cash/tf/wa); baris legacy tanpa pay_split memakai pay_method & bukan target cek split.',
  'Cek shif membandingkan 30 shif closed terakhir; by_method (JSON per-metode) tidak dibandingkan.',
  'Ledger reward: poin (earn/redeem/void/return) & cashback (cashback/cashback_use/return_cash) — penyempurnaan INV-4 P0-C2.',
  "Data legacy (poin tanpa ledger, jurnal kas manual berlabel 'Kon. …'/'Ujrah Kon. …') bisa memicu flag sah-saja — modul melaporkan, tidak memutuskan.",
  'Dikenal (di luar cakupan C3): /api/neraca off-balance masih membaca tabel legacy consignment_items yang tak ada di skema saat ini (data P4 ada di consignments).',
];

const TOP = 20;

/** `SELECT … c` → nilai numerik (COALESCE di sisi SQL). */
async function num(d: QueryDb, sql: string, ...args: unknown[]): Promise<number> {
  const r = (await d.prepare(sql).get(...args)) as { c: number } | undefined;
  return Number(r?.c ?? 0) || 0;
}

async function topRows(d: QueryDb, sql: string, ...args: unknown[]): Promise<Record<string, unknown>[]> {
  return (await d.prepare(sql).all(...args)) as Record<string, unknown>[];
}

function chk(
  id: RekCheckId,
  label: string,
  drift: number,
  detail: string,
  rows: Record<string, unknown>[]
): RekCheck {
  return { id, label, status: drift > 0 ? 'drift' : 'ok', drift_count: drift, detail, rows: rows.slice(0, TOP) };
}

export async function queryRekonsiliasi(d: QueryDb): Promise<RekPayload> {
  const checks: RekCheck[] = [];

  // ── 1. SALES_PAY: penjualan vs pembayaran ─────────────────────────
  // Untuk semua baris valid: pelanggan membayar amount_paid, toko
  // mengembalikkan change → neto harus persis total (metode tunggal,
  // split, maupun transfer). Pelanggaran = koreksi manual/DB edit.
  {
    const drift = await num(d, 'SELECT COUNT(*) c FROM sales WHERE amount_paid - change <> total');
    checks.push(
      chk(
        'SALES_PAY',
        'Penjualan vs pembayaran (amount_paid − change = total)',
        drift,
        drift
          ? drift + ' baris sales: amount_paid − change ≠ total'
          : 'semua baris sales selaras (paid − kembalian = total)',
        drift
          ? await topRows(
              d,
              `SELECT id, total, amount_paid, change, pay_method
               FROM sales WHERE amount_paid - change <> total ORDER BY id DESC LIMIT ${TOP}`
            )
          : []
      )
    );
  }

  // ── 2. SALES_MONEY: sanity nominal (mirror INV-7 P0-C2) ──────────
  {
    const drift = await num(d, 'SELECT COUNT(*) c FROM sales WHERE total < 0 OR amount_paid < 0 OR change < 0');
    checks.push(
      chk(
        'SALES_MONEY',
        'Nominal penjualan tidak negatif (INV-7)',
        drift,
        drift ? drift + ' baris sales berisi nominal negatif' : 'tidak ada nominal negatif',
        drift
          ? await topRows(
              d,
              `SELECT id, total, amount_paid, change
               FROM sales WHERE total < 0 OR amount_paid < 0 OR change < 0 ORDER BY id DESC LIMIT ${TOP}`
            )
          : []
      )
    );
  }

  // ── 3. SPLIT: pembayaran campur (fitur 3) ────────────────────────
  // pay_split = JSON [{m,a}]: valid + metode whitelist (cash/tf/wa) +
  // Σ bagian = total (split PENUH saja — tanpa piutang). Baris legacy
  // (pay_split kosong) memakai pay_method, tak dicek di sini.
  {
    const BAD = `json_valid(s.pay_split) = 0
           OR COALESCE((SELECT SUM(CAST(json_extract(j.value, '$.a') AS INTEGER)) FROM json_each(s.pay_split) j), 0) <> s.total
           OR EXISTS (SELECT 1 FROM json_each(s.pay_split) j WHERE CAST(json_extract(j.value, '$.m') AS TEXT) NOT IN ('cash','tf','wa'))`;
    const drift = await num(
      d,
      `SELECT COUNT(*) c FROM sales s
       WHERE s.pay_split IS NOT NULL AND s.pay_split <> '' AND (${BAD})`
    );
    checks.push(
      chk(
        'SPLIT',
        'Pembayaran campur (pay_split valid + Σ bagian = total)',
        drift,
        drift
          ? drift + ' baris split: JSON rusak, Σ bagian ≠ total, atau metode tak dikenal'
          : 'semua baris split valid (JSON, total, metode)',
        drift
          ? await topRows(
              d,
              `SELECT s.id, s.total, s.pay_split
               FROM sales s
               WHERE s.pay_split IS NOT NULL AND s.pay_split <> '' AND (${BAD})
               ORDER BY s.id DESC LIMIT ${TOP}`
            )
          : []
      )
    );
  }

  // ── 4. SHIFT: rekap shif vs recompute window POS ─────────────────
  // Saat tutup, route mengunci count/total/cash utk window
  // [start_time, end_time) kasir tsb. Jika DB diedit pasca-close,
  // rekap tersimpan ≠ recompute → drift. Batas 30 shif terakhir
  // (target Rows Read); by_method JSON tidak dibandingkan. Query cash
  // = mirror salesCashPortion (lib/pay-methods).
  {
    const closed = (await d
      .prepare(
        `SELECT s.id, s.kasir_id, s.start_time, s.end_time, s.sales_count, s.sales_total, s.cash_total
         FROM shifts s WHERE s.status = 'closed' AND s.end_time IS NOT NULL
         ORDER BY s.end_time DESC LIMIT 30`
      )
      .all()) as {
      id: number;
      kasir_id: number;
      start_time: string;
      end_time: string;
      sales_count: number;
      sales_total: number;
      cash_total: number;
    }[];
    let drift = 0;
    const rows: Record<string, unknown>[] = [];
    for (const s of closed) {
      const st = (await d
        .prepare(
          'SELECT COUNT(*) c, COALESCE(SUM(total), 0) t FROM sales WHERE kasir_id = ? AND created_at >= ? AND created_at < ?'
        )
        .get(s.kasir_id, s.start_time, s.end_time)) as { c: number; t: number };
      const cash = (await d
        .prepare(
          `SELECT COALESCE(SUM(a), 0) c FROM (
             SELECT total a FROM sales
               WHERE kasir_id = ? AND created_at >= ? AND created_at < ?
                 AND pay_method = 'cash' AND (pay_split IS NULL OR pay_split = '')
             UNION ALL
             SELECT CAST(json_extract(j.value, '$.a') AS INTEGER) a
               FROM sales s, json_each(s.pay_split) j
              WHERE s.kasir_id = ? AND s.created_at >= ? AND s.created_at < ?
                AND s.pay_split IS NOT NULL AND s.pay_split <> '' AND json_valid(s.pay_split)
                AND CAST(json_extract(j.value, '$.m') AS TEXT) = 'cash'
           )`
        )
        .get(s.kasir_id, s.start_time, s.end_time, s.kasir_id, s.start_time, s.end_time)) as { c: number };
      const cnt = Number(st.c) || 0;
      const tot = Number(st.t) || 0;
      const csh = Number(cash.c) || 0;
      if (cnt !== s.sales_count || tot !== s.sales_total || csh !== s.cash_total) {
        drift++;
        if (rows.length < TOP)
          rows.push({
            id: s.id,
            kasir_id: s.kasir_id,
            shift_count: s.sales_count,
            pos_count: cnt,
            shift_total: s.sales_total,
            pos_total: tot,
            shift_cash: s.cash_total,
            pos_cash: csh,
          });
      }
    }
    checks.push(
      chk(
        'SHIFT',
        'Rekap shif vs window POS (30 shif closed terakhir)',
        drift,
        drift
          ? drift + ' rekap shif berbeda dgn recompute window [start, end) (POS diedit pasca-close?)'
          : closed.length + ' rekap shif terakhir selaras dgn recompute',
        rows
      )
    );
  }

  // ── 5. RETURN: retur vs stok/terjual ──────────────────────────────
  // Orphan (INV-3: returns tanpa baris sales) + over-return per
  // (sale, produk): Σ qty retur > qty terjual — guard tulis
  // (returns/route.ts) menjamin hal ini; pelanggaran = edit manual.
  {
    const orphan = await num(
      d,
      `SELECT COUNT(*) c FROM returns r LEFT JOIN sales s ON s.id = r.sale_id WHERE s.id IS NULL`
    );
    const RET_QTY = `(SELECT COALESCE(SUM(r.qty), 0) FROM returns r WHERE r.sale_id = si.sale_id AND r.product_id = si.product_id)`;
    const over = await num(d, `SELECT COUNT(*) c FROM sale_items si WHERE ${RET_QTY} > si.qty`);
    const drift = orphan + over;
    checks.push(
      chk(
        'RETURN',
        'Retur vs stok (orphan + over-return)',
        drift,
        drift
          ? `${orphan} retur orphan + ${over} baris terjual over-return`
          : 'semua retur punya transaksi induk & ≤ qty terjual',
        over
          ? await topRows(
              d,
              `SELECT si.sale_id, si.product_id, si.qty, ${RET_QTY} AS qty_retur
               FROM sale_items si WHERE ${RET_QTY} > si.qty ORDER BY si.sale_id DESC LIMIT ${TOP}`
            )
          : orphan
            ? await topRows(
                d,
                `SELECT r.id, r.sale_id, r.product_id, r.qty, r.amount
                 FROM returns r LEFT JOIN sales s ON s.id = r.sale_id
                 WHERE s.id IS NULL ORDER BY r.id DESC LIMIT ${TOP}`
              )
            : []
      )
    );
  }

  // ── 6. STOCK: stok negatif (mirror INV-1 P0-C2) ──────────────────
  {
    const drift = await num(d, 'SELECT COUNT(*) c FROM products WHERE stock < 0');
    checks.push(
      chk(
        'STOCK',
        'Stok tidak negatif (INV-1)',
        drift,
        drift ? drift + ' produk stok negatif (oversell tak terkoreksi)' : 'tidak ada stok negatif',
        drift
          ? await topRows(d, `SELECT id, name, stock FROM products WHERE stock < 0 ORDER BY stock ASC LIMIT ${TOP}`)
          : []
      )
    );
  }

  // ── 7. DEBTS: aritmetika piutang (mirror INV-5 P0-C2) ────────────
  {
    const drift = await num(d, 'SELECT COUNT(*) c FROM debts WHERE remaining <> amount - paid');
    checks.push(
      chk(
        'DEBTS',
        'Piutang (remaining = amount − paid, INV-5)',
        drift,
        drift ? drift + ' piutang: remaining ≠ amount − paid' : 'semua piutang selaras aritmetiknya',
        drift
          ? await topRows(
              d,
              `SELECT id, customer_name, amount, paid, remaining
               FROM debts WHERE remaining <> amount - paid ORDER BY id DESC LIMIT ${TOP}`
            )
          : []
      )
    );
  }

  // ── 8. PAYABLES: aritmetika hutang (mirror INV-6 P0-C2) ──────────
  {
    const drift = await num(d, 'SELECT COUNT(*) c FROM payables WHERE remaining <> amount - paid');
    checks.push(
      chk(
        'PAYABLES',
        'Hutang supplier (remaining = amount − paid, INV-6)',
        drift,
        drift ? drift + ' hutang: remaining ≠ amount − paid' : 'semua hutang selaras aritmetiknya',
        drift
          ? await topRows(
              d,
              `SELECT id, supplier_name, amount, paid, remaining
               FROM payables WHERE remaining <> amount - paid ORDER BY id DESC LIMIT ${TOP}`
            )
          : []
      )
    );
  }

  // ── 9. POINTS: ledger poin member ────────────────────────────────
  // Penyempurnaan INV-4: reason 'refund' tak ditulis app manapun;
  // 'return' ditulis saat rollback retur penuh (returns/route.ts) dan
  // memotong members.points → wajib masuk SUM.
  {
    const RS = "'earn','redeem','void','return'";
    const drift = await num(
      d,
      `SELECT COUNT(*) c FROM members m
       WHERE m.points <> COALESCE((SELECT SUM(p.delta) FROM point_history p WHERE p.member_id = m.id AND p.reason IN (${RS})), 0)`
    );
    checks.push(
      chk(
        'POINTS',
        'Ledger poin member (points = Σ point_history)',
        drift,
        drift ? drift + ' member: poin ≠ Σ ledger (earn/redeem/void/return)' : 'poin semua member selaras dgn ledger',
        drift
          ? await topRows(
              d,
              `SELECT m.id, m.name, m.points,
                     COALESCE((SELECT SUM(p.delta) FROM point_history p WHERE p.member_id = m.id AND p.reason IN (${RS})), 0) AS ledger
               FROM members m
               WHERE m.points <> COALESCE((SELECT SUM(p.delta) FROM point_history p WHERE p.member_id = m.id AND p.reason IN (${RS})), 0)
               ORDER BY m.id LIMIT ${TOP}`
            )
          : []
      )
    );
  }

  // ── 10. CASHBACK: ledger saldo reward cashback member ────────────
  // cashback(+) saat jual, cashback_use(−) saat dipakai,
  // return_cash(−) saat rollback retur penuh.
  {
    const RS = "'cashback','cashback_use','return_cash'";
    const drift = await num(
      d,
      `SELECT COUNT(*) c FROM members m
       WHERE m.cashback_balance <> COALESCE((SELECT SUM(p.delta) FROM point_history p WHERE p.member_id = m.id AND p.reason IN (${RS})), 0)`
    );
    checks.push(
      chk(
        'CASHBACK',
        'Ledger cashback member (saldo = Σ point_history)',
        drift,
        drift
          ? drift + ' member: saldo cashback ≠ Σ ledger (cashback/cashback_use/return_cash)'
          : 'saldo cashback semua member selaras dgn ledger',
        drift
          ? await topRows(
              d,
              `SELECT m.id, m.name, m.cashback_balance,
                     COALESCE((SELECT SUM(p.delta) FROM point_history p WHERE p.member_id = m.id AND p.reason IN (${RS})), 0) AS ledger
               FROM members m
               WHERE m.cashback_balance <> COALESCE((SELECT SUM(p.delta) FROM point_history p WHERE p.member_id = m.id AND p.reason IN (${RS})), 0)
               ORDER BY m.id LIMIT ${TOP}`
            )
          : []
      )
    );
  }

  // ── 11. KONSIN: integritas konsinyasi (P4) ───────────────────────
  // (a) sisa = qty_received − qty_sold − qty_returned ≥ 0 — guard tulis
  //      'sell'/'return' (route /api/konsinyasi) menolak jumlah melebihi
  //      sisa; pelanggaran = edit manual/DB.
  // (b) overpay: amount_paid ≤ tagihan neto komisi (rumus agregat
  //      GET /api/konsinyasi) — guarded UPDATE 'pay' menolak;
  //      pelanggaran = edit manual/DB.
  // (c) baris 'settled' wajib lunas: 'close' menolak sisa tagihan
  //      (unpaid > 0 → throw), jadi settled ⇒ tagihan − amount_paid = 0.
  {
    const PAYABLE = `qty_sold * (agree_price - agree_price * commission_rate / 100)`;
    const kOver = await num(d, 'SELECT COUNT(*) c FROM consignments WHERE qty_received - qty_sold - qty_returned < 0');
    const kOverpay = await num(d, `SELECT COUNT(*) c FROM consignments WHERE amount_paid > ${PAYABLE}`);
    const kSettled = await num(
      d,
      `SELECT COUNT(*) c FROM consignments WHERE status = 'settled' AND ${PAYABLE} - amount_paid > 0`
    );
    const drift = kOver + kOverpay + kSettled;
    checks.push(
      chk(
        'KONSIN',
        'Integritas konsinyasi (sisa ≥ 0, tak overpay, settled lunas)',
        drift,
        drift
          ? `${kOver} sisa negatif + ${kOverpay} overpay + ${kSettled} settled belum lunas`
          : 'semua titipan selaras (sisa, pembayaran, penyelesaian)',
        drift
          ? await topRows(
              d,
              `SELECT id, owner, item_name,
                     qty_received - qty_sold - qty_returned AS remaining,
                     ${PAYABLE} AS payable, amount_paid, status
               FROM consignments
               WHERE qty_received - qty_sold - qty_returned < 0
                  OR amount_paid > ${PAYABLE}
                  OR (status = 'settled' AND ${PAYABLE} - amount_paid > 0)
               ORDER BY id DESC LIMIT ${TOP}`
            )
          : []
      )
    );
  }

  // ── 12. KONSIN_UJRAH: komisi vs pembukuan kas (cross-check) ──────
  // Ujrah dicatat OTOMATIS saat barang terjual (cash_entries income
  // 'Ujrah Kon. …'; lib/konsinyasi splitConsignment: komisi =
  // floor(harga×rate/100) per unit × qty_sold). Selisih Σ keduanya =
  // jurnal hilang / jurnal manual / perubahan data.
  {
    const exp = await num(
      d,
      'SELECT COALESCE(SUM(qty_sold * (agree_price * commission_rate / 100)), 0) c FROM consignments'
    );
    const act = await num(
      d,
      "SELECT COALESCE(SUM(amount), 0) c FROM cash_entries WHERE type = 'income' AND label LIKE 'Ujrah Kon. %'"
    );
    const drift = exp === act ? 0 : 1;
    checks.push(
      chk(
        'KONSIN_UJRAH',
        "Ujrah vs pembukuan (Σ komisi = Σ kas masuk 'Ujrah Kon. …')",
        drift,
        `ujrah diharapkan ${exp.toLocaleString('id-ID')} vs tercatat di kas ${act.toLocaleString('id-ID')}`,
        drift ? [{ expected: exp, recorded: act }] : []
      )
    );
  }

  // ── 13. KONSIN_PAY: pembayaran pemilik vs pembukuan kas ──────────
  // Setiap aksi 'pay' menambah amount_paid DAN menulis kas keluar
  // 'Kon. …' dalam 1 tx. Σ amount_paid semua baris harus = Σ jurnal.
  {
    const exp = await num(d, 'SELECT COALESCE(SUM(amount_paid), 0) c FROM consignments');
    const act = await num(
      d,
      "SELECT COALESCE(SUM(amount), 0) c FROM cash_entries WHERE type = 'expense' AND label LIKE 'Kon. %'"
    );
    const drift = exp === act ? 0 : 1;
    checks.push(
      chk(
        'KONSIN_PAY',
        "Settlement vs pembukuan (Σ paid = Σ kas keluar 'Kon. …')",
        drift,
        `terbayar tercatat ${exp.toLocaleString('id-ID')} vs kas keluar ${act.toLocaleString('id-ID')}`,
        drift ? [{ expected: exp, recorded: act }] : []
      )
    );
  }

  const drift_total = checks.reduce((t, c) => t + c.drift_count, 0);
  return {
    as_of: new Date().toISOString(),
    clean: drift_total === 0,
    drift_total,
    checks,
  };
}
