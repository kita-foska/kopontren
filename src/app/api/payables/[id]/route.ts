import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { canAccess, currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';

type PayableRow = {
  id: number;
  supplier_name: string;
  supplier_phone: string;
  amount: number;
  paid: number;
  remaining: number;
  due_date: string;
  status: string;
  note: string;
  created_by: number | null;
  created_at: string;
};

const COLS =
  'id, supplier_name, supplier_phone, amount, paid, remaining, due_date, status, note, created_by, created_at';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'supplier'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pembelian' }, { status: 403 });
  const { id } = await params;
  const d = await db();
  const row = (
    (await d.prepare(`SELECT ${COLS} FROM payables WHERE id = ?`).get(Number(id))) as unknown
  ) as PayableRow | undefined;
  if (!row) return NextResponse.json({ error: 'Hutang tidak ditemukan' }, { status: 404 });
  return NextResponse.json({ payable: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'supplier'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pembelian' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as {
    pay?: number;
    note?: string;
    due_date?: string;
    status?: string;
  };
  const d = await db();
  const row = (
    (await d.prepare(`SELECT ${COLS} FROM payables WHERE id = ?`).get(Number(id))) as unknown
  ) as PayableRow | undefined;
  if (!row) return NextResponse.json({ error: 'Hutang tidak ditemukan' }, { status: 404 });

  // 1) Membayar utang (cicilan; maks. sisa): update payables + tulis
  //    cash_entries 'expense' (integrasi kas) dalam 1 transaksi atomik.
  const pay = Math.floor(Number(b.pay) || 0);
  if (pay > 0) {
    if (row.remaining <= 0)
      return NextResponse.json({ error: 'Hutang sudah lunas' }, { status: 400 });
    const add = Math.min(pay, row.remaining);
    const paid = row.paid + add;
    const remaining = Math.max(0, row.remaining - add);
    const status = remaining === 0 ? 'settled' : row.status;
    try {
      await tx(d, async () => {
        // Guarded update: cegah overpay (double-submit / race 2 request
        // paralel melewati sisa).
        const up = await d
          .prepare(
            `UPDATE payables SET paid = paid + ?, remaining = remaining - ?,
                    status = CASE WHEN remaining - ? = 0 THEN 'settled' ELSE status END
             WHERE id = ? AND remaining >= ?`
          )
          .run(add, add, add, row.id, add);
        if (Number(up.changes) !== 1)
          throw new Error('Hutang sudah lunas / data berubah — muat ulang');
        await d
          .prepare(
            `INSERT INTO cash_entries (type, label, amount, note, created_by)
             VALUES ('expense', ?, ?, ?, ?)`
          )
          .run('Bayar hutang · ' + row.supplier_name, add, 'payables#' + row.id, user.id);
      });
    } catch (e) {
      if (e instanceof Error && /muat ulang/.test(e.message))
        return NextResponse.json({ error: e.message }, { status: 400 });
      return NextResponse.json(
        { error: 'Gagal mencatat pembayaran: ' + (e instanceof Error ? e.message : '') },
        { status: 500 }
      );
    }
    // Segarkan agregat kas & laporan (ref-cache in-memory, TTL 60s backstop).
    invalidate('kas:');
    invalidate('reports:');
    await logAudit(
      user,
      'payable:pay',
      'payables',
      row.id,
      { paid: row.paid, remaining: row.remaining, status: row.status },
      { paid, remaining, status, cash_out: add, cash_note: 'payables#' + row.id }
    );
    return NextResponse.json({ ok: true, paid, remaining, status });
  }

  // 2) Perbarui catatan / jatuh tempo / status manual (tidak menyentuh kas).
  const changes: string[] = [];
  const old: Record<string, unknown> = {};
  if (b.note !== undefined) {
    old.note = row.note;
    row.note = String(b.note).trim();
    changes.push('note');
  }
  if (b.due_date !== undefined) {
    old.due_date = row.due_date;
    row.due_date = String(b.due_date).trim();
    changes.push('due_date');
  }
  if (b.status !== undefined) {
    if (b.status !== 'open' && b.status !== 'settled')
      return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
    old.status = row.status;
    row.status = b.status;
    changes.push('status');
  }
  if (changes.length) {
    await d
      .prepare(`UPDATE payables SET note = ?, due_date = ?, status = ? WHERE id = ?`)
      .run(row.note, row.due_date, row.status, row.id);
    await logAudit(user, 'payable:update', 'payables', row.id, old, {
      ...old,
      ...Object.fromEntries(changes.map((k) => [k, (row as unknown as Record<string, unknown>)[k]])),
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const { id } = await params;
  const d = await db();
  const row = (
    (await d.prepare(`SELECT ${COLS} FROM payables WHERE id = ?`).get(Number(id))) as unknown
  ) as PayableRow | undefined;
  if (!row) return NextResponse.json({ error: 'Hutang tidak ditemukan' }, { status: 404 });
  await d.prepare('DELETE FROM payables WHERE id = ?').run(row.id);
  await logAudit(
    user,
    'payable:delete',
    'payables',
    row.id,
    {
      supplier_name: row.supplier_name,
      amount: row.amount,
      paid: row.paid,
      remaining: row.remaining,
      status: row.status,
    },
    undefined
  );
  return NextResponse.json({ ok: true });
}
