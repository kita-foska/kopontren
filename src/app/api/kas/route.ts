import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const d = await db();
  const sales = (
    await d
      .prepare(
        'SELECT id, total AS amount, customer, pay_method, created_at FROM sales ORDER BY created_at DESC LIMIT 200'
      )
      .all()
  ) as { id: number; amount: number; customer: string; pay_method: string; created_at: string }[];
  const purchases = (
    await d
      .prepare(
        'SELECT id, (qty * unit_cost) AS amount, product_name, supplier, created_at FROM purchases ORDER BY created_at DESC LIMIT 200'
      )
      .all()
  ) as { id: number; amount: number; product_name: string; supplier: string; created_at: string }[];
  const expenses = (
    await d
      .prepare('SELECT id, amount, name, created_at FROM expenses ORDER BY created_at DESC LIMIT 200')
      .all()
  ) as { id: number; amount: number; name: string; created_at: string }[];
  const entries = (
    await d
      .prepare(
        'SELECT id, type, label, amount, created_at FROM cash_entries ORDER BY created_at DESC LIMIT 200'
      )
      .all()
  ) as { id: number; type: string; label: string; amount: number; created_at: string }[];

  const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const inn =
    sum(sales) +
    entries.filter((e) => e.type === 'income').reduce((a, e) => a + e.amount, 0);
  const out =
    sum(purchases) + sum(expenses) +
    entries.filter((e) => e.type === 'expense').reduce((a, e) => a + e.amount, 0);

  type Row = { id: number; kind: string; sign: number; label: string; amount: number; created_at: string };
  const rows: Row[] = [
    ...sales.map<Row>((s) => ({
      id: s.id,
      kind: 'sale',
      sign: 1,
      label: 'Jualan' + (s.customer ? ' · ' + s.customer : '') + ' (' + s.pay_method + ')',
      amount: s.amount,
      created_at: s.created_at,
    })),
    ...purchases.map<Row>((s) => ({
      id: s.id,
      kind: 'purchase',
      sign: -1,
      label: 'Belanja ' + s.product_name + (s.supplier ? ' · ' + s.supplier : ''),
      amount: s.amount,
      created_at: s.created_at,
    })),
    ...expenses.map<Row>((s) => ({
      id: s.id,
      kind: 'expense',
      sign: -1,
      label: 'Pengeluaran · ' + s.name,
      amount: s.amount,
      created_at: s.created_at,
    })),
    ...entries.map<Row>((s) => ({
      id: s.id,
      kind: 'entry',
      sign: s.type === 'income' ? 1 : -1,
      label: s.label,
      amount: s.amount,
      created_at: s.created_at,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);

  return NextResponse.json({
    balance: inn - out,
    rows,
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      label: e.label,
      amount: e.amount,
      created_at: e.created_at,
    })),
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { type?: string; label?: string; amount?: number };
  const amount = Math.floor(Number(b.amount) || 0);
  const type = b.type === 'expense' ? 'expense' : 'income';
  if (!String(b.label || '').trim() || amount <= 0)
    return NextResponse.json({ error: 'Uraian & nominal wajib' }, { status: 400 });
  const d = await db();
  const info = await d
    .prepare('INSERT INTO cash_entries (type, label, amount, created_by) VALUES (?, ?, ?, ?)')
    .run(type, String(b.label).trim(), amount, user.id);
  await logAudit(user, 'kas:' + type, 'cash_entries', Number(info.lastInsertRowid), undefined, {
    label: String(b.label).trim(),
    amount,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('entry_id') || '0');
  if (!id) return NextResponse.json({ error: 'entry_id tidak valid' }, { status: 400 });
  const d = await db();
  const entry = (await d
    .prepare('SELECT type, label, amount FROM cash_entries WHERE id = ?')
    .get(id)) as { type: string; label: string; amount: number } | undefined;
  if (!entry) return NextResponse.json({ error: 'Jurnal tidak ditemukan' }, { status: 404 });
  await d.prepare('DELETE FROM cash_entries WHERE id = ?').run(id);
  await logAudit(user, 'kas:delete', 'cash_entries', id, entry, undefined);
  return NextResponse.json({ ok: true });
}
