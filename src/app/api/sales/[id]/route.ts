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
    .prepare('SELECT id, total, member_id, member_points FROM sales WHERE id = ?')
    .get(Number(id))) as {
    id: number;
    total: number;
    member_id: number | null;
    member_points: number;
  } | undefined;
  if (!sale) return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });

  // Kembalikan stok & balikan poin/totalspend member sebelum menghapus.
  await tx(d, async () => {
    const items = (
      await d.prepare('SELECT product_id, qty FROM sale_items WHERE sale_id = ?').all(sale.id)
    ) as { product_id: number | null; qty: number }[];
    const inc = d.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    for (const it of items) {
      if (it.product_id) await inc.run(it.qty, it.product_id);
    }
    await d.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(sale.id);
    await d.prepare('DELETE FROM sales WHERE id = ?').run(sale.id);
    if (sale.member_id) {
      await d
        .prepare(
          `UPDATE members SET points = MAX(points - ?, 0), total_spent = MAX(total_spent - ?, 0) WHERE id = ?`
        )
        .run(sale.member_points, sale.total, sale.member_id);
      // Ledger: batal transaksi membatalkan poin yang sudah diberikan.
      if (sale.member_points > 0) {
        await d
          .prepare(
            `INSERT INTO point_history (member_id, delta, reason, amount, sale_id)
             VALUES (?, ?, 'void', ?, ?)`
          )
          .run(sale.member_id, -sale.member_points, sale.total, sale.id);
      }
    }
  });
  await logAudit(user, 'sales:delete', 'sales', sale.id, { total: sale.total }, undefined, _req);
  // Hapus transaksi membatalkan efeknya: stok, poin member, kas, laporan.
  invalidate('members:');
  invalidate('products:');
  invalidate('kas:');
  invalidate('reports:');
  return NextResponse.json({
    ok: true,
    note: 'Stok dikembalikan' + (sale.member_id ? ' & poin member dibatalkan' : ''),
  });
}
