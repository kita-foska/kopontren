/**
 * P13 HEALTH CENTER (2026-10-13): modul pure utk kartu status sistem
 * (/admin/health; UX-8 Operational Safety). Hermetis: TIDAK ada
 * dependensi server (@/db, next/headers) -- pola coop.ts -> low-stock.ts.
 * Halaman menukar query DB lalu menyorakan hasilnya ke buildHealthCards()
 * (teruji: scripts/test-health.ts, suite 33).
 *
 * 7 kartu (definisi P13, TODO L1298): DB, Koneksi, Versi, Cache, Log,
 * Backup terakhir, Notifikasi. Bahasa = komunikatif (P15): angka selalu
 * punya penjelasan singkat + drill-down ke halaman sumber (P9).
 * Semua string ASCII (tanpa emoji/unicode).
 */

/** Tone kartu (dipetakan halaman ke token tailwind + Badge). */
export type HealthTone = 'good' | 'warn' | 'bad';

export type HealthCardKey =
  | 'db'
  | 'koneksi'
  | 'versi'
  | 'cache'
  | 'log'
  | 'backup'
  | 'notifikasi';

/** Data kartu (ikon dirender halaman; KpiCard menerima {...c, icon}). */
export type HealthCard = {
  key: HealthCardKey;
  label: string;
  value: string;
  sub: string;
  tone: HealthTone;
  /** true = kartu tampil perhatian (ring amber KpiCard). */
  warn: boolean;
  /** Drill-down sumber data (P9: angka punya source). */
  href: string;
  /** Penjelasan komunikatif (TermTip di kartu). */
  tip: string;
};

/** Ambang perhatian (D-P13). */
export const HEALTH_THRESHOLD = {
  dbWarnMs: 500, // Turso > 500 ms = lambat (perhatian)
  dbBadMs: 2000, // >= 2000 ms = gagal (koneksi patut diperiksa)
  backupWarnDays: 30, // backup > 30 hari = perhatian
} as const;

/** Input kasar dari halaman (hasil query); nowIso diinjeksi (hermetis). */
export type HealthInput = {
  dbOk: boolean;
  dbMs: number | null;
  schemaVersion: number | null;
  expectedSchema: number; // konstanta SCHEMA_VERSION (db.ts)
  buildStamp: string; // marker SW-BUILD ('' = tidak tersedia)
  cacheKeys: number; // jumlah key ref-cache (per-instance, TTL 60 dtk)
  audit24h: number;
  lastAuditAt: string | null;
  backupLast: string | null; // settings key backup_last
  backupLastBy: string | null; // settings key backup_last_by
  vapidConfigured: boolean;
  notifCount: number;
  nowIso: string;
};

// P15-A: umur/label umur kini satu sumber di confidence.ts (famili label
// FRESHNESS) -- health.ts mendelegasikan agar seluruh aplikasi seragam.
import { ageDays, ageLabel } from './confidence.ts';

export { ageDays, ageLabel };

/** Tanggal pendek ISO -> "YYYY-MM-DD" (tanpa format locale, hermetis). */
export function shortDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Bangun 7 kartu status dari input query. Urutan kartu tetap (DB,
 * Koneksi, Versi, Cache, Log, Backup, Notifikasi) agar susunan
 * dashboard konsisten (UX-4: jantung yang sama).
 */
