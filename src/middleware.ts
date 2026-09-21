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
  if (pathname.startsWith('/api/')) {
    // Header no-store utk /api/* di-set via next.config headers (CDN level).
    return;
  }
  // Aset statis publik (PWA: /sw.js + /manifest.json, ikon, logo, favicon,
  // gambar): BEBAS TANPA SESI — dilewati begitu saja, TIDAK di-redirect.
  // CRITICAL: /sw.js & /manifest.json yang di-redirect 307 ke /login saat
  // belum login membuat service worker GAGAL register (respons = HTML
  // /login, bukan JS) => PWA tidak bisa diinstal di HP.
  const isPublicStatic =
    /^\/(sw\.js|manifest\.json|favicon\.ico|icon-|logo-kopontren)(\/|$)/.test(pathname) ||
    /\.(svg|png|jpe?g|gif|webp|ico)$/i.test(pathname);
  if (isPublicStatic) return;

  // HTML & route dinamis: selalu revalidate supaya deploy baru menyajikan
  // bundle terbaru (aset statis /public & /_next punya policy header sendiri
  // di next.config; /_next/static & /_next/image dikecualikan matcher).
  const isStatic = /^\/_next\//.test(pathname);
  const res = NextResponse.next();
  if (!isStatic) res.headers.set('Cache-Control', 'no-cache, must-revalidate');

  if (pathname.startsWith('/login')) return res;

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
  return res;
}

export const config = {
  // Lepas file statis; sisanya (termasuk /) melewati guard di atas.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-kopontren.svg).*)'],
};
