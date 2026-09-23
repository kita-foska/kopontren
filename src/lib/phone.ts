/**
 * Phone helpers (Indonesian numbers).
 *
 * Canonical form: digits only, local style `08xxxxxxxxxx`.
 *  - "0812-3456-789"  -> "08123456789"
 *  - "+62812-3456789" -> "08123456789"
 *  - "628123456789"  -> "08123456789"
 *
 * Used by /api/members (dedupe + validation) and the POS phone search.
 *
 * Modul ini murni (type-only import Db) sehingga aman diimpor komponen klien.
 */
import type { Db } from '@/db';

export function canonicalPhone(raw: string): string {
  let s = String(raw || '').replace(/[^0-9+]/g, '');
  // drop country-code markers
  s = s.replace(/^\+62/, '').replace(/^62(?=0?8)/, '');
  // ensure leading 0 (local format)
  if (s && !s.startsWith('0')) s = '0' + s;
  return s.replace(/[^0-9]/g, '');
}

/**
 * Valid when 10-15 digits in canonical form (08…, 62/+62 accepted on input).
 * Returns the canonical phone, or null when invalid (empty string passes as
 * "no phone").
 */
export function validatePhone(raw: string): string | null {
  const digits = canonicalPhone(raw);
  if (!digits) return null;
  if (digits.length < 10 || digits.length > 15) return null;
  if (!digits.startsWith('0')) return null;
  return digits;
}

/**
 * id member lain yang sudah memakai `phone`, atau null bila nomor bebas.
 *
 * Dipakai /api/members (POST & PUT) SEBELUM menulis ke tabel, supaya
 * pelanggaran unique partial index `idx_members_phone_uniq` tidak muncul
 * sebagai error mentah (HTTP 500 / "Kesalahan jaringan." di POS), melainkan
 * pesan yang bisa dimengerti kasir/pengurus.
 *
 * Perbandingan DUA arah kanonik: scan ringan kolom `phone` non-kosong lalu
 * cocokkan nomor apa adanya ATAU hasil canonicalPhone(stored) ===
 * canonicalPhone(query). Ini menutup arah yang tak terjangkau index mentah:
 * baris legacy tersimpan '+62 274 555 1234' sementara input '02745551234'
 * (index unik hanya membandingkan teks mentah — keduanya lolos). Biaya O(N)
 * hanya di jalur tulis langka (POST/PUT member), bukan jalur baca POS.
 * Nomor kosong tidak dibatasi (banyak member boleh tanpa HP) dan `exceptId`
 * mengecualikan member yang sedang diedit (PUT tidak boleh dianggap bentrok
 * dgn dirinya sendiri).
 */
export async function phoneOwner(
  d: Db,
  phone: string,
  exceptId = 0
): Promise<number | null> {
  if (!phone) return null;
  const canon = canonicalPhone(phone);
  const rows = (await d
    .prepare('SELECT id, phone FROM members WHERE phone != ? AND id != ?')
    .all('', exceptId)) as { id: number; phone: string }[];
  for (const r of rows) {
    if (r.phone === phone) return Number(r.id);
    if (canon && canonicalPhone(r.phone) === canon) return Number(r.id);
  }
  return null;
}
