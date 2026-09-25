/**
 * QRIS (EMVCo / Bank Indonesia) payload encoder — modul MURNI:
 * tanpa DB, tanpa node:crypto, tanpa DOM; deterministik (input sama →
 * output sama), aman utk SSR/build, cron, & unit test Node.
 *
 * Standar: QRIS-BI (variant EMVCo untuk Indonesia). Format TLV:
 * tiap field = id(2 digit) + panjang(2 digit) + nilai.
 *
 * Urutan tag (statis):
 *   00 PFI '0111' · 01 POI '11' · 29 'ID' · 30 NMID · 31 NMID2? ·
 *   52 MCC? · 53 '360' · 58 'ID' · 59 nama · 60 kota? · 62 '1' (GUI) ·
 *   63 CRC16
 * Dinamis (ada `amount`):
 *   00 '0112' · 01 '12' · … · 54 amount (tambah) — pembayar scan,
 *   nominal sudah terisi.
 *
 * CRC: CRC16-CCITT (a.k.a. CCITT-FALSE: init 0xFFFF, polinomial 0x1021,
 * tanpa refleksi/xor-out) dihitung atas SELURUH payload tanpa tag 63.
 *
 * Konfigurasi (NMID, NMID2, MCC, kota) dibaca dari `settings` via
 * /api/settings (qris_*), dikelola di /admin/qris — placeholder pralayar
 * sampai NMID resmi turun (disetujui 2026-09-25).
 */

export interface QrisConfig {
  /** NMID (tag 30) — WAJIB, mis. 'ID102003004050'. */
  nmid: string;
  /** NMID2 (tag 31) — opsional. */
  nmid2?: string;
  /** Merchant Category Code (tag 52), mis. '5731' (retail umum). */
  mcc?: string;
  /** Kota merchant (tag 60). */
  city?: string;
  /** Nama merchant (tag 59) — WAJIB; di UI = store_name. */
  merchantName: string;
  /**
   * Nominal (rupiah, integer). > 0 → QR dinamis (0112 + tag 54);
   * undefined/0 → QR statis (0111, tanpa tag 54 — pembeli isi sendiri).
   */
  amount?: number;
}

/** Nilai TLV maksimal 99 karakter (panjang 2 digit) — konstanta EMVCo. */
function tlv(id: string, value: string): string {
  const v = value.trim();
  if (v.length > 99) throw new Error(`qris: nilai tag ${id} melebihi 99 karakter`);
  return id + String(v.length).padStart(2, '0') + v;
}

/**
 * CRC16-CCITT (CCITT-FALSE) atas string ASCII → hex 4 digit uppercase.
 * Check value publik: crc16Ccitt('123456789') === '29B1'.
 */
export function crc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc ^ (data.charCodeAt(i) & 0xff) << 8) & 0xffff;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Parse payload TLV → record {id: nilai}. Berhenti aman bila payload
 * tidak valid (untuk verifikasi/test round-trip, bukan untuk input
 * tak-terpercaya).
 */
export function parseQrisTlv(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 4 <= payload.length; ) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || len < 0) break;
    const val = payload.slice(i + 4, i + 4 + len);
    if (val.length < len) break;
    out[id] = val;
    i += 4 + len;
  }
  return out;
}

/**
 * Bangun payload QRIS (statis bila tanpa `amount`, dinamis bila ada).
 * Deterministik & murni. Melempar Error bila nmid/merchantName kosong
 * (UI menampilkan state "QRIS OFFLINE" dari kekosongan itu).
 */
export function buildQris(cfg: QrisConfig): string {
  const nmid = String(cfg.nmid || '').trim();
  const name = String(cfg.merchantName || '').trim();
  if (!nmid) throw new Error('qris: nmid wajib diisi');
  if (!name) throw new Error('qris: merchantName wajib diisi');
  if (cfg.amount !== undefined && !Number.isInteger(cfg.amount)) {
    throw new Error('qris: amount harus integer rupiah');
  }
  const dynamic = cfg.amount !== undefined && cfg.amount > 0;

  let body =
    tlv('00', dynamic ? '0112' : '0111') +
    tlv('01', dynamic ? '12' : '11') +
    tlv('29', 'ID') +
    tlv('30', nmid);
  if ((cfg.nmid2 || '').trim()) body += tlv('31', String(cfg.nmid2).trim());
  if ((cfg.mcc || '').trim()) body += tlv('52', String(cfg.mcc).trim());
  body += tlv('53', '360');
  if (dynamic) body += tlv('54', String(cfg.amount));
  body += tlv('58', 'ID') + tlv('59', name);
  if ((cfg.city || '').trim()) body += tlv('60', String(cfg.city).trim());
  body += tlv('62', '1');
  return body + tlv('63', crc16Ccitt(body));
}

/** Payload QRIS statis tanpa nominal (pembeli mengisi di e-wallet). */
export function buildQrisStatic(
  cfg: Omit<QrisConfig, 'amount'>
): string {
  return buildQris(cfg);
}

/** Payload QRIS dinamis: nominal terikat (tag 54). */
export function buildQrisDynamic(
  cfg: QrisConfig & { amount: number }
): string {
  return buildQris(cfg);
}