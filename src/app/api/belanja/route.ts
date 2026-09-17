import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const d = await db();
  const purchases = await d
    .prepare('SELECT * FROM purchases ORDER BY created_at DESC LIMIT 200')
    .all();
  const expenses = await d
    .prepare('SELECT * FROM expenses ORDER BY created_at DESC LIMIT 200')
    .all();
  const products = await d
    .prepare('SELECT id, name FROM products WHERE active = 1 ORDER BY name')
    .all();
  return NextResponse.json({ purchases, expenses, products });
}
