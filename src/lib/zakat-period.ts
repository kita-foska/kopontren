// ── Periode zakat WIB (UTC+7) — helper murni (client-safe) ─────────────────
// created_at DB disimpan ISO-UTC ('...Z'); tanggal kalender zakat
// (last_zakat_date, haul_start_date) adalah tanggal WIB. Perbandingan
// tanggal WIB terhadap created_at ISO-UTC harus dikonversi dulu:
// 00:00 WIB hari D = 17:00 UTC hari D-1. Tanpa konversi, boundary
// bergeser +7 jam (periode mulai 07:00 WIB, bukan 00:00 WIB).

const WIB_OFFSET_MS = 7 * 3600 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Tanggal WIB 'YYYY-MM-DD' -> timestamp ISO-UTC 00:00 WIB-nya
 * ('YYYY-MM-DD-1T17:00:00.000Z'). Dipakai utk `created_at >= ?`.
 * Format tak dikenal dikembalikan apa adanya (tidak meledak). */
export function wibDayStartUtc(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - WIB_OFFSET_MS;
  return new Date(t).toISOString();
}

/** Tanggal 'YYYY-MM-DD' AWAL BULAN WIB berjalan (untuk fallback periode). */
export function currentWibMonthDate(now: number = Date.now()): string {
  const w = new Date(now + WIB_OFFSET_MS);
  return `${w.getUTCFullYear()}-${pad2(w.getUTCMonth() + 1)}-01`;
}

/** Hari ini dalam WIB 'YYYY-MM-DD' (untuk nama file / last_zakat_date). */
export function wibToday(now: number = Date.now()): string {
  return new Date(now + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Timestamp DB (ISO-UTC '...Z' atau legacy 'YYYY-MM-DD HH:MM:SS' UTC)
 * -> string WIB 'YYYY-MM-DD HH:MM:SS' untuk export. Kosong/rusak
 * dikembalikan apa adanya. */
export function isoToWib(v: unknown): string {
  const s = String(v ?? '');
  if (!s) return '';
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : s;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return s;
  return new Date(t + WIB_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19);
}