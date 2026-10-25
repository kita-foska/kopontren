import crypto from 'node:crypto';

/**
 * W12 (v34, 2026-10-26): helper Google OAuth 2.0 Authorization Code
 * (manual, TANPA dependensi baru -- keputusan audit ruling Gus Fi via
 * DeepSeek; next-auth ditolak karena bentrok session custom + PIN
 * re-auth). Tashih amanah: login Google hanya "pintu masuk" -- gate
 * users.allow_google (Admin) + domain allowlist; sesi tetap lewat
 * createSession() sehingga PIN idle re-auth, role guard, session cache
 * & middleware TIDAK berubah.
 *
 * Fungsi di sini PURE/hermetic (tanpa DB, tanpa next/headers) agar bisa
 * diuji langsung Node: scripts/test-oauth.ts.
 */

export const OAUTH_STATE_COOKIE = 'kopontren_oauth_state';
/** Batas hidup nonce state (detik). Lebih pendek cukup: consent Google
 *  jarang butuh >5 menit; nonce 1 kali pakai (anti-replay di callback). */
export const OAUTH_STATE_MAX_AGE_SEC = 300;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Fitur aktif di instance ini? (kedua credential env wajib ada). */
export function googleAuthEnabled(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** redirect URI absolut berbasis origin request (Vercel: origin = domain
 *  Vercel; dev: http://localhost:3000). HARUS cocok persis dgn Authorized
 *  redirect URI di Google Cloud Console (lihat DEPLOY-VERCEL.txt). */
export function callbackUri(req: Request): string {
  return new URL(req.url).origin + '/api/auth/google/callback';
}

/** Susun URL consent Google. state = nonce anti-CSRF (disimpan di
 *  cookie httpOnly oleh route /api/auth/google/redirect). */
export function googleAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: opts.state,
    prompt: 'select_account',
  });
  return GOOGLE_AUTH_URL + '?' + p.toString();
}

/** Nonce state (64-hex; tak dapat ditebak, 128 bit). */
export function oauthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

export type GoogleUser = {
  sub: string;
  email: string | null;
  name: string | null;
};

/** Tukar authorization code -> access token. null = gagal (jaringan,
 *  code kedaluwarsa, mismatch redirect_uri, dll). */
export async function exchangeCodeForToken(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<string | null> {
  const p = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: opts.redirectUri,
  });
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p.toString(),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string };
    return j.access_token ?? null;
  } catch {
    return null;
  }
}

/** Ambil profil Google (sub, email, name) dgn access token. */
export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { sub?: string; email?: string | null; name?: string | null };
    if (!j.sub) return null;
    return { sub: j.sub, email: (j.email ?? '').trim().toLowerCase() || null, name: j.name ?? null };
  } catch {
    return null;
  }
}

/**
 * Domain allowlist dari env GOOGLE_ALLOWED_DOMAINS (koma, lowercase).
 * Contoh: 'ppalittihad.com' atau '@ppalittihad.com,@alittihad.id'
 * (tanda '@' dinormalisasi, boleh ada/tak ada). Kosong/absen = fitur
 * OFF utk semua email (gate fiqih: tak ada yang lolos tanpa allowlist).
 */
export function allowedDomains(): string[] {
  const raw = (process.env.GOOGLE_ALLOWED_DOMAINS || '').toLowerCase();
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^@/, ''))
    .filter(Boolean);
}

/** Apakah email masuk allowlist? false bila allowlist kosong atau email
 *  null (tak boleh "lolos tanpa list" -- fail-closed). */
export function emailDomainAllowed(email: string | null): boolean {
  const domains = allowedDomains();
  if (domains.length === 0 || !email) return false;
  const at = email.lastIndexOf('@');
  if (at <= 0) return false;
  // Lowercase kedua sisi (email sudah dinormalisasi oleh fetchGoogleUser;
  // di sini robust untuk pemanggil lain).
  return domains.includes(email.slice(at + 1).toLowerCase());
}

// Anti-replay (in-memory per instance)
// Lapisan pertahanan TAMBAHAN di atas (a) nonce state + cookie httpOnly
// dan (b) validasi code/token oleh Google sendiri. Vercel multi-instance:
// Map ini per-instance -- replay yg menembus instance lain tetap gagal di
// Google (authorization code single-use + expired).
const consumed = new Map<string, number>();
const CONSUMED_TTL_MS = 15 * 60 * 1000; // 15 menit
const CONSUMED_MAX = 500;

/**
 * Satu-pakai: true bila key belum pernah dipakai dalam TTL; pemakaian
 * pertama dicatat. Key usang di-evict; Map dibatasi CONSUMED_MAX.
 */
export function consumeOnce(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of consumed) {
    if (now - t > CONSUMED_TTL_MS) consumed.delete(k);
  }
  if (consumed.size >= CONSUMED_MAX) consumed.clear();
  if (consumed.has(key)) return false;
  consumed.set(key, now);
  return true;
}