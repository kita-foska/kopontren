/**
 * W18-B: modul hermetis (pure) utk throttle login -- IN-MEMORY,
 * tanpa dependensi eksternal (pola lokal single-instance; Turso
 * tetap sumber data, throttle adalah lapisan proteksi brute-force).
 * Dipakai /api/auth/login; diuji langsung Node type-stripping
 * (scripts/test-login-throttle.ts, pola test-roles.ts).
 *
 * DUA LAPIS (keduanya kunci 15 menit, jendela hitung 15 menit):
 *  L1 (existing, perilaku IDENTIK): max 10 kegagalan per
 *     username+IP -> kunci pasangan tsb 15 mnt.
 *  L2 (W18-B, LAPIS PER-IP): max 5 kegagalan per IP
 *     (GATIKAN username mana pun) -> kunci IP tsb 15 mnt.
 *     Menutup serangan brute-force yang gonta-ganti username
 *     dari sumber IP sama (L1 tak menutup: tiap username baru
 *     dapat 10 cobaan lagi).
 *
 * Kebijakan: kegagalan dicatat pada KEDUA lapis; login SUKSES
 * membersihkan pencacat kedua lapis utk username+IP tsb
 * ("forgive on success"). Lapis L2 dicek DI DEPAN L1 oleh route
 * (lapis yang lebih ketat diprioritaskan). Clock bisa disuntik
 * utk pengujian (default Date.now()).
 */

export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000; // jendela hitung kegagalan
export const LOGIN_THROTTLE_LOCK_MS = 15 * 60 * 1000; // durasi kunci
export const LOGIN_USER_FAIL_LIMIT = 10; // L1: max kegagalan per username+IP
export const LOGIN_IP_FAIL_LIMIT = 5; // L2: max kegagalan per IP (W18-B)
const LOGIN_THROTTLE_MAP_CAP = 500; // cap memori Map (pola existing)

export interface LoginThrottle {
  /** L2: IP sudah terkunci? (dicek route SEBELUM lapis L1). */
  ipLocked(ip: string): boolean;
  /** L1: pasangan username+IP terkunci? */
  userLocked(username: string, ip: string): boolean;
  /** Sisa kunci L1 dalam ms (0 = tak terkunci). */
  userLockRemainingMs(username: string, ip: string): number;
  /** Sisa kunci L2 dalam ms (0 = tak terkunci). */
  ipLockRemainingMs(ip: string): number;
  /** Catat 1 kegagalan (kedua lapis). Panggil SETELAH cek kredensial gagal. */
  recordFailure(username: string, ip: string): void;
  /** Sukses: bersihkan pencacat kedua lapis utk username+IP tsb. */
  recordSuccess(username: string, ip: string): void;
  /** Diagnostik: jumlah entri tersimpan (paling banyak 2*cap). */
  size(): number;
}

interface Entry {
  /** Timestamp (ms) kegagalan dalam jendela -- panjang = jumlah kegagalan. */
  fails: number[];
  /** 0 = tak terkunci; selain itu = batas ms (exclusive) kunci berakhir. */
  lockedUntil: number;
}

/** Gunting kegagalan di luar jendela + buang entri basi + cap Map. */
function prune(m: Map<string, Entry>, now: number): void {
  const floor = now - LOGIN_THROTTLE_WINDOW_MS;
  for (const [k, e] of m) {
    e.fails = e.fails.filter((t) => t >= floor);
    if (e.lockedUntil <= now && e.fails.length === 0) m.delete(k);
  }
  if (m.size > LOGIN_THROTTLE_MAP_CAP) {
    let toDrop = m.size - LOGIN_THROTTLE_MAP_CAP;
    for (const k of m.keys()) {
      if (toDrop <= 0) break;
      m.delete(k);
      toDrop--;
    }
  }
}

export function createLoginThrottle(now: () => number = () => Date.now()): LoginThrottle {
  /** L1: kunci per username+IP (key = "username|ip", username lowercase). */
  const userFails = new Map<string, Entry>();
  /** L2: kunci per IP (W18-B; key = ip). */
  const ipFails = new Map<string, Entry>();

  function lockRemainMs(m: Map<string, Entry>, key: string): number {
    const e = m.get(key);
    if (!e || e.lockedUntil <= 0) return 0;
    return Math.max(0, e.lockedUntil - now());
  }

  function recordFail(m: Map<string, Entry>, key: string, limit: number): void {
    prune(m, now());
    const t = now();
    let e = m.get(key);
    if (!e) {
      e = { fails: [], lockedUntil: 0 };
      m.set(key, e);
    }
    e.fails.push(t);
    // Kunci hanya DISET sekali (saat limit tercapai) -- pencacat setelah
    // terkunci tidak memperpanjang durasi; unlock tetap 15 mnt sejak
    // kegagalan yang ke-limit (perilaku identik kode existing).
    if (e.fails.length >= limit && e.lockedUntil <= t) e.lockedUntil = t + LOGIN_THROTTLE_LOCK_MS;
    // Cap Map (pola kode existing: buang 1 key tertua per pencatatan).
    if (m.size > LOGIN_THROTTLE_MAP_CAP) {
      const oldest = m.keys().next().value;
      if (oldest !== undefined) m.delete(oldest);
    }
  }

  return {
    ipLocked(ip) {
      return lockRemainMs(ipFails, ip) > 0;
    },
    userLocked(username, ip) {
      return lockRemainMs(userFails, (username || 'unknown').toLowerCase() + '|' + ip) > 0;
    },
    userLockRemainingMs(username, ip) {
      return lockRemainMs(userFails, (username || 'unknown').toLowerCase() + '|' + ip);
    },
    ipLockRemainingMs(ip) {
      return lockRemainMs(ipFails, ip);
    },
    recordFailure(username, ip) {
      recordFail(userFails, (username || 'unknown').toLowerCase() + '|' + ip, LOGIN_USER_FAIL_LIMIT);
      recordFail(ipFails, ip, LOGIN_IP_FAIL_LIMIT);
    },
    recordSuccess(username, ip) {
      userFails.delete((username || 'unknown').toLowerCase() + '|' + ip);
      ipFails.delete(ip);
    },
    size() {
      return userFails.size + ipFails.size;
    },
  };
}
