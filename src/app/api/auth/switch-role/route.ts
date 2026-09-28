import { NextResponse } from 'next/server';
import {
  checkSession,
  switchRole,
  touchSession,
  SESSION_EXP_COOKIE,
  ROLES,
  type AppUser,
  type Role,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit';

function pub(u: AppUser) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    primary_role: u.primary_role,
    roles: u.roles,
  };
}

/**
 * M1: ganti role efektif (mode switch) untuk sesi ini.
 * - body: { role } — WAJIB termasuk `users.roles` user (divalidasi di
 *   switchRole via parseUserRoles + normRole); selain itu -> 403.
 * - Update `sessions.active_role` + invalidasi cache sesi (30 dtk),
 *   sehingga role baru langsung tersaji di semua request berikutnya.
 * - Tidak mengubah `users.role` (primary tetap primary).
 * - Audit `auth:switch-role` (event anyar; snapshot user_role = acting
 *   role SEBELUM switch; fieldChanges = {active_role: {before, after}}).
 * Sesi idle entek -> 401 needPin (klien re-auth via /login/pin;
 * active_role dipertahankan).
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { role?: string };
  const raw = String(b.role ?? '').trim().toLowerCase();
  if (!(ROLES as readonly string[]).includes(raw)) {
    return NextResponse.json({ error: 'Role tidak valid.' }, { status: 400 });
  }

  const s = await checkSession();
  if (s.status === 'none') {
    return NextResponse.json(
      { error: 'Sesi tidak ditemukan. Silakan login.' },
      { status: 401 }
    );
  }
  if (s.status === 'timeout') {
    return NextResponse.json(
      { error: 'Sesi entek. Re-auth PIN.', needPin: true },
      { status: 401 }
    );
  }

  const me = s.user;
  const target = raw as Role; // sudah lolos cek keanggotaan ROLES di atas
  if (!me.roles.includes(target)) {
    return NextResponse.json({ error: 'Role tidak dimiliki akun ini.' }, { status: 403 });
  }

  const r = await switchRole(target);
  if (!r.ok || !r.user) {
    return NextResponse.json({ error: r.error || 'Gagal ganti role.' }, { status: 403 });
  }

  if (me.role !== target) {
    // Audit: snapshot userRole = role aktif SEBELUM (acting role saat
    // request ini); fieldChanges merekam diff active_role + primary_role.
    await logAudit({
      userId: me.id,
      userName: me.display_name,
      userRole: me.role,
      action: 'auth:switch-role',
      entity: 'auth',
      entityId: me.id,
      fieldChanges: {
        active_role: { before: me.role, after: target },
        primary_role: { before: me.primary_role, after: me.primary_role },
      },
      req,
    });
  }

  // Refresh last_activity + cookie exp (sama pola verify PIN).
  const t = await touchSession();
  const res = NextResponse.json({
    ok: true,
    changed: me.role !== target,
    user: pub(r.user),
  });
  if (t.exp) {
    res.cookies.set(SESSION_EXP_COOKIE, t.exp.value, {
      path: '/',
      maxAge: t.exp.maxAge,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return res;
}
