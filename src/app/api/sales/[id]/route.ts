import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { status?: string };
  if (b.status !== 'reported' && b.status !== 'unreported') {
    return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
  }
  const d = await db();
  const sale = (await d
    .prepare('SELECT id, kasir_id, status FROM sales WHERE id = ?')
    .get(Number(id))) as { id: number; kasir_id: number | null; status: string } | undefined;
  if (!sale) return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  // Kasir only manages their own transactions; pengurus/admin may manage any.
  if (!isManager(user) && sale.kasir_id !== user.id) {
    return NextResponse.json(
      { error: 'Kasir hanya dapat mengubah transaksi miliknya sendiri' },
      { status: 403 }
    );
  }
  if (b.status === 'reported') {
    await d
      .prepare(
        "UPDATE sales SET status = 'reported', reported_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      )
      .run(sale.id);
  } else {
    await d
      .prepare("UPDATE sales SET status = 'unreported', reported_at = NULL WHERE id = ?")
      .run(sale.id);
  }
  await logAudit(user, 'sales:status', 'sales', sale.id, { status: sale.status }, { status: b.status }, req);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const { id } = await params;
  const d = await db();
  const sale = (await d
    .prepare('SELECT id, total, member_id, member_points, cashback, redeem FROM sales WHERE id = ?')
    .get(Number(id))) as {
    id: number;
    total: number;
    member_id: number | null;
    member_points: number;
    cashback: number;
    redeem: number;
  } | undefined;
  if (!sale) return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });

  // Kembalikan stok & balikan poin/total_spent member sebelum menghapus.
  // Portion yang SUDAH di-retur TIDAK di-restock ulang (hindari stok
  // menggembung): restock dinet-kan qty sudah diretur; jurnal refund
  // ("Retur #id" di cash_entries) & riwayat returns ikut dihapus.
  let returnedQty = 0;
  await tx(d, async () => {
    const items = (
      await d.prepare('SELECT product_id, qty FROM sale_items WHERE sale_id = ?').all(sale.id)
    ) as { product_id: number | null; qty: number }[];
    const inc = d.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    const retSum = d.prepare(
      'SELECT COALESCE(SUM(qty), 0) s FROM returns WHERE sale_id = ? AND product_id = ?'
    );
    for (const it of items) {
      if (!it.product_id) continue;
      const retRow = (await retSum.get(sale.id, it.product_id)) as { s: number };
      const alreadyRet = Number(retRow.s);
      returnedQty += alreadyRet;
      const restock = Math.max(0, it.qty - alreadyRet);
      if (restock > 0) await inc.run(restock, it.product_id);
    }
    // Hapus jurnal refund untuk sale ini (kas dihitung dari total sales;
    // efek refund ikut lenyap saat transaksinya dihapus).
    await d
      .prepare("DELETE FROM cash_entries WHERE type = 'expense' AND label LIKE ?")
      .run('Retur #' + sale.id + ' \u00B7%');
    // Riwayat retur yang merujuk sale ini.
    await d.prepare('DELETE FROM returns WHERE sale_id = ?').run(sale.id);
    await d.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(sale.id);
    await d.prepare('DELETE FROM sales WHERE id = ?').run(sale.id);
    if (sale.member_id) {
      await d
        .prepare(
          `UPDATE members SET points = MAX(points - ?, 0), total_spent = MAX(total_spent - ?, 0),
           cashback_balance = MAX(cashback_balance + ?, 0) WHERE id = ?`
        )
        .run(sale.member_points, sale.total, sale.cashback, sale.member_id);
      // Ledger: batal transaksi membatalkan poin yang sudah diberikan.
      if (sale.member_points > 0) {
        await d
          .prepare(
            `INSERT INTO point_history (member_id, delta, reason, amount, sale_id)
             VALUES (?, ?, 'void', ?, ?)`
          )
          .run(sale.member_id, -sale.member_points, sale.total, sale.id);
      }
      // Rollback redemsi transaksi ini: kembalikan bagian poin & cashback
      // yang dipakai, terbaca presisi dari ledger (bukan setting saat ini),
      // lalu jejak 'refund' untuk keterlacakan.
      if (sale.redeem > 0) {
        const rec = (await d
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN reason = 'redeem' THEN ABS(delta) ELSE 0 END), 0) p,
                    COALESCE(SUM(CASE WHEN reason = 'cashback_use' THEN ABS(delta) ELSE 0 END), 0) c
             FROM point_history WHERE member_id = ? AND sale_id = ?
               AND reason IN ('redeem', 'cashback_use')`
          )
          .get(sale.member_id, sale.id)) as { p: number; c: number };
        if (rec.p > 0 || rec.c > 0) {
          await d
            .prepare(
              'UPDATE members SET points = points + ?, cashback_balance = cashback_balance + ? WHERE id = ?'
            )
            .run(rec.p, rec.c, sale.member_id);
          if (rec.p > 0) {
            await d
              .prepare(
                `INSERT INTO point_history (member_id, delta, reason, amount, sale_id)
                 VALUES (?, ?, 'refund', ?, ?)`
              )
              .run(sale.member_id, rec.p, rec.p, sale.id);
          }
          if (rec.c > 0) {
            await d
              .prepare(
                `INSERT INTO point_history (member_id, delta, reason, amount, sale_id)
                 VALUES (?, ?, 'refund_cash', ?, ?)`
              )
              .run(sale.member_id, rec.c, rec.c, sale.id);
          }
        }
      }
    }
  });
  await logAudit(user, 'sales:delete', 'sales', sale.id, { total: sale.total, returned_qty: returnedQty }, undefined, _req);
  // Hapus transaksi membatalkan efeknya: stok, poin member, kas, laporan.
  invalidate('members:');
  invalidate('products:');
  invalidate('kas:');
  invalidate('reports:');
  return NextResponse.json({
    ok: true,
    note:
      'Stok dikembalikan' +
      (returnedQty > 0 ? ' (net after ' + returnedQty + ' qty sudah diretur)' : '') +
      (sale.member_id ? ' & poin member dibatalkan' : ''),
  });
}
