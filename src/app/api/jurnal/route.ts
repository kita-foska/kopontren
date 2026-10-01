/**
 * F3.4+ W1.4 - API Jurnal (tulis): POST /api/jurnal
 *
 * Tier: admin-only (guard halaman /admin/jurnal sama: role === 'admin';
 * pengurus read-only, konsisten matriks features.ts).
 *
 * Dua aksi (body JSON):
 *  1. { action: 'manual', date?: 'YYYY-MM-DD', desc, lines: [{account_code,
 *     debit, credit}] } - jurnal manual. Validasi: akun ada di COA,
 *     debit XOR credit per baris, rupiah integer, total debit = total kredit
 *     (JOURNAL_BAL). Ditulis DI DALAM tx() pemanggil lewat
 *     postJournalInTx (W1.3) - atomik, idempoten, balance_running terawat.
 *  2. { action: 'reverse', entry_id, reason } - jurnal pembalik
 *     (koreksi Sek.3.2.2): kaki terbalik + link reversed_by; idempoten.
 *
 * Setelah tulis sukses: invalidate('gl:') (cache read GET /api/gl per
 * periode) + logAudit (audit trail manual & pembalikan).
 */
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db, tx } from '@/db';
import { currentUser } from '@/lib/auth';
import { invalidate } from '@/lib/ref-cache';
import { logAudit } from '@/lib/audit';
import { isBalanced, postJournalInTx, reverseJournalInTx, round } from '@/lib/jurnal';
import { wibToday } from '@/lib/zakat-period';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.role !== 'admin')
    return NextResponse.json({ error: 'Hanya admin yang boleh menulis jurnal' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body JSON tidak valid' }, { status: 400 });
  }
  const action = String(body.action ?? '').trim();
  const d = await db();

  if (action === 'manual') {
    // Validasi baris: akun COA + debit XOR credit + integer rupiah
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0)
      return NextResponse.json({ error: 'Minimal 1 baris jurnal' }, { status: 400 });
    const knownCodes = new Set(
      ((await d.prepare('SELECT code FROM coa').all()) as { code: string }[]).map((r) => r.code)
    );
    const lines = rawLines.map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      return {
        account_code: String(o.account_code ?? '').trim(),
        debit: round(o.debit),
        credit: round(o.credit),
      };
    });
    for (const l of lines) {
      if (!knownCodes.has(l.account_code))
        return NextResponse.json(
          { error: 'Akun tidak dikenal: ' + (l.account_code || '(kosong)') },
          { status: 400 }
        );
      if (l.debit < 0 || l.credit < 0)
        return NextResponse.json(
          { error: 'Jumlah harus non-negatif' },
          { status: 400 }
        );
      if (l.debit > 0 && l.credit > 0)
        return NextResponse.json(
          { error: 'Satu baris hanya boleh DEBIT atau KREDIT, bukan keduanya' },
          { status: 400 }
        );
      if (l.debit === 0 && l.credit === 0)
        return NextResponse.json({ error: 'Baris dengan jumlah nol diabaikan' }, { status: 400 });
    }
    if (!isBalanced(lines))
      return NextResponse.json(
        { error: 'Jurnal tidak seimbang: total debit harus sama dengan total kredit' },
        { status: 400 }
      );
    const dateRaw = String(body.date ?? '').trim();
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : wibToday();
    const desc = String(body.desc ?? '').trim().slice(0, 200);
    if (!desc)
      return NextResponse.json({ error: 'Keterangan wajib diisi' }, { status: 400 });

    const id = crypto.randomUUID();
    await tx(d, async () => {
      await postJournalInTx(d, {
        id,
        ref_table: 'manual',
        ref_id: null,
        entry_date: dateOk,
        type: 'manual',
        desc,
        created_by: user.username,
        lines: lines.map((l) => ({
          account_code: l.account_code,
          debit: l.debit,
          credit: l.credit,
          source: 'manual',
        })),
      });
    });
    invalidate('gl:');
    await logAudit({
      userId: user.id,
      userName: user.display_name || user.username,
      userRole: user.role,
      action: 'jurnal_manual',
      entity: 'journal_entries',
      entityId: null,
      fieldChanges: {
        journal: { before: null, after: { id, date: dateOk, desc, lines } },
      },
      req,
    });
    return NextResponse.json({ ok: true, entry_id: id });
  }

  if (action === 'reverse') {
    const entryId = String(body.entry_id ?? '').trim();
    const reason = String(body.reason ?? '').trim().slice(0, 200);
    if (!entryId)
      return NextResponse.json({ error: 'entry_id wajib diisi' }, { status: 400 });
    if (!reason)
      return NextResponse.json(
        { error: 'Alasan pembalikan wajib diisi' },
        { status: 400 }
      );
    const revId = await tx(d, async () => reverseJournalInTx(d, entryId, reason, user.username));
    if (!revId)
      return NextResponse.json(
        { error: 'Jurnal tidak ditemukan, tidak memiliki baris, atau sudah dibalik' },
        { status: 404 }
      );
    invalidate('gl:');
    await logAudit({
      userId: user.id,
      userName: user.display_name || user.username,
      userRole: user.role,
      action: 'jurnal_reverse',
      entity: 'journal_entries',
      entityId: null,
      fieldChanges: {
        reversal: { before: null, after: { entry_id: entryId, rev_id: revId, reason } },
      },
      req,
    });
    return NextResponse.json({ ok: true, entry_id: revId });
  }

  return NextResponse.json(
    { error: 'Aksi tidak dikenal (pakai "manual" atau "reverse")' },
    { status: 400 }
  );
}
