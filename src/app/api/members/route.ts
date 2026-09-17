import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { canonicalPhone, validatePhone } from '@/lib/phone';
import { generateQrToken } from '@/lib/qr';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const url = new URL(req.url);
  const q = String(url.searchParams.get('q') || '').trim();
  const phoneQ = canonicalPhone(String(url.searchParams.get('phone') || ''));
  const code = String(url.searchParams.get('code') || '').trim();
  const d = await db();
  let sql = `SELECT id, name, phone, address, points, total_spent, qr_code, created_at FROM members`;
  const args: string[] = [];
  if (code) {
    // QR-code lookup (member badge / scan)
    sql += ` WHERE qr_code = ?`;
    args.push(code);
  } else if (phoneQ) {
    // phone search: canonical prefix, then looser match on raw value
    sql += ` WHERE phone LIKE ? OR phone LIKE ?`;
    args.push(phoneQ + '%', '%' + phoneQ.replace(/^0/, '62') + '%');
  } else if (q) {
    sql += ` WHERE (name LIKE ? OR phone LIKE ? OR address LIKE ?)`;
    const like = '%' + q + '%';
    args.push(like, like, like);
  }
  sql += ` ORDER BY name COLLATE NOCASE LIMIT 500`;
  const members = await d.prepare(sql).all(...args);
  // Backfill: members created before QR badges existed have an empty
  // qr_code; assign one lazily so POS scanning works for legacy accounts.
  const rows = members as { id: number; qr_code: string }[];
  const missing = rows.filter((m) => !(m.qr_code || '').trim());
  if (missing.length) {
    const up = d.prepare('UPDATE members SET qr_code = ? WHERE id = ?');
    for (const m of missing) {
      const token = generateQrToken();
      m.qr_code = token;
      await up.run(token, m.id);
    }
  }
  return NextResponse.json({ members });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Nama member wajib' }, { status: 400 });
  // any logged-in role (kasir/pengurus/admin) may register a member at the counter
  const phoneRaw = String(b.phone || '').trim();
  let phone = '';
  if (phoneRaw) {
    const p = validatePhone(phoneRaw);
    if (!p)
      return NextResponse.json(
        { error: 'Format nomor tidak valid (10-15 digit, awalan 08/62/+62)' },
        { status: 400 }
      );
    phone = p;
  }
  const d = await db();
  // dedupe: same phone already registered -> reuse the account
  if (phone) {
    const existing = (await d
      .prepare('SELECT id, qr_code FROM members WHERE phone = ? LIMIT 1')
      .get(phone)) as { id: number; qr_code?: string } | undefined;
    if (existing)
      return NextResponse.json({ ok: true, id: existing.id, exists: true, qr_code: existing.qr_code || '' });
  }
  const qrCode = generateQrToken();
  const info = await d
    .prepare(`INSERT INTO members (name, phone, address, qr_code) VALUES (?, ?, ?, ?)`)
    .run(name, phone, String(b.address || '').trim(), qrCode);
  await logAudit(user, 'member:create', 'members', Number(info.lastInsertRowid), undefined, {
    name,
    phone,
  });
  return NextResponse.json({ ok: true, id: Number(info.lastInsertRowid), qr_code: qrCode });
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(b.id || 0);
  if (!id) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });
  const d = await db();
  const row = (await d
    .prepare('SELECT * FROM members WHERE id = ?')
    .get(id)) as {
    id: number;
    name: string;
    phone: string;
    address: string;
    points: number;
  } | undefined;
  if (!row) return NextResponse.json({ error: 'Member tidak ditemukan' }, { status: 404 });
  const phoneRaw = String(b.phone ?? row.phone).trim();
  let phone = '';
  if (phoneRaw) {
    const p = validatePhone(phoneRaw);
    if (!p)
      return NextResponse.json(
        { error: 'Format nomor tidak valid (10-15 digit, awalan 08/62/+62)' },
        { status: 400 }
      );
    phone = p;
  }
  // uniqueness: phone must not be used by another member
  if (phone) {
    const clash = (await d
      .prepare('SELECT id FROM members WHERE phone = ? AND id != ? LIMIT 1')
      .get(phone, id)) as { id: number } | undefined;
    if (clash)
      return NextResponse.json(
        { error: 'Nomor sudah terdaftar pada member lain' },
        { status: 409 }
      );
  }
  await d
    .prepare('UPDATE members SET name = ?, phone = ?, address = ? WHERE id = ?')
    .run(
      String(b.name ?? row.name).trim() || row.name,
      phone,
      String(b.address ?? row.address).trim(),
      id
    );
  await logAudit(user, 'member:update', 'members', id, row, {
    name: String(b.name ?? row.name),
    phone,
    address: String(b.address ?? row.address),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id') || '0');
  if (!id) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });
  const d = await db();
  const row = (await d
    .prepare('SELECT * FROM members WHERE id = ?')
    .get(id)) as { id: number; name: string } | undefined;
  if (!row) return NextResponse.json({ error: 'Member tidak ditemukan' }, { status: 404 });
  await d.prepare('DELETE FROM members WHERE id = ?').run(id);
  await d.prepare('UPDATE sales SET member_id = NULL WHERE member_id = ?').run(id);
  await logAudit(user, 'member:delete', 'members', id, row, undefined);
  return NextResponse.json({ ok: true });
}