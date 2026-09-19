import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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

/**
 * Hutang (utang dagang) — daftar & pencatatan.
 * Role: admin + pengurus (halaman /admin/hutang sudah di-guard layout).
 * GET: daftar (filter status, cap 50 baris utk Rows Read) + ringkasan
 * terbuka / tunggak / jatuh tempo dalam 7 hari ke depan.
 * POST: catat utang baru (remaining = amount, status 'open').
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya admin/pengurus' }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'all';
  // Cap 50 baris/halaman (target Rows Read Turso), senapas /api/debts.
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const d = await db();
  const st = status === 'open' || status === 'settled' ? status : 'all';
  const where = st === 'all' ? '1=1' : 'status = ?';
  const args: (string | number)[] = st === 'all' ? [limit] : [st, limit];
  const payables = (
    (await d
      .prepare(
        `SELECT id, supplier_name, supplier_phone, amount, paid, remaining, due_date, status, note, created_by, created_at
         FROM payables WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(...args)) as unknown as PayableRow[]
  );
  // Agregat 1 query (index tak membantu untuk COUNT bersyarat — tabel kecil,
  // scan sekali jauh lebih murah daripada 4 query terpisah).
  // Catatan: date('now') UTC — bisa meleset ±7 jam vs WIB utk tanggal tengah
  // malam; badge per-baris di UI dihitung client-side (WIB) jadi tetap akurat.
  const summary = (
    (await d
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN status = 'open' THEN remaining ELSE 0 END), 0) AS open_total,
                COALESCE(SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0) AS open_count,
                COALESCE(SUM(CASE WHEN status = 'open' AND due_date != '' AND date(due_date) < date('now') THEN 1 ELSE 0 END), 0) AS overdue_count,
                COALESCE(SUM(CASE WHEN status = 'open' AND due_date != '' AND date(due_date) >= date('now') AND date(due_date) <= date('now', '+6 days') THEN 1 ELSE 0 END), 0) AS due_soon_count
         FROM payables`
      )
      .get()) as unknown
  ) as {
    open_total: number;
    open_count: number;
    overdue_count: number;
    due_soon_count: number;
  };
  return NextResponse.json({
    payables,
    summary: {
      open_total: Number(summary.open_total) || 0,
      open_count: Number(summary.open_count) || 0,
      overdue_count: Number(summary.overdue_count) || 0,
      due_soon_count: Number(summary.due_soon_count) || 0,
    },
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya admin/pengurus' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    supplier_name?: string;
    supplier_phone?: string;
    amount?: number;
    due_date?: string;
    note?: string;
  };
  const name = String(b.supplier_name || '').trim();
  const amount = Math.floor(Number(b.amount) || 0);
  if (!name || amount <= 0)
    return NextResponse.json({ error: 'Nama supplier & nominal wajib' }, { status: 400 });
  const due_date = String(b.due_date || '').trim();
  const note = String(b.note || '').trim();
  const d = await db();
  const info = await d
    .prepare(
      `INSERT INTO payables (supplier_name, supplier_phone, amount, paid, remaining, due_date, status, note, created_by)
       VALUES (?, ?, ?, 0, ?, ?, 'open', ?, ?)`
    )
    .run(name, String(b.supplier_phone || '').trim(), amount, amount, due_date, note, user.id);
  const id = Number(info.lastInsertRowid);
  await logAudit(user, 'payable:create', 'payables', id, undefined, {
    supplier_name: name,
    amount,
    due_date: due_date || undefined,
    note: note || undefined,
  });
  return NextResponse.json({ ok: true, id });
}
