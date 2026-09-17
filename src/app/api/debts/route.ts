import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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
  created_at: string;
};

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'all';
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const d = await db();
  const st = status === 'open' || status === 'settled' ? status : 'all';
  const where = st === 'all' ? '1=1' : 'status = ?';
  const args: (string | number)[] = st === 'all' ? [limit] : [st, limit];
  const debts = (
    (await d
      .prepare(
        `SELECT id, customer_name, customer_phone, amount, paid, remaining, due_date, status, note, created_at
         FROM debts WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(...args)) as unknown as DebtRow[]
  );
  const summary = (
    (await d
      .prepare(
        `SELECT COALESCE(SUM(remaining), 0) AS open_total, COUNT(*) AS open_count FROM debts WHERE status = 'open'`
      )
      .get()) as { open_total: number | null; open_count: number | null }
  );
  return NextResponse.json({
    debts,
    summary: {
      open_total: Number(summary.open_total) || 0,
      open_count: Number(summary.open_count) || 0,
    },
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.role === 'pengurus')
    return NextResponse.json({ error: 'Pengurus hanya melihat, tidak dapat mencatat piutang' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    customer_name?: string;
    customer_phone?: string;
    amount?: number;
    due_date?: string;
    note?: string;
  };
  const name = String(b.customer_name || '').trim();
  const amount = Math.floor(Number(b.amount) || 0);
  if (!name || amount <= 0)
    return NextResponse.json({ error: 'Nama pelanggan & nominal wajib' }, { status: 400 });
  const due_date = String(b.due_date || '').trim();
  const note = String(b.note || '').trim();
  const d = await db();
  const info = await d
    .prepare(
      `INSERT INTO debts (customer_name, customer_phone, amount, paid, remaining, due_date, status, note)
       VALUES (?, ?, ?, 0, ?, ?, 'open', ?)`
    )
    .run(name, String(b.customer_phone || '').trim(), amount, amount, due_date, note);
  const id = Number(info.lastInsertRowid);
  await logAudit(user, 'debt:create', 'debts', id, undefined, {
    customer_name: name,
    amount,
    due_date: due_date || undefined,
    note: note || undefined,
  });
  return NextResponse.json({ ok: true, id });
}
