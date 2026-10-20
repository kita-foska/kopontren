/**
 * W8 ITEM 4 (CUSTOMER DISPLAY, 20 Okt 2026): kiosk pelanggan publik
 * (/display) -- polling 3 dtk menayangkan transaksi terakhir + QR QRIS
 * (15 dtk auto-reset ke layar idle). Modul MURNI & hermetis: tanpa DB,
 * tanpa DOM -- route mengambil baris sales, modul ini hanya
 * (de)project payload PII-free utk layaran publik. String ASCII.
 * Teruji: scripts/test-display-latest.ts (suite 40).
 *
 * Keamanan (ruling W8 Item 4 Opasi B, ACC 20 Okt): payload "PUBLIK" --
 * TANPA nama pelanggan/member, TANPA rincian baris, TANPA kembalian:
 * hanya id transaksi, total, jumlah baris, label metode, jam WIB, dan
 * QR QRIS dinamis. buildDisplayPayload melakukan PROYEKSI eksplisit
 * (memilih field per-field), jadi field PII di baris sales tak mungkin
 * lolos ke layar publik.
 */
import { wibTimeSec } from './confidence.ts';
import { payMethodLabel, parsePaySplit } from './pay-methods.ts';
import { buildQris, type QrisConfig } from './qris.ts';

/** Baris transaksi terakhir (field yang dibutuhkan kiosk; item_count
 *  dihitung subquery di route). */
export interface DisplaySaleRow {
  id: number;
  total: number;
  pay_method: string;
  pay_split?: string | null;
  created_at: string;
  item_count: number;
}

/**
 * Label metode pembayaran untuk layar (satu sumber PAY_METHOD_LABEL):
 * baris mixed (pay_split) diperluas per bagian + dedup label; baris
 * legacy memakai pay_method. Alias legacy (qris/transfer/split)
 * dinormalisasi labelnya.
 */
export function displayPayMethods(payMethod: string, paySplit: string | null | undefined): string[] {
  const parts = parsePaySplit(paySplit);
  const keys = parts.length > 0 ? parts.map((p) => p.m) : [payMethod];
  const out: string[] = [];
  for (const k of keys) {
    const lb = payMethodLabel(k);
    if (!out.includes(lb)) out.push(lb);
  }
  return out;
}

/**
 * QR QRIS dinamis utk layar (hanya bila pembayaran mengandung wa/QRIS
 * DAN NMID + nama merchant terkonfigurasi admin; lainya = null, layaran
 * tetap menampilkan total tanpa QR -- jujur, bukan QR rusak).
 */
export function displayQrisPayload(
  row: DisplaySaleRow,
  qris: { nmid?: string | null; nmid2?: string | null; mcc?: string | null; city?: string | null; merchantName?: string | null }
): string | null {
  const usesQris =
    row.pay_method === 'wa' || displayPayMethods(row.pay_method, row.pay_split).includes(payMethodLabel('wa'));
  if (!usesQris) return null;
  const nmid = String(qris.nmid ?? '').trim();
  const merchantName = String(qris.merchantName ?? '').trim();
  if (!nmid || !merchantName) return null;
  try {
    const cfg: QrisConfig = {
      nmid,
      merchantName,
      nmid2: qris.nmid2 ? String(qris.nmid2).trim() : undefined,
      mcc: qris.mcc ? String(qris.mcc).trim() : undefined,
      city: qris.city ? String(qris.city).trim() : undefined,
      amount: Math.max(0, Math.floor(Number(row.total) || 0)),
    };
    return buildQris(cfg);
  } catch {
    return null;
  }
}

/** Bentuk payload publik /api/display/latest (last: null = belom ada
 *  transaksi / kiosk menampilkan layar idle). */
export interface DisplayPayload {
  last: null | {
    id: number;
    total: number;
    item_count: number;
    methods: string[];
    time_wib: string | null;
    qris: string | null;
  };
}

/**
 * Bangun payload publik dari baris terakhir + konfigurasi QRIS
 * (getSettings di route): proyeksi eksplisit per-field -- field PII
 * (customer, member_id, kasir, dll.) TIDAK pernah disalin ke sini.
 */
export function buildDisplayPayload(
  row: DisplaySaleRow | null | undefined,
  qris?: { nmid?: string | null; nmid2?: string | null; mcc?: string | null; city?: string | null; merchantName?: string | null }
): DisplayPayload {
  if (!row || !Number.isFinite(row.id) || row.id <= 0) return { last: null };
  const total = Math.max(0, Math.floor(Number(row.total) || 0));
  return {
    last: {
      id: row.id,
      total,
      item_count: Math.max(0, Math.floor(Number(row.item_count) || 0)),
      methods: displayPayMethods(row.pay_method, row.pay_split),
      time_wib: wibTimeSec(row.created_at),
      qris: displayQrisPayload(row, qris ?? {}),
    },
  };
}
