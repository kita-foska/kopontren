import { NextResponse } from 'next/server';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SEC,
  callbackUri,
  googleAuthEnabled,
  googleAuthUrl,
  oauthState,
} from '@/lib/oauth-google';

/**
 * W12 (v34): langkah 1 Google OAuth (alur manual, zero dependensi).
 * Nonce state disimpan di cookie httpOnly (anti-CSRF; callback wajib
 * mencocokkannya) lalu 302 ke consent Google.
 *
 * Feature OFF (credential env belum diisi) -> 302 /login?google_err=disabled
 * (halaman login menampilkan pesan ramah, tdk ada 404).
 */
export async function GET(req: Request) {
  if (!googleAuthEnabled()) {
    return NextResponse.redirect(new URL('/login?google_err=disabled', req.url));
  }
  const state = oauthState();
  const res = NextResponse.redirect(
    new URL(
      googleAuthUrl({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        redirectUri: callbackUri(req),
        state,
      }),
      req.url
    )
  );
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OAUTH_STATE_MAX_AGE_SEC,
  });
  return res;
}

export const dynamic = 'force-dynamic';