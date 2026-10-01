import { NextResponse } from 'next/server';
import { db, getSettings, tx } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';
import { journalForExpense, postJournalInTx } from '@/lib/jurnal';
import { notifyCashBalance } from '@/lib/notify';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
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
  // W1.3 auto-posting GL (gated: settings gl_enabled, default off ->
  // no-op). Insert + jurnal sekarang dalam SATU tx: atomik.
  const glOn = (await getSettings()).gl_enabled === '1';
  const name = String(b.name).trim();
  const created_at = new Date().toISOString();
  const info = await tx(d, async () => {
    const r = await d
      .prepare('INSERT INTO expenses (name, category, amount, note) VALUES (?, ?, ?, ?)')
      .run(name, String(b.category || '').trim(), amount, String(b.note || ''));
    if (glOn) {
      // Entry 'JE-expense-<id>': Debit 5030 Beban Operasional / Kredit
      // 1010 Kas (default mapper W1.2; tabel expenses belum punya kolom
      // akun eksplisit). Idempoten (UNIQUE expenses,ref_id,'auto').
      await postJournalInTx(
        d,
        journalForExpense({
          id: Number(r.lastInsertRowid),
          amount,
          name,
          created_at,
        })
      );
    }
    return r;
  });
  await logAudit(user, 'expense:create', 'expenses', Number(info.lastInsertRowid), undefined, {
    name,
    category: String(b.category || '').trim() || undefined,
    amount,
  });
  // Pengeluaran ubah total belanja, saldo kas & laporan.
  invalidate('belanja:');
  invalidate('kas:');
  invalidate('reports:');
  // Cek kas menipis (best-effort, HANYA admin).
  try {
    await notifyCashBalance();
  } catch (e) {
    console.warn('[notify] pemicu pengeluaran gagal:', e);
  }
  return NextResponse.json({ ok: true });
}
