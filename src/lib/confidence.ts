/**
 * P15-A CONFIDENCE LANGUAGE (2026-10-13): satu sumber label UI utk
 * freshness, kelengkapan, sinkronisasi, dan klaim data. Hermetis &
 * pure -- tanpa dependensi server (@/db, next/headers), pola health.ts
 * (teruji: scripts/test-confidence.ts, suite 34). String ASCII.
 *
 * Empat keluarga label (keputusan DESIDE P15-A):
 *  1. FRESHNESS  : "Terakhir diperbarui {ageLabel}"
 *                   (Terakhir diperbarui hari ini / 1 hari lalu / N hari lalu)
 *  2. KELENGKAPAN: "Data lengkap" / "Belum ada data"
 *  3. SINKRON    : "Menunggu sinkronisasi" / "Tersinkron"
 *                   / "{n} menunggu sinkronisasi"
 *  4. KLAIM DATA : "Data per {HH:MM} WIB"
 *
 * aturan tambahan: kata "berhasil" DILARANG di toast sukses -- pakai
 * kata kerja hasil ("disimpan", "diperbarui", "tersinkron", "disalin").
 *
 * ageDays/ageLabel dipindah dari health.ts (health.ts kini mendelegasikan
 * agar label umur seluruh aplikasi satu sumber).
 */

const MS_PER_DAY = 86_400_000;

/** Umur (hari) utk waktu ISO; null bila kosong/tak valid; masa depan = 0. */
export function ageDays(iso: string | null, nowIso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.parse(nowIso) - t) / MS_PER_DAY));
}

/** Label umur komunikatif: "Hari ini" / "N hari lalu". */
export function ageLabel(days: number | null): string {
  if (days === null) return 'Belum ada catatan';
  if (days === 0) return 'Hari ini';
  if (days === 1) return '1 hari lalu';
  return days + ' hari lalu';
}

/** Keluarga 1 -- freshness: "Terakhir diperbarui {umur}". */
export function freshnessStamp(iso: string | null, nowIso: string): string {
  return 'Terakhir diperbarui ' + ageLabel(ageDays(iso, nowIso));
}

/** Keluarga 2 -- kelengkapan: "Data lengkap". */
export const COMPLETE_LABEL = 'Data lengkap';

/** Keluarga 2 -- kosong: "Belum ada {what}" (default: data). */
export function emptyLabel(what: string = 'data'): string {
  return 'Belum ada ' + what;
}

/**
 * Keluarga 3 -- sinkronisasi: 0 = "Tersinkron"; 1 = "Menunggu
 * sinkronisasi"; n > 1 = "{n} menunggu sinkronisasi".
 */
export function syncLabel(pending: number): string {
  if (pending <= 0) return 'Tersinkron';
  if (pending === 1) return 'Menunggu sinkronisasi';
  return pending + ' menunggu sinkronisasi';
}

/** Waktu HH:MM zona WIB (Asia/Jakarta) dari ISO; null bila tak valid. */
export function wibTime(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  });
}

/** Waktu HH:MM:SS zona WIB (Asia/Jakarta) dari ISO; null bila tak valid. */
export function wibTimeSec(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  });
}

/** Keluarga 4 -- klaim data: "Data per {HH:MM} WIB" (tanpa waktu: "Belum ada data"). */
export function dataPerLabel(time: string | null): string {
  return time ? 'Data per ' + time + ' WIB' : 'Belum ada data';
}
