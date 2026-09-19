import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser } from '@/lib/auth';
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
  if (user.role === 'pengurus')
    return NextResponse.json({ error: 'Pengurus hanya melihat, tidak dapat mencatat retur' }, {
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
      .prepare('SELECT product_name, unit_price FROM sale_items WHERE sale_id = ? AND product_id = ? LIMIT 1')
      .all(saleId, productId))[0] as { product_name: string; unit_price: number } | undefined
  );
  if (!item)
    return NextResponse.json(
      { error: 'Produk tersebut tidak ada di transaksi yang dipilih' },
      { status: 400 }
    );
  const amount = Math.floor(item.unit_price * qty);
  const now = new Date().toISOString();

  const newId = await tx(d, async () => {
    const info = await d
      .prepare(
        'INSERT INTO returns (sale_id, product_id, qty, reason, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(saleId, productId, qty, reason, amount, now);
    // Restock: kembalikan produk ke stok.
    await d.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, productId);
    // Refund tunai: catat sebagai jurnal kas keluar agar pembukuan tetap akur.
    if (refund) {
      await d
        .prepare("INSERT INTO cash_entries (type, label, amount, created_by) VALUES ('expense', ?, ?, ?)")
        .run('Retur #' + saleId + ' · ' + item.product_name, amount, user.id);
    }
    return Number(info.lastInsertRowid);
  });

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
