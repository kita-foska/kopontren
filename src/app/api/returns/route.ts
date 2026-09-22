import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';
import { notifyNewRetur } from '@/lib/notify';

type ReturnRow = {
  id: number;
  sale_id: number;
  product_id: number;
  qty: number;
  reason: string;
  amount: number;
  created_at: string;
  sale_customer: string;
  sale_total: number;
  item_name: string;
};

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'pos'))
    return NextResponse.json({ error: 'Role Anda tidak dapat melihat retur' }, { status: 403 });
  const url = new URL(req.url);
  // Cap 50 baris/halaman (target Rows Read); sebelumnya cap 200.
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const d = await db();
  const returns = (
    (await d
      .prepare(
        `SELECT r.id, r.sale_id, r.product_id, r.qty, r.reason, r.amount, r.created_at,
                s.customer AS sale_customer, s.total AS sale_total,
                si.product_name AS item_name
         FROM returns r
         LEFT JOIN sales s ON s.id = r.sale_id
         LEFT JOIN sale_items si ON si.sale_id = r.sale_id AND si.product_id = r.product_id
         ORDER BY r.created_at DESC, r.id DESC LIMIT ?`
      )
      .all(limit)) as unknown
  ) as ReturnRow[];
  return NextResponse.json({ returns });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'pos'))
    return NextResponse.json({ error: 'Role Anda tidak dapat mencatat retur' }, {
      status: 403,
    });
  const b = (await req.json().catch(() => ({}))) as {
    sale_id?: number;
    product_id?: number;
    qty?: number;
    reason?: string;
    refund?: boolean;
  };
  const saleId = Number(b.sale_id) || 0;
  const productId = Number(b.product_id) || 0;
  const qty = Math.floor(Number(b.qty) || 0);
  const reason = String(b.reason || '').trim();
  const refund = Boolean(b.refund);
  if (!saleId || !productId || qty < 1)
    return NextResponse.json(
      { error: 'Transaksi, produk & jumlah (min 1) wajib' },
      { status: 400 }
    );
  const d = await db();
  const sale = (
    (await d
      .prepare('SELECT id, kasir_id, total FROM sales WHERE id = ?')
      .get(saleId)) as { id: number; kasir_id: number | null; total: number } | undefined
  );
  if (!sale) return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  if (user.role === 'kasir' && sale.kasir_id !== user.id)
    return NextResponse.json(
      { error: 'Kasir hanya dapat mencatat retur transaksi miliknya sendiri' },
      { status: 403 }
    );
  const item = (
    (await d
      .prepare(
        'SELECT product_name, unit_price, qty, subtotal, discount FROM sale_items WHERE sale_id = ? AND product_id = ? LIMIT 1'
      )
      .all(saleId, productId))[0] as
      | {
          product_name: string;
          unit_price: number;
          qty: number;
          subtotal: number;
          discount: number;
        }
      | undefined
  );
  if (!item)
    return NextResponse.json(
      { error: 'Produk tersebut tidak ada di transaksi yang dipilih' },
      { status: 400 }
    );
  // Plafon: jumlah retur tidak boleh melebihi (qty terjual - yang sudah
  // diretur) agar stok tidak bisa digelembungkan lewat retur berlebihan.
  // Cek di bawah hanya utk feedback cepat (UX); validasi FINAL diulang
  // di dalam transaksi di bawah ini agar race 2 request paralel (same
  // sale+product) tidak menembus plafon (TOCTOU).
  const already = (
    (await d
      .prepare('SELECT COALESCE(SUM(qty), 0) s FROM returns WHERE sale_id = ? AND product_id = ?')
      .get(saleId, productId)) as { s: number }
  ).s;
  const maxQty = Math.max(0, Number(item.qty || 0) - Number(already));
  if (qty > maxQty) {
    return NextResponse.json(
      { error: 'Jumlah retur melebihi sisa yang dapat diretur (' + maxQty + ' ' + item.product_name + ')' },
      { status: 400 }
    );
  }
  // Refund memakai HARGA EFEKTIF (net setelah diskon baris), bukan unit_price
  // mentah: nilai bersih baris = subtotal − discount, dialokasikan proporsional
  // qty_retur/qty_terjual. Tanpa diskon hasilnya identik rumus lama.
  // (Fix audit [m] 20 Sep 2026 — dulu `Math.floor(unit_price * qty)` sehingga
  // retur selalu refund harga katalog, mengabaikan diskon yang diterima customer.)
  const soldQty = Math.max(1, Number(item.qty || 0));
  const lineNet = Math.max(
    0,
    Number(item.subtotal || item.unit_price * soldQty) - Number(item.discount || 0)
  );
  const amount = Math.round((lineNet * qty) / soldQty);
  const now = new Date().toISOString();

  let newId = 0;
  try {
    await tx(d, async () => {
      // Re-validasi plafon DI DALAM tx (guard akhir setelah semua
      // statement atomik committed — race window tertutup).
      const alreadyTx = (
        (await d
          .prepare('SELECT COALESCE(SUM(qty), 0) s FROM returns WHERE sale_id = ? AND product_id = ?')
          .get(saleId, productId)) as { s: number }
      ).s;
      const maxTx = Math.max(0, Number(item.qty || 0) - Number(alreadyTx));
      if (qty > maxTx)
        throw new Error(
          'Jumlah retur melebihi sisa yang dapat diretur (' + maxTx + ' ' + item.product_name + ')'
        );
      // Guard anti double-return (double-submit / double-tap / network retry):
      // retur identik (sale+product+qty+amount sama) yang tercatat dalam
      // 90 detik terakhir hampir pasti peristiwa fisik yang sama -> tolak,
      // supaya tidak ada restock dobel & refund 2x. Retur parsial yang sah
      // (hari lain / qty berbeda) tidak terpengaruh — plafon di atas tetap
      // berlaku. Cek ini DI DALAM tx: di Turso write-transaction
      // diserialisasi, sehingga dua request paralel yang identik tidak
      // mungkin lolos keduanya (race window tertutup).
      const dupSince = new Date(Date.now() - 90_000).toISOString();
      const dup = (
        (await d
          .prepare(
            'SELECT COUNT(*) c FROM returns WHERE sale_id = ? AND product_id = ? AND qty = ? AND amount = ? AND created_at >= ?'
          )
          .get(saleId, productId, qty, amount, dupSince)) as { c: number }
      ).c;
      if (Number(dup) > 0)
        throw new Error('Retur dobel ditolak: retur identik baru saja tercatat (double-submit?)');
      const info = await d
        .prepare(
          'INSERT INTO returns (sale_id, product_id, qty, reason, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(saleId, productId, qty, reason, amount, now);
      // Guard (pattern DELETE /api/sales/[id]): pastikan baris retur
      // benar-benar tercatat (changes === 1) SEBELUM efek samping
      // (restock & refund) berjalan. changes === 0 -> throw -> seluruh
      // tx di-rollback; tidak ada restock/refund tanpa baris retur.
      if (Number(info.changes) !== 1)
        throw new Error('Gagal mencatat retur (guard anti double-return)');
      newId = Number(info.lastInsertRowid);
      // Restock: kembalikan produk ke stok. Guard changes === 1: baris
      // produk harus memang ada (baris hilang -> changes 0 -> abort:
      // refund tanpa restock tidak boleh terjadi).
      const restock = await d
        .prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
        .run(qty, productId);
      if (Number(restock.changes) !== 1)
        throw new Error('Produk tidak ditemukan — retur dibatalkan (guard restock)');
      // Refund tunai: catat sebagai jurnal kas keluar agar pembukuan tetap akur.
      if (refund) {
        await d
          .prepare("INSERT INTO cash_entries (type, label, amount, created_by) VALUES ('expense', ?, ?, ?)")
          .run('Retur #' + saleId + ' · ' + item.product_name, amount, user.id);
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gagal mencatat retur' },
      { status: 400 }
    );
  }

  await logAudit(user, 'retur:create', 'returns', newId, undefined, {
    sale_id: saleId,
    product_name: item.product_name,
    qty,
    amount,
    reason: reason || undefined,
    refund,
  });
  // Retur ubah stok produk (+refund) jurnal kas keluar & agregat laporan.
  invalidate('products:');
  invalidate('kas:');
  invalidate('reports:');
  try {
    await notifyNewRetur(saleId, item.product_name, qty, amount);
  } catch (e) {
    console.warn('[notify] pemicu retur gagal:', e);
  }
  return NextResponse.json({
    ok: true,
    id: newId,
    note: 'Stok dikembalikan' + (refund ? ' & uang dikembalikan (jurnal kas keluar)' : ''),
  });
}
