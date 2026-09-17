/**
 * Phone helpers (Indonesian numbers).
 *
 * Canonical form: digits only, local style `08xxxxxxxxxx`.
 *  - "0812-3456-789"  -> "08123456789"
 *  - "+62812-3456789" -> "08123456789"
 *  - "628123456789"  -> "08123456789"
 *
 * Used by /api/members (dedupe + validation) and the POS phone search.
 */
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
