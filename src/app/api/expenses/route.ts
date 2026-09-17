import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    name?: string;
    category?: string;
    amount?: number;
    note?: string;
  };
  const amount = Math.floor(Number(b.amount) || 0);
  if (!String(b.name || '').trim() || amount <= 0)
    return NextResponse.json({ error: 'Uraian & nominal wajib' }, { status: 400 });
  const d = await db();
  const info = await d
    .prepare('INSERT INTO expenses (name, category, amount, note) VALUES (?, ?, ?, ?)')
    .run(String(b.name).trim(), String(b.category || '').trim(), amount, String(b.note || ''));
  await logAudit(user, 'expense:create', 'expenses', Number(info.lastInsertRowid), undefined, {
    name: String(b.name).trim(),
    category: String(b.category || '').trim() || undefined,
    amount,
  });
  return NextResponse.json({ ok: true });
}
