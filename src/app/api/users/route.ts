import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db, tx } from '@/db';
import { currentUser, hashPassword, randomSalt, normRole, parseUserRoles, ROLES } from '@/lib/auth';
import type { Role } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createRequest } from '@/lib/approvals';
import { notify } from '@/lib/notify';

function publicUser(r: Record<string, unknown>) {
  const role = normRole(String(r.role ?? ''));
  return {
    id: r.id,
    username: r.username,
    display_name: r.display_name,
    role,
    roles: parseUserRoles(r.roles as string | null, role),
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
      .prepare('SELECT id, username, display_name, role, roles, active, pw_default, created_at FROM users ORDER BY username')
      .all()
  ).map((u) => publicUser(u as Record<string, unknown>));
  const self = (await d
    .prepare('SELECT id, username, display_name, role, roles, active, pw_default, created_at FROM users WHERE id = ?')
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
  // M1-4: normalisasi eksplisit (trim + lowercase) AGAR guard 400 benar-benar
  // tercapai: normRole('Admin') lama di-swallow jadi 'kasir' (normRole tak
  // case-sensitive-strict) -> role tak dikenal kini ditolak, bukan diam-diam
  // turun ke kasir. Default tanpa field = 'kasir'.
  const roleRaw = b.role !== undefined ? String(b.role).trim().toLowerCase() : undefined;
  if (roleRaw !== undefined && !(ROLES as readonly string[]).includes(roleRaw)) {
    return NextResponse.json({ error: 'Role tidak valid.' }, { status: 400 });
  }
  const role: Role = roleRaw !== undefined ? (roleRaw as Role) : 'kasir';
  const d = await db();
  const exists = await d.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 409 });
  // P2/Q62: pembuatan akun ADMIN lewat approval flow (dua orang).
  // Password langsung di-hash ke payload (salt + pass_hash, BUKAN
  // plaintext). Role selain admin tetap tulis langsung (perilaku lama).
  if (role === 'admin') {
    const salt = randomSalt();
    const rid = await tx(d, () =>
      createRequest(
        d,
        { id: user.id, username: user.username },
        'user:create_admin',
        {
          username,
          display_name: String(b.display_name || '').trim(),
          salt,
          pass_hash: hashPassword(password, salt),
          created_by: user.id,
        },
        ''
      )
    );
    await logAudit(user, 'user:create_requested', 'users', null, undefined, { username, role }, req);
    try {
      await notify({
        type: 'approval_pending',
        title: 'Permintaan persetujuan baru',
        message: 'Buat akun admin "' + username + '" (oleh ' + user.username + ')',
        link: '/admin/persetujuan',
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({
      ok: true,
      pending: true,
      request_id: rid,
      message: 'Tercatat. Menunggu persetujuan di /admin/persetujuan.',
    });
  }
  const salt = randomSalt();
  const info = await d
    .prepare(
      `INSERT INTO users (username, display_name, role, roles, active, salt, pass_hash, pw_default, created_by)
       VALUES (?, ?, ?, ?, 1, ?, ?, 0, ?)`
    )
    .run(
      username,
      String(b.display_name || '').trim(),
      role,
      JSON.stringify([role]),
      salt,
      hashPassword(password, salt),
      user.id
    );
  await logAudit(user, 'user:create', 'users', Number(info.lastInsertRowid), undefined, {
    username,
    role,
  }, req);
  return NextResponse.json({ ok: true });
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
    | { id: number; salt: string; pass_hash: string; username: string; role: string; roles: string | null; active: number }
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
    await logAudit(user, 'user:password', 'users', id, undefined, { self: true }, req);
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
    }, req);
    return NextResponse.json({ ok: true });
  }

  // Aktif / nonaktif (tidak boleh ke diri sendiri). P2/Q62: lewat
  // approval flow (aksi user:active); eksekusi saat apply di
  // lib/approvals.ts (update active + bersihkan sesi bila nonaktif).
  if (b.active !== undefined) {
    if (id === user.id)
      return NextResponse.json({ error: 'Tidak bisa nonaktifkan akun sendiri' }, { status: 400 });
    const active = b.active ? 1 : 0;
    const rid = await tx(d, () =>
      createRequest(
        d,
        { id: user.id, username: user.username },
        'user:active',
        { user_id: id, username: target.username, active },
        ''
      )
    );
    await logAudit(
      user,
      'user:active_requested',
      'users',
      id,
      { active: Number(target.active) },
      { active },
      req
    );
    try {
      await notify({
        type: 'approval_pending',
        title: 'Permintaan persetujuan baru',
        message:
          'Status akun ' + target.username + ' -> ' + (active ? 'aktif' : 'nonaktif') + ' (oleh ' + user.username + ')',
        link: '/admin/persetujuan',
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({
      ok: true,
      pending: true,
      request_id: rid,
      message: 'Tercatat. Menunggu persetujuan di /admin/persetujuan.',
    });
  }

  // M1-4: edit role/roles. primary = users.role; roles = JSON array (primary selalu masuk set).
  if (b.role !== undefined || b.roles !== undefined) {
    const curPrimary = normRole(target.role);
    const curRoles = parseUserRoles(target.roles, curPrimary);
    // M1-4: validasi eksplisit — role tak dikenal ditolak 400, BUKAN
    // di-swallow normRole jadi 'kasir' (diam-diam demote = rusaknya data).
    // trim + lowercase karena normRole sensitif kasus.
    const rawPrimary = b.role !== undefined ? String(b.role).trim().toLowerCase() : undefined;
    if (rawPrimary !== undefined && !(ROLES as readonly string[]).includes(rawPrimary)) {
      return NextResponse.json({ error: 'Role tidak valid.' }, { status: 400 });
    }
    const newPrimary: Role = rawPrimary !== undefined ? (rawPrimary as Role) : curPrimary;
    // Guard 2: tak boleh mengubah primary role milik sendiri.
    if (id === user.id && newPrimary !== curPrimary)
      return NextResponse.json({ error: 'Primary role sendiri tidak bisa diubah' }, { status: 400 });
    // Set tujuan: b.roles = daftar lengkap yang diinginkan; selain itu pertahankan role tambahan saat ini.
    // b.roles = daftar lengkap yang diinginkan: SEMUA entri harus valid
    // (tak dikenal -> 400, bukan diam-diam 'kasir' di tengah daftar).
    let desired: Role[] = curRoles;
    if (Array.isArray(b.roles)) {
      const raw = (b.roles as unknown[]).map((x) => String(x).trim().toLowerCase());
      for (const s of raw) {
        if (!(ROLES as readonly string[]).includes(s)) {
          return NextResponse.json({ error: 'Role tidak valid.' }, { status: 400 });
        }
      }
      desired = raw as Role[];
    }
    // Susun set akhir: primary di depan + dedup + validasi enum (normRole).
    const finalRoles: Role[] = [];
    const seen = new Set<string>();
    const pushRole = (r: Role) => {
      if (!seen.has(r)) {
        seen.add(r);
        finalRoles.push(r);
      }
    };
    pushRole(newPrimary);
    for (const r of desired) pushRole(r);
    // Guard 3: tak boleh mendemote admin terakhir (admin = role='admin' ATAU roles memuat 'admin').
    // Dilewati di request-time (fail cepat); guard RE-VALIDATE lagi saat
    // apply (lib/approvals.ts) karena state bisa berubah di antre.
    if (curRoles.includes('admin') && !finalRoles.includes('admin')) {
      const cnt = (await d
        .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' OR roles LIKE '%\"admin\"%'")
        .get()) as { c: number };
      if (Number(cnt.c) <= 1)
        return NextResponse.json({ error: 'Tidak bisa mendemote admin terakhir' }, { status: 400 });
    }
    // P2/Q62: ubah peran lewat approval flow (aksi user:role). Payload
    // menyimpan set final; eksekusi (UPDATE role + roles JSON) terjadi
    // saat apply setelah guard re-validation.
    const rid = await tx(d, () =>
      createRequest(
        d,
        { id: user.id, username: user.username },
        'user:role',
        {
          user_id: id,
          username: target.username,
          new_primary: newPrimary,
          new_roles: finalRoles,
          cur_primary: curPrimary,
          cur_roles: curRoles,
        },
        ''
      )
    );
    await logAudit(
      user,
      'user:roles_requested',
      'users',
      id,
      { role: curPrimary, roles: curRoles },
      { role: newPrimary, roles: finalRoles },
      req
    );
    try {
      await notify({
        type: 'approval_pending',
        title: 'Permintaan persetujuan baru',
        message:
          'Peran ' + target.username + ': ' + curPrimary + ' -> ' + newPrimary + ' (oleh ' + user.username + ')',
        link: '/admin/persetujuan',
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({
      ok: true,
      pending: true,
      request_id: rid,
      message: 'Tercatat. Menunggu persetujuan di /admin/persetujuan.',
    });
  }

  return NextResponse.json({ error: 'Tindakan tidak dikenal' }, { status: 400 });
}
