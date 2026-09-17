import crypto from 'node:crypto';

/**
 * Random, URL-safe member QR token (32 hex chars).
 * Kept deliberately opaque: the scanner (POS) only does an exact
 * `qr_code = ?` lookup, so no structure/payload format is required.
 */
export function generateQrToken(): string {
  return crypto.randomBytes(16).toString('hex');
}
