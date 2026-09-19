import { NextResponse } from 'next/server';
import { checkSession } from '@/lib/auth';
import type { AppUser } from '@/lib/auth';

function pub(u: AppUser) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
  };
}

/**
 * Status sesi utk watcher klien:
 *  - none    : tidak ada sesi (belum login / sudah logout)
 *  - timeout : sesi idle entek -> re-auth PIN (/login/pin)
 *  - active  : sesi hidup (termasuk sisa detik + apakah PIN sudah diset)
 */
export async function GET() {
  const s = await checkSession();
  if (s.status === 'none') return NextResponse.json({ status: 'none' });
  if (s.status === 'timeout') {
    return NextResponse.json({ status: 'timeout', user: pub(s.user) });
  }
  return NextResponse.json({
    status: 'active',
    user: pub(s.user),
    pin_configured: s.pinConfigured,
    seconds_left: s.secondsLeft,
    session_timeout: s.sessionTimeout,
  });
}
