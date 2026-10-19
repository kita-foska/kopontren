/**
 * W8-1 (Q72) -- Deteksi anomali dari audit_log (pure, hermetis).
 *
 * Modul TIDAK import db/next (hanya logic + type) -- pola sama dgn
 * lib/health.ts / lib/low-stock.ts -- supaya bisa diuji Node
 * (type-stripping) lewat scripts/test-audit-anomaly.ts.
 *
 * 3 aturan (threshold konstan, configurable lewat AnomalyOpts):
 *   A1 BULK_DELETE -- N action delete pada 1 tabel dalam jendela 60 mnt
 *   A2 PRICE_JUMP  -- product:update dgn base_price berubah >= 50%
 *   A3 AFTER_HOURS -- baris audit_log di luar jam operasional WIB
 *
 * Semua flag = READ-ONLY (laporan + notifikasi). Tanpa remediasi.
 * 0 schema change: konsumsi kolom audit_log yang sudah ada.
 */

/** Baris audit_log yang relevan utk deteksi (subset kolom). */
export type AuditLogRow = {
  id: number;
  action: string;
  table_name: string;
  record_id: number | null;
  old_value: string | null;
  new_value: string | null;
  user_name: string;
  created_at: string;
};

/** Opsi deteksi (threshold overridable utk test / konfigurasi). */
export type AnomalyOpts = {
  /** A1: jumlah delete per-jendela yg memicu flag (default 3). */
  bulkDeleteThreshold?: number;
  /** A1: jendela deteksi dalam menit (default 60). */
  bulkDeleteWindowMin?: number;
  /** A2: persentase perubahan harga yg memicu flag (default 50). */
  priceJumpPercent?: number;
  /** A3: jam operasional WIB (default 06:00-20:00; flag di luar). */
  afterHoursStart?: number;
  afterHoursEnd?: number;
};

/** Satu hasil deteksi. */
export type AnomalyFlag = {
  /** ID aturan stabil. */
  rule: 'bulk_delete' | 'price_jump' | 'after_hours';
  /** Label manusia (untuk UI). */
  label: string;
  /** Detail komunikatif (angka selalu punya penjelasan). */
  detail: string;
  /** Tabel terkait (A1/A2); kosong utk A3. */
  table?: string;
  /** Jumlah baris yang memicu flag. */
  count: number;
  /** Sample IDs (max 5) untuk drill-down. */
  sample_ids?: number[];
  /** Waktu referensi flag (ISO). */
  created_at: string;
  /** warn = perlu perhatian, info = sekadar dicatat. */
  severity: 'warn' | 'info';
};

/** Konstan threshold default (satu tempat config). */
export const ANOMALY_DEFAULTS = {
  bulkDeleteThreshold: 3,
  bulkDeleteWindowMin: 60,
  priceJumpPercent: 50,
  afterHoursStart: 6, // 06:00 WIB
  afterHoursEnd: 20, // 20:00 WIB
} as const;

/** Aksi "hapus" yang dikenal aplikasi (audit_log.action). */
export const DELETE_ACTIONS = new Set([
  'product:delete',
  'products:bulk-delete',
  'member:delete',
  'sales:delete',
  'kas:delete_requested',
]);

/** Jam WIB (UTC+7) dari ISO UTC. */
export function wibHour(isoUtc: string): number {
  return (new Date(isoUtc).getUTCHours() + 7) % 24;
}


/**
 * Detect anomalies in a batch of audit_log rows (paling baru dulu).
 * Pure: input + opsi saja; tanpa db/next. O(n log n) utk A1 (sort per
 * tabel), O(n) utk A2/A3.
 */