export function buildHealthCards(input: HealthInput): HealthCard[] {
  const cards: HealthCard[] = [];

  // 1) DB -- satu round-trip = latensi + versi skema.
  let dbTone: HealthTone = 'good';
  let dbValue = 'OK';
  let dbSub = 'skema v' + (input.schemaVersion === null ? '?' : String(input.schemaVersion));
  if (input.dbMs !== null) dbSub += ' / ' + input.dbMs + ' ms';
  if (!input.dbOk) {
    dbTone = 'bad';
    dbValue = 'GAGAL';
    dbSub = 'Turso tidak terjangkau';
  } else if (input.dbMs !== null && input.dbMs >= HEALTH_THRESHOLD.dbBadMs) {
    dbTone = 'bad';
    dbValue = 'GAGAL';
    dbSub = 'respon ' + input.dbMs + ' ms (di atas ' + HEALTH_THRESHOLD.dbBadMs + ' ms)';
  } else if (input.dbMs !== null && input.dbMs >= HEALTH_THRESHOLD.dbWarnMs) {
    dbTone = 'warn';
    dbValue = 'LAMBAT';
    dbSub = 'respon ' + input.dbMs + ' ms (batas perhatian ' + HEALTH_THRESHOLD.dbWarnMs + ' ms)';
  } else if (input.schemaVersion !== null && input.schemaVersion !== input.expectedSchema) {
    dbTone = 'warn';
    dbSub = 'skema v' + input.schemaVersion + ' (dulu v' + input.expectedSchema + ')';
  }
  cards.push({
    key: 'db',
    label: 'Database',
    value: dbValue,
    sub: dbSub,
    tone: dbTone,
    warn: dbTone !== 'good',
    href: '/admin/data',
    tip: 'Status koneksi ke Turso: versi skema aktif + waktu respons query. Batas perhatian 500 ms; 2000 ms ke atas dianggap gagal.',
  });

  // 2) Koneksi -- online bila DB terjangkau.
  const online = input.dbOk;
  cards.push({
    key: 'koneksi',
    label: 'Koneksi',
    value: online ? 'ONLINE' : 'OFFLINE',
    sub: online
      ? input.buildStamp
        ? 'build ' + input.buildStamp
        : 'build (stempel tidak tersedia)'
      : 'periksa jaringan / deploy',
    tone: online ? 'good' : 'bad',
    warn: !online,
    href: '/admin/audit',
    tip: 'Aplikasi bisa menjangkau database atau tidak. Baris bawah = stempel build (SW-BUILD di sw.js) supaya jelas versi yang terpasang.',
  });

  // 3) Versi -- skema aktif vs konstanta aplikasi.
  const schemaOk =
    input.schemaVersion !== null && input.schemaVersion === input.expectedSchema;
  cards.push({
    key: 'versi',
    label: 'Versi',
    value: 'v' + (input.schemaVersion === null ? '?' : String(input.schemaVersion)),
    sub:
      'skema aplikasi v' +
      input.expectedSchema +
      (input.buildStamp ? ' / build ' + input.buildStamp : ''),
    tone: schemaOk ? 'good' : 'warn',
    warn: !schemaOk,
    href: '/admin/migrate',
    tip: 'Versi skema database yang aktif vs versi yang diminta aplikasi. Beda = migration belum jalan (biasanya pulih otomatis saat cold start).',
  });

  // 4) Cache -- ref-cache in-memory per-instance (TTL 60 dtk).
  cards.push({
    key: 'cache',
    label: 'Cache',
    value: String(input.cacheKeys),
    sub: 'referensi ter-cache (TTL 60 dtk, per-instance)',
    tone: 'good',
    warn: false,
    href: '/admin/data',
    tip: 'Jumlah data referensi yang disimpan di memori instance ini (60 detik). Normal 0-256; berkurang sendiri setelah mutasi (invalidate).',
  });

  // 5) Log -- audit 24 jam terakhir.
  cards.push({
    key: 'log',
    label: 'Log',
    value: String(input.audit24h),
    sub: input.lastAuditAt
      ? 'per 24 jam / terakhir ' + shortDate(input.lastAuditAt)
      : 'per 24 jam / belum ada aktivitas',
    tone: 'good',
    warn: false,
    href: '/admin/audit',
    tip: 'Jumlah kejadian audit 24 jam terakhir (siapa mengubah apa). Nol = sunyi; detail lengkap di halaman Audit.',
  });

  // 6) Backup terakhir -- catatan settings (tanpa perubahan skema).
  const backupAge = ageDays(input.backupLast, input.nowIso);
  let backupTone: HealthTone = 'good';
  let backupValue = shortDate(input.backupLast);
  let backupWarn = false;
  if (input.backupLast === null) {
    backupTone = 'warn';
    backupValue = 'BELUM';
    backupWarn = true;
  } else if (backupAge !== null && backupAge > HEALTH_THRESHOLD.backupWarnDays) {
    backupTone = 'warn';
    backupWarn = true;
  }
  cards.push({
    key: 'backup',
    label: 'Backup',
    value: backupValue,
    sub:
      input.backupLast === null
        ? 'belum ada catatan export backup'
        : ageLabel(backupAge) + (input.backupLastBy ? ' oleh ' + input.backupLastBy : ''),
    tone: backupTone,
    warn: backupWarn,
    href: '/admin/data',
    tip: 'Kapan data terakhir di-backup (ekspor JSON via Data & Backup) dan siapa pelakunya. Lebih dari 30 hari = perhatian.',
  });

  // 7) Notifikasi -- VAPID push + jumlah notifikasi.
  cards.push({
    key: 'notifikasi',
    label: 'Notifikasi',
    value: input.vapidConfigured ? 'PUSH ON' : 'PUSH OFF',
    sub: input.notifCount + ' notifikasi tersimpan',
    tone: input.vapidConfigured ? 'good' : 'warn',
    warn: !input.vapidConfigured,
    href: '/admin/notifications',
    tip: 'Kunci VAPID (push browser) sudah diset atau belum. Notifikasi in-app tetap jalan walau push OFF.',
  });

  return cards;
}

