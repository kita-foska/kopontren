/**
 * W14-1 E-STRUK LINK -- link publik /struk/<token> utk e-Struk
 * (m-banking style; tanpa login, tanpa skema baru).
 *
 * TOKEN = `saleId` + '.' + digest HMAC-SHA256(saleId, STRUK_LINK_SECRET)
 * (16 char base64url, ~96 bit -- tak bisa ditebak; nomor urut saja bisa
 * didenumerasi, makanya ada HMAC). Deterministik: transaksi sama -> link
 * sama (idempoten, tanpa penyimpanan apa pun -- payload struk dihitung
 * dari tabel sales/sale_items saat halaman dibuka).
 *
 * env `STRUK_LINK_SECRET` (min 16 char; isi Vercel + .env.local):
 * - kosong -> buildEstructUrl() = null -> API /api/struk-link balas 503
 *   + pesan, tombol POS menampilkan toast "belum dikonfigurasi"
 *   (fitur lain POS tetap normal -- graceful).
 *
 * Hermetis utk test (scripts/test-estruct.ts, suite 42): token &
 * mapper TIDAK menyentuh DB; hanya node:crypto.
 */
import crypto from 'node:crypto';
import type { StrukPdfOpts } from './struk-pdf.ts';

/** Panjang digest token (char base64url) -- 96 bit. */
export const ESTRUK_DIGEST_LEN = 16;

/** Baris sales utk e-Struk (hasil query halaman /struk/[token]). */
export type EstrukSaleRow = {
  id: number;
  customer: string;
  pay_method: string;
  note: string;
  total: number;
  discount: number;
  member_points: number;
  amount_paid: number;
  change: number;
  created_at: string;
  kasir: string | null;
  member: string | null;
};

/** Baris sale_items utk e-Struk. */
export type EstrukItemRow = {
  product_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  subtotal: number;
};

function digestOf(saleId: number, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update('kopontren-sale:' + saleId)
    .digest('base64url')
    .slice(0, ESTRUK_DIGEST_LEN);
}

/** Token deterministik: `<saleId>.<digest16>` (char URL-safe). */
export function estrukToken(saleId: number, secret: string): string {
  return String(saleId) + '.' + digestOf(saleId, secret);
}

/** Ekstrak saleId dari token (format `123.ABC...`); null bila tidak valid. */
export function parseEstructId(token: string): number | null {
  const m = /^(\d+)\.[A-Za-z0-9_-]+$/.exec(String(token ?? '').trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Verifikasi token (timing-safe; digest dihitung ulang dari saleId). */
export function verifyEstructToken(token: string, secret: string): boolean {
  const id = parseEstructId(token);
  if (id === null || secret.trim().length === 0) return false;
  const given = String(token.trim().split('.')[1] ?? '');
  const expect = digestOf(id, secret);
  if (expect.length !== given.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(given));
}

/** Secret env (trim; '' = belum dikonfigurasi). */
export function estrukSecret(): string {
  return String(process.env.STRUK_LINK_SECRET ?? '').trim();
}

/** true bila STRUK_LINK_SECRET sudah terisi (min 16 char). */
export function hasEstructSecret(): boolean {
  return estrukSecret().length >= 16;
}

/** URL e-Struk lengkap; null bila secret belum terisi (tombol tersembunyi). */
export function buildEstructUrl(saleId: number, origin: string): string | null {
  if (!hasEstructSecret()) return null;
  return origin + '/struk/' + estrukToken(saleId, estrukSecret());
}

/**
 * Mapper pure: baris sales + sale_items (+ nama kasir & tgl diformat)
 * -> argumen StrukPdfOpts (satu sumber dgn POS: lib/struk-media &
 * lib/rekap memakai bentuk sama). `tgl` dipasok halaman (fmtDateTime
 * server) agar modul ini tetap hermetis (tanpa import format).
 */
export function saleToEstructOpts(
  sale: EstrukSaleRow,
  items: EstrukItemRow[],
  kasirName: string,
  tgl: string
): StrukPdfOpts {
  const paid = Number(sale.amount_paid) || 0;
  const chg = Number(sale.change) || 0;
  return {
    no: '#' + sale.id,
    kasir: kasirName || 'Kasir',
    tgl,
    items: items.map((it) => ({
      qty: Number(it.qty),
      unit: it.unit,
      name: it.product_name,
      price: Number(it.unit_price),
      total: Number(it.subtotal),
    })),
    customer: sale.customer || undefined,
    member: sale.member || undefined,
    discount: Number(sale.discount) || undefined,
    points: Number(sale.member_points) || undefined,
    total: Number(sale.total),
    pay: sale.pay_method,
    // Diterima/kembali hanya utk cash (konsisten dgn logika struk lama).
    received: sale.pay_method === 'cash' ? paid : undefined,
    change: sale.pay_method === 'cash' ? chg : undefined,
  };
}