export function detectAnomalies(
  logs: AuditLogRow[],
  opts: AnomalyOpts = {}
): AnomalyFlag[] {
  if (!logs || logs.length === 0) return [];
  const c = {
    bulkDeleteThreshold: opts.bulkDeleteThreshold ?? ANOMALY_DEFAULTS.bulkDeleteThreshold,
    bulkDeleteWindowMin: opts.bulkDeleteWindowMin ?? ANOMALY_DEFAULTS.bulkDeleteWindowMin,
    priceJumpPercent: opts.priceJumpPercent ?? ANOMALY_DEFAULTS.priceJumpPercent,
    afterHoursStart: opts.afterHoursStart ?? ANOMALY_DEFAULTS.afterHoursStart,
    afterHoursEnd: opts.afterHoursEnd ?? ANOMALY_DEFAULTS.afterHoursEnd,
  };
  const flags: AnomalyFlag[] = [];

  // -- A1: BULK_DELETE --
  // Kelompok delete per tabel; jendela geser 60 mnt.
  const byTable = new Map<string, AuditLogRow[]>();
  for (const row of logs) {
    if (!DELETE_ACTIONS.has(row.action)) continue;
    const list = byTable.get(row.table_name) || [];
    list.push(row);
    byTable.set(row.table_name, list);
  }
  for (const [table, rows] of byTable) {
    rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const windowMs = c.bulkDeleteWindowMin * 60_000;
    let maxCount = 0;
    let start = 0;
    for (let i = 0; i < rows.length; i++) {
      const t = Date.parse(rows[i].created_at);
      while (t - Date.parse(rows[start].created_at) > windowMs) start++;
      const cnt = i - start + 1;
      if (cnt > maxCount) maxCount = cnt;
    }
    if (maxCount >= c.bulkDeleteThreshold) {
      const latest = rows[rows.length - 1];
      flags.push({
        rule: 'bulk_delete',
        label: 'Hapus Massal',
        detail:
          maxCount + ' hapus di tabel "' + table + '" dalam ' +
          c.bulkDeleteWindowMin + ' menit',
        table,
        count: maxCount,
        sample_ids: rows
          .slice(-5)
          .map((r) => r.record_id)
          .filter((x): x is number => x !== null),
        created_at: latest.created_at,
        severity: 'warn',
      });
    }
  }

  // -- A2: PRICE_JUMP --
  // A2: product:update, base_price berubah >= 50%. old_value/new_value =
  // fieldChanges flat { base_price: <skala> } (pola lib/audit.ts).
  for (const row of logs) {
    if (row.action !== 'product:update' || !row.old_value || !row.new_value) continue;
    let old: Record<string, unknown> | null;
    let nv: Record<string, unknown> | null;
    try {
      old = JSON.parse(row.old_value) as Record<string, unknown>;
      nv = JSON.parse(row.new_value) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!old || !nv) continue;
    const before = old.base_price;
    const after = nv.base_price;
    if (before === undefined || after === undefined) continue;
    const b = Number(before);
    const a = Number(after);
    if (!Number.isFinite(b) || !Number.isFinite(a) || b === 0) continue;
    const pct = (Math.abs(a - b) / Math.abs(b)) * 100;
    if (pct >= c.priceJumpPercent) {
      flags.push({
        rule: 'price_jump',
        label: 'Loncat Harga',
        detail:
          'Produk #' +
          (row.record_id ?? '?') +
          ' harga berubah dari ' +
          b +
          ' ke ' +
          a +
          ' (' +
          Math.round(pct) +
          '%)',
        table: row.table_name,
        count: 1,
        sample_ids: row.record_id !== null ? [row.record_id] : [],
        created_at: row.created_at,
        severity: 'warn',
      });
    }
  }

  // -- A3: AFTER_HOURS --
  // Baris di luar jam operasional WIB (created_at UTC -> +7).
  const outside = (h: number) => h >= c.afterHoursEnd || h < c.afterHoursStart;
  let afterCount = 0;
  const samples: number[] = [];
  for (const row of logs) {
    if (!outside(wibHour(row.created_at))) continue;
    afterCount++;
    if (row.record_id !== null && samples.length < 5) samples.push(row.record_id);
  }
  if (afterCount > 0) {
    flags.push({
      rule: 'after_hours',
      label: 'Di Luar Jam',
      detail:
        afterCount +
        ' aktivitas di luar jam operasional (' +
        String(c.afterHoursStart).padStart(2, '0') +
        ':00-' +
        String(c.afterHoursEnd).padStart(2, '0') +
        ':00 WIB)',
      count: afterCount,
      sample_ids: samples.length > 0 ? samples : undefined,
      created_at: logs[logs.length - 1].created_at,
      severity: 'info',
    });
  }

  return flags;
}

