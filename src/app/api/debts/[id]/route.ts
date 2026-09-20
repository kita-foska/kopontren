import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { canAccess, currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';

type DebtRow = {
  id: number;
  customer_name: string;
  customer_phone: string;
  amount: number;
  paid: number;
  remaining: number;
  due_date: string;
  status: string;
  note: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'piutang'))
    return NextResponse.json({ error: 'Role Anda tidak dapat mengubah piutang' }, {
      status: 403,
    });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as {
    pay?: number;
    note?: string;
    due_date?: string;
    status?: string;
  };
  const d = await db();
  const row = (
    (await d
      .prepare('SELECT id, customer_name, customer_phone, amount, paid, remaining, due_date, status, note FROM debts WHERE id = ?')
      .get(Number(id))) as unknown
  ) as DebtRow | undefined;
  if (!row) return NextResponse.json({ error: 'Piutang tidak ditemukan' }, { status: 404 });

  // 1) Menerima pembayaran: `pay` rupiah (maks. sisa). Sisa = 0 -> lunas.
  const pay = Math.floor(Number(b.pay) || 0);
  if (pay > 0) {
    const add = Math.min(pay, row.remaining);
    const paid = row.paid + add;
    const remaining = Math.max(0, row.remaining - add);
    const status = remaining === 0 ? 'settled' : row.status;
    try {
      await tx(d, async () => {
        // Guarded update: atomik di level SQL — cegah overpay (double-submit
        // / 2 request paralel melewati sisa).
        const up = await d
          .prepare(
            `UPDATE debts SET paid = paid + ?, remaining = remaining - ?,
                    status = CASE WHEN remaining - ? = 0 THEN 'settled' ELSE status END
             WHERE id = ? AND remaining >= ?`
          )
          .run(add, add, add, row.id, add);
        if (Number(up.changes) !== 1)
          throw new Error('Piutang sudah lunas / data berubah — muat ulang');
        // Uang masuk kas (pembayaran piutang customer) -> jurnal kas masuk,
        // sejajar dengan "Bayar hutang" di payables (kas keluar).
        await d
          .prepare(
            "INSERT INTO cash_entries (type, label, amount, note, created_by) VALUES ('income', ?, ?, ?, ?)"
          )
          .run('Bayar piutang · ' + row.customer_name, add, 'debts#' + row.id, user.id);
      });
    } catch (e) {
      if (e instanceof Error && /muat ulang/.test(e.message))
        return NextResponse.json({ error: e.message }, { status: 400 });
      return NextResponse.json(
        { error: 'Gagal mencatat pembayaran: ' + (e instanceof Error ? e.message : '') },
        { status: 500 }
      );
    }
    // Jurnal kas berubah -> segarkan agregat kas & laporan.
    invalidate('kas:');
    invalidate('reports:');
    await logAudit(
      user,
      'debt:pay',
      'debts',
      row.id,
      { paid: row.paid, remaining: row.remaining, status: row.status },
      { paid, remaining, status, cash_in: add }
    );
    return NextResponse.json({ ok: true, paid, remaining, status });
  }

  // 2) Perbarui catatan / jatuh tempo / status manual.
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
      .prepare(
        `UPDATE debts SET note = ?, due_date = ?, status = ? WHERE id = ?`
      )
      .run(row.note, row.due_date, row.status, row.id);
    await logAudit(user, 'debt:update', 'debts', row.id, old, {
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
    (await d
      .prepare('SELECT id, customer_name, customer_phone, amount, paid, remaining, due_date, status, note FROM debts WHERE id = ?')
      .get(Number(id))) as unknown
  ) as DebtRow | undefined;
  if (!row) return NextResponse.json({ error: 'Piutang tidak ditemukan' }, { status: 404 });
  await d.prepare('DELETE FROM debts WHERE id = ?').run(row.id);
  await logAudit(
    user,
    'debt:delete',
    'debts',
    row.id,
    {
      customer_name: row.customer_name,
      amount: row.amount,
      paid: row.paid,
      remaining: row.remaining,
      status: row.status,
    },
    undefined
  );
  return NextResponse.json({ ok: true });
}
