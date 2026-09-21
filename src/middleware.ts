import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'kopontren_session';
const EXP_COOKIE = 'kopontren_session_exp';

// Aset publik (PWA + statis /public) yang harus selalu bisa diakses TANPA
// sesi, supaya tidak di-redirect 307 ke /login:
// CRITICAL: /sw.js & /manifest.json yang di-redirect ke /login saat belum
// login membuat service worker GAGAL register (respons = HTML /login, bukan
// JS/JSON) => PWA tidak bisa diinstal di HP (tombol Install tidak muncul).
// Cache-Control aset ini di-set di next.config headers (level CDN), jadi
// middleware cukup biarkan lewat handler normal — tanpa redirect & tanpa
// header no-cache.
const PUBLIC_PWA_RE =
  /^\/(sw\.js|manifest\.(json|webmanifest)|favicon\.ico|apple-touch-icon[^/]*\.(png|svg)|icon-[^/]+\.(png|svg|jpe?g|webp)|logo-[^/]+\.(svg|png|jpe?g|webp))(\/|$)/i;
const PUBLIC_IMG_RE = /\.(svg|png|jpe?g|gif|webp|ico)$/i;
const isPublicAsset = (p: string) => PUBLIC_PWA_RE.test(p) || PUBLIC_IMG_RE.test(p);

/**
 * Guard edge (Tanpa DB — hanya baca cookie) utk alur idle-timeout:
 *  - Tidak ada cookie sesi    -> /login (password penuh).
 *  - Ada sesi, cookie batas-hidup sudah habis -> /login/pin (re-auth PIN).
 * API sengaja dilewati (route menangani 401 sendiri). Public route /login*
 * tidak di-redirect agar user bisa masuk & set PIN.
 * Aset publik (PWA + statis /public) dilewati guard sesi (lihat isPublicAsset).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    // Header no-store utk /api/* di-set via next.config headers (CDN level).
    return;
  }
  // Aset publik (PWA + statis /public): skip guard sesi, lanjut ke handler
  // normal tanpa redirect — Cache-Control tetap mengikuti next.config.
  if (isPublicAsset(pathname)) return NextResponse.next();

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