/** Ringkasan atas (StatusBadge): sedaya sehat / n perhatian / bermasalah. */
export function healthSummary(cards: HealthCard[]): {
  ok: boolean;
  tone: HealthTone;
  label: string;
} {
  let bad = 0;
  let warn = 0;
  for (const c of cards) {
    if (c.tone === 'bad') bad++;
    else if (c.tone === 'warn') warn++;
  }
  if (bad > 0)
    return {
      ok: false,
      tone: 'bad',
      label: bad + ' perkara gagal -- periksa kartu',
    };
  if (warn > 0)
    return {
      ok: false,
      tone: 'warn',
      label: warn + ' perkara butuh perhatian',
    };
  return { ok: true, tone: 'good', label: 'Sedaya sehat' };
}

/**
 * W14-3 HEALTH METER (dashboard pengurus, 26 Okt 2026): skor agregat
 * 0-100 dari 7 kartu + 3 baris rasio + ambang zona. SATU sumber data
 * dgn /admin/health (buildHealthCards) -- jantung yang sama, dua tampilan.
 * Tetap hermetis: tanpa dependensi server.
 */

/** Ambang zona (ruling W14-3): >= 90 hijau, >= 40 amber, < 40 merah. */
export const HEALTH_SCORE = { good: 90, ok: 40 } as const;

export type MeterTone = 'green' | 'amber' | 'red';

/**
 * Skor agregat: 100 - 30 per kartu `bad` - 10 per kartu `warn`
 * (bawah 0, atas 100). Kartu `good` tak mengurangi apa pun.
 * 7 kartu semua good = 100; DB gagal (db+koneksi bad + versi warn) = 30.
 */
export function healthScore(cards: HealthCard[]): number {
  let s = 100;
  for (const c of cards) {
    if (c.tone === 'bad') s -= 30;
    else if (c.tone === 'warn') s -= 10;
  }
  return Math.max(0, Math.min(100, s));
}

/** Zona warna jarum/lingkaran: >= 90 green, >= 40 amber, < 40 red. */
export function healthScoreTone(score: number): MeterTone {
  if (score >= HEALTH_SCORE.good) return 'green';
  if (score >= HEALTH_SCORE.ok) return 'amber';
  return 'red';
}

/** Baris rasio speedometer (DB / Backup / Push) -- proyeksi 3 kartu dari 7. */
export interface HealthMeterRow {
  key: 'db' | 'backup' | 'notifikasi';
  label: string;
  value: string;
  sub: string;
  tone: HealthTone;
  warn: boolean;
}

/** Ambil baris db/backup/notifikasi (urutan tetap) dari kartu kesehatan. */
export function healthMeterRows(cards: HealthCard[]): HealthMeterRow[] {
  const byKey = new Map(cards.map((c) => [c.key, c] as const));
  const want: Array<[HealthMeterRow['key'], string]> = [
    ['db', 'Database'],
    ['backup', 'Backup'],
    ['notifikasi', 'Push'],
  ];
  const out: HealthMeterRow[] = [];
  for (const [key, label] of want) {
    const c = byKey.get(key);
    if (!c) continue;
    out.push({ key, label, value: c.value, sub: c.sub, tone: c.tone, warn: c.warn });
  }
  return out;
}
