import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/db';
import { currentUser, hashPassword, randomSalt, normRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

function publicUser(r: Record<string, unknown>) {
  return {
    id: r.id,
    username: r.username,
    display_name: r.display_name,
    role: r.role,
    active: r.active,
    pw_default: r.pw_default,
    created_at: r.created_at,
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.role !== 'admin')
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const d = await db();
  const users = (
    await d
      .prepare('SELECT id, username, display_name, role, active, pw_default, created_at FROM users ORDER BY username')
      .all()
  ).map((u) => publicUser(u as Record<string, unknown>));
  const self = (await d
    .prepare('SELECT id, username, display_name, role, active, pw_default, created_at FROM users WHERE id = ?')
    .get(user.id)) as Record<string, unknown>;
  return NextResponse.json({ users, self: publicUser(self as Record<string, unknown>) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.role !== 'admin')
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const username = String(b.username || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(username))
    return NextResponse.json({ error: 'Username 3-30 karakter (huruf kecil, angka, titik, -, _)' }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
  const role = normRole(b.role);
  const d = await db();
  const exists = await d.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 409 });
  const salt = randomSalt();
  const displayName = String(b.display_name || '').trim();
  const info = await d
    .prepare(
      `INSERT INTO users (username, display_name, role, active, salt, pass_hash, pw_default, created_by)
       VALUES (?, ?, ?, 1, ?, ?, 0, ?)`
    )
    .run(username, displayName, role, salt, hashPassword(password, salt), user.id);
  const newUserId = Number(info.lastInsertRowid);

  // Pengurus are automatically registered as a member (loyalty profile),
  // linked via users.member_id and flagged members.is_pengurus = 1.
  if (role === 'pengurus') {
    const memberName = displayName || username;
    const dup = (await d
      .prepare('SELECT id FROM members WHERE name = ? COLLATE NOCASE AND is_pengurus = 1')
      .get(memberName)) as { id: number } | undefined;
    let memberRowid: number;
    if (dup) {
      memberRowid = dup.id;
    } else {
      const m = await d
        .prepare(
          `INSERT INTO members (name, phone, address, points, total_spent, is_pengurus)
           VALUES (?, '', '', 0, 0, 1)`
        )
        .run(memberName);
      memberRowid = Number(m.lastInsertRowid);
    }
    await d.prepare('UPDATE users SET member_id = ? WHERE id = ?').run(memberRowid, newUserId);
  }

  await logAudit(user, 'user:create', 'users', newUserId, undefined, {
    username,
    role,
  });
  return NextResponse.json({ ok: true, id: newUserId });
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.role !== 'admin')
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(b.id || 0);
  if (!id) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });
  const d = await db();
  const target = (await d.prepare('SELECT * FROM users WHERE id = ?').get(id)) as
    | { id: number; salt: string; pass_hash: string; username: string }
    | undefined;
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });

  // Ganti password sendiri (wajib tahu password lama)
  if (b.old_password !== undefined) {
    if (id !== user.id) return NextResponse.json({ error: 'Hanya untuk akun sendiri' }, { status: 400 });
    const old = String(b.old_password || '');
    const cand = Buffer.from(hashPassword(old, target.salt), 'hex');
    const stored = Buffer.from(target.pass_hash, 'hex');
    if (cand.length !== stored.length || !crypto.timingSafeEqual(cand, stored)) {
      return NextResponse.json({ error: 'Password lama salah' }, { status: 400 });
    }
    const next = String(b.password || '');
    if (next.length < 6) return NextResponse.json({ error: 'Password baru min 6' }, { status: 400 });
    const salt = randomSalt();
    await d.prepare('UPDATE users SET salt = ?, pass_hash = ?, pw_default = 0 WHERE id = ?').run(
      salt,
      hashPassword(next, salt),
      id
    );
    await logAudit(user, 'user:password', 'users', id, undefined, { self: true });
    return NextResponse.json({ ok: true });
  }

  // Reset password oleh pengurus
  if (b.password !== undefined) {
    const next = String(b.password || '');
    if (next.length < 6) return NextResponse.json({ error: 'Password min 6' }, { status: 400 });
    const salt = randomSalt();
    await d.prepare('UPDATE users SET salt = ?, pass_hash = ?, pw_default = 0 WHERE id = ?').run(
      salt,
      hashPassword(next, salt),
      id
    );
    await logAudit(user, 'user:reset-password', 'users', id, undefined, {
      username: (target as { username?: string }).username,
    });
    return NextResponse.json({ ok: true });
  }

  // Aktif / nonaktif (tidak boleh ke diri sendiri)
  if (b.active !== undefined) {
    if (id === user.id)
      return NextResponse.json({ error: 'Tidak bisa nonaktifkan akun sendiri' }, { status: 400 });
    await d.prepare('UPDATE users SET active = ? WHERE id = ?').run(b.active ? 1 : 0, id);
    if (!b.active) {
      await d.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    await logAudit(user, 'user:active', 'users', id, { active: 1 }, {
      active: b.active ? 1 : 0,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Tindakan tidak dikenal' }, { status: 400 });
}
