import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isManager } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const url = new URL(req.url);
  const table = String(url.searchParams.get('table') || '');
  const limit = Math.min(500, Math.max(20, Number(url.searchParams.get('limit') || '200')));
  const d = await db();
  let sql = `SELECT id, user_id, username, action, table_name, record_id, old_value, new_value, created_at
             FROM audit_log WHERE 1=1`;
  const args: string[] = [];
  if (table) {
    sql += ` AND table_name = ?`;
    args.push(table);
  }
  sql += ` ORDER BY id DESC LIMIT ` + limit;
  const logs = await d.prepare(sql).all(...args);
  const tables = (
    (await d.prepare(`SELECT DISTINCT table_name FROM audit_log ORDER BY table_name`).all()) as {
      table_name: string;
    }[]
  ).map((r) => r.table_name);
  return NextResponse.json({ logs, tables });
}

/** Purge old audit logs (data hygiene). */
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') || '90');
  if (!Number.isFinite(days) || days < 1)
    return NextResponse.json({ error: 'days tidak valid' }, { status: 400 });
  const d = await db();
  const cutoff = new Date(Date.now() - Math.floor(days) * 86400000).toISOString();
  const res = await d.prepare(`DELETE FROM audit_log WHERE created_at < ?`).run(cutoff);
  return NextResponse.json({ ok: true, deleted: res.changes });
}