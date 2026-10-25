/**
 * W13 BATCH 2 -- SKOP PENERIMA NOTIFIKASI (modul PURE, zero dependensi).
 *
 * Keputusan W13: notifikasi (in-app + push) kini DITERIMA oleh semua
 * role internal yang terkait operasional: admin, manajer, pengurus,
 * kasir. Member / gudang / pembelian = TIDAK menerima (audit: gudang &
 * pembelian punya fokus kerja sendiri; kasir perlu tau stok habis /
 * laporan harian; pengurus = viewer read-only sejak Q3).
 *
 * Modul ini sengaja murni (tanpa import `@/` alias / DB) agar bisa
 * diuji langsung oleh Node (type-stripping) via scripts/test-notify.ts.
 */

/** Role yang menerima notifikasi (urutan = prioritas display). */
export const NOTIFY_ROLES = ['admin', 'manajer', 'pengurus', 'kasir'] as const;

export type NotifyRole = (typeof NOTIFY_ROLES)[number];

const NOTIFY_ROLE_SET: ReadonlySet<string> = new Set<string>(NOTIFY_ROLES);

/** Apakah role ini boleh MENERIMA notifikasi (in-app + push)? */
export function canReceiveNotif(role: unknown): boolean {
  return NOTIFY_ROLE_SET.has(String(role ?? ''));
}

/** SQL penerima notifikasi (untuk getNotifyRecipientIds di lib/notify.ts). */
export function notifyRecipientsSql(): string {
  const inList = NOTIFY_ROLES.map((r) => `'${r}'`).join(', ');
  return `SELECT id FROM users WHERE role IN (${inList}) AND active = 1`;
}