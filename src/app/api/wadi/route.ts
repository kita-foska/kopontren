import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import {
  wadiSetor,
  wadiTarik,
  wadiRiwayat,
  wadiSaldo,
} from '@/lib/wadi';

/**
 * W9 (skema v32) -- API wadi'ah santri.
 * GET: daftar saldo wadi'ah per santri (admin).
 * POST: setor | tarik | riwayat (admin/manajer).
 */

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });

  const d = await db();
  const rows = (await d
    .prepare(
      'SELECT m.id, m.name, COALESCE(w.balance, 0) AS balance, w.updated_at FROM members m LEFT JOIN wadi_balances w ON w.member_id = m.id WHERE w.balance > 0 OR w.updated_at IS NOT NULL ORDER BY m.name',
    )
    .all()) as Array<{ id: number; name: string; balance: number; updated_at: string | null }>;
  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = b.action as string;
  const d = await db();

  if (action === 'setor') {
    const memberId = Number(b.member_id) || 0;
    const amount = Number(b.amount) || 0;
    const note = String(b.note ?? '');
    if (memberId <= 0) return NextResponse.json({ error: 'Member tidak valid' }, { status: 400 });
    if (amount <= 0) return NextResponse.json({ error: 'Jumlah tidak valid' }, { status: 400 });

    let balance: number = 0;
    await tx(d, async () => {
      balance = await wadiSetor(d, memberId, amount, user.id, note);
    });
    await logAudit(user, 'wadi:setor', 'wadi_ledger', null, undefined, { member_id: memberId, amount, note });
    return NextResponse.json({ ok: true, balance });
  }

  if (action === 'tarik') {
    const memberId = Number(b.member_id) || 0;
    const amount = Number(b.amount) || 0;
    const note = String(b.note ?? '');
    if (memberId <= 0) return NextResponse.json({ error: 'Member tidak valid' }, { status: 400 });
    if (amount <= 0) return NextResponse.json({ error: 'Jumlah tidak valid' }, { status: 400 });

    let balance: number = 0;
    try {
      await tx(d, async () => {
        balance = await wadiTarik(d, memberId, amount, user.id, note);
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    await logAudit(user, 'wadi:tarik', 'wadi_ledger', null, undefined, { member_id: memberId, amount, note });
    return NextResponse.json({ ok: true, balance });
  }

  if (action === 'riwayat') {
    const memberId = Number(b.member_id) || 0;
    if (memberId <= 0) return NextResponse.json({ error: 'Member tidak valid' }, { status: 400 });
    const limit = Math.min(50, Math.max(1, Number(b.limit) || 20));
    const offset = Math.max(0, Number(b.offset) || 0);
    const entries = await wadiRiwayat(d, memberId, limit, offset);
    const saldo = await wadiSaldo(d, memberId);
    return NextResponse.json({ entries, saldo });
  }

  return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}