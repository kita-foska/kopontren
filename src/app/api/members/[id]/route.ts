import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { generateQrToken } from '@/lib/qr';

/**
 * PATCH /api/members/[id] — admin-only maintenance endpoint.
 * Body: { regenerate_qr: true } -> issues a new opaque QR token for the
 * member (invalidates the old one, e.g. badge lost/compromised).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const p = await params;
  const id = Number(p.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: 'ID member tidak valid' }, { status: 400 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.regenerate_qr !== true)
    return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 });

  const d = await db();
  const row = (
    await d.prepare('SELECT id, name, qr_code FROM members WHERE id = ?').get(id)
  ) as
    | { id: number; name: string; qr_code: string }
    | undefined;
  if (!row) return NextResponse.json({ error: 'Member tidak ditemukan' }, { status: 404 });

  const token = generateQrToken();
  await d.prepare('UPDATE members SET qr_code = ? WHERE id = ?').run(token, id);
  try {
    await logAudit(user, 'member:qr-reset', 'members', id, { old: row.qr_code }, { new: token });
  } catch {
    /* audit is best-effort */
  }
  return NextResponse.json({ ok: true, qr_code: token });
}
