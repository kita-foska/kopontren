import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'kopontren_session';
const EXP_COOKIE = 'kopontren_session_exp';

/**
 * Guard edge (Tanpa DB — hanya baca cookie) utk alur idle-timeout:
 *  - Tidak ada cookie sesi    -> /login (password penuh).
 *  - Ada sesi, cookie batas-hidup sudah habis -> /login/pin (re-auth PIN).
 * API sengaja dilewati (route menangani 401 sendiri). Public route /login*
 * tidak di-redirect agar user bisa masuk & set PIN.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) return;
  if (pathname.startsWith('/login')) return;

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  const hasExp = !!req.cookies.get(EXP_COOKIE)?.value;
  if (!hasExp) {
    const url = req.nextUrl.clone();
    url.pathname = '/login/pin';
    url.search = '';
    return NextResponse.redirect(url);
  }
}

export const config = {
  // Lepas file statis; sisanya (termasuk /) melewati guard di atas.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-kopontren.svg).*)'],
};
