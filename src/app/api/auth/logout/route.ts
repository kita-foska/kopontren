import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_EXP_COOKIE, currentUser, destroySession, findSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  // Audit trail: catat SIAPA logout (snapshot user) sebelum sesi dimusnahkan.
  // Fallback findSessionUser: sesi idle-expired (currentUser null) tetap
  // tercatat log-out-nya.
  const user = (await currentUser()) ?? (await findSessionUser());
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await destroySession(token);
  if (user) {
    await logAudit({
      userId: user.id,
      userName: user.display_name,
      userRole: user.role,
      action: 'auth:logout',
      entity: 'auth',
      entityId: null,
      req,
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  res.cookies.set(SESSION_EXP_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
