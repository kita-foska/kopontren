/**
 * IP klien terbaik utk forensik (audit_log) & kunci throttle (login).
 *
 * Kenapa KANAN-paling di rantai `x-forwarded-for`:
 * Vercel edge MELAMPIRKAN IP klien sungguhan di URAIAN (paling kanan).
 * Nilai sebelum itu — termasuk header yang dikirim klien sendiri —
 * BISA di-forge. Implementasi lama mengambil kiri-paling (pos. 0),
 * artinya penyerang bisa isi `x-forwarded-for: IP-arbitrary` dan:
 *   - memalsu kolom audit_log.ip_address (forensik), DAN
 *   - memutar-putar kunci throttle login (`username|IP`) sehingga
 *     lockout anti brute-force kelihatannya tak pernah terpicu.
 * Kanan-paling = satu-satunya hop yang tak bisa diubah klien.
 *
 * Hasil divalidasi (IPv4/IPv6); bukan IP sah -> 'unknown' (jangan
 * simpan sampah di DB).
 */
export function clientIp(req?: Request | Headers): string {
  if (!req) return 'unknown';
  const h = (k: string) => (req instanceof Headers ? req.get(k) : req.headers.get(k));
  let ip =
    h('x-forwarded-for')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .pop() || // hop terakhir = yang ditambahkan edge terpercaya
    h('x-real-ip')?.trim() ||
    '';
  // Bentuk standar RFC 7239 `X-Forwarded-For: for=1.2.3.4` (jarang).
  if (ip.toLowerCase().startsWith('for=')) ip = ip.slice(4);
  return isValidIp(ip) ? ip : 'unknown';
}

function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return v4.slice(1, 5).every((o) => Number(o) <= 255);
  // IPv6 praktis (bentuk kompres `::1` s/d perluas): 2+ tanda dua-titik,
  // hanya heks + titik dua. Cukup utk forensik; tidak perlu parser penuh.
  return /^[0-9A-Fa-f]{0,4}(:[0-9A-Fa-f]{0,4}){2,7}$/.test(ip);
}
