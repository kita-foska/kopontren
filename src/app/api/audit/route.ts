import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser, isAdmin } from '@/lib/auth';
import { cached, invalidate } from '@/lib/ref-cache';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'audit'))
    return NextResponse.json({ error: 'Hanya admin/pengurus' }, { status: 403 });
  const url = new URL(req.url);
  const table = String(url.searchParams.get('table') || '');
  // Cap 50 baris/halaman (target Rows Read) + ?offset= utk "Muat lebih banyak".
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const d = await db();
  let sql = `SELECT id, user_id, username, user_name, user_role, action, table_name, record_id,
                    old_value, new_value, ip_address, user_agent, created_at
             FROM audit_log WHERE 1=1`;
  const args: string[] = [];
  if (table) {
    sql += ` AND table_name = ?`;
    args.push(table);
  }
  sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
  const logs = await d.prepare(sql).all(...args, limit, offset);
  // Daftar nama tabel utk dropdown filter — DISTINCT memindai seluruh
  // audit_log; cache 60 dtk, dibuang saat purge (DELETE).
  const tables = await cached('audit:tables', async () =>
    ((await d
      .prepare(`SELECT DISTINCT table_name FROM audit_log ORDER BY table_name`)
      .all()) as { table_name: string }[]
  ).map((r) => r.table_name)
  );
  return NextResponse.json({ logs, tables, limit, offset });
}

/** Purge old audit logs (data hygiene). */
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  // Purge log = sensitif; tetap admin-only (pengurus hanya baca).
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') || '90');
  if (!Number.isFinite(days) || days < 1)
    return NextResponse.json({ error: 'days tidak valid' }, { status: 400 });
  const d = await db();
  const cutoff = new Date(Date.now() - Math.floor(days) * 86400000).toISOString();
  const res = await d.prepare(`DELETE FROM audit_log WHERE created_at < ?`).run(cutoff);
  invalidate('audit:');
  return NextResponse.json({ ok: true, deleted: res.changes });
}