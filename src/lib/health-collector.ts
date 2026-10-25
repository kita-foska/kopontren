/**
 * W14-3 HEALTH METER (26 Okt 2026): kolektor HealthInput SHARED antara
 * /admin/health dan /pengurus/dashboard -- SATU sumber kuisi, dua
 * tampilan (UX-4: jantung yang sama). Sebelum batch menika, /admin/health
 * mengumpulkan input secara in-line di page; kini logika pengumpulannya
 * pindah kemari agar dashboard pengurus memakai pengumpulan data yang sama persis.
 *
 *
 * Modul ini SERVER-only (db + ref-cache + baca sw.js); logika status
 * tetap hermetis di src/lib/health.ts (suite 44 test-health-meter).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, SCHEMA_VERSION } from '@/db';
import { cacheStats } from '@/lib/ref-cache';
import type { HealthInput } from '@/lib/health';

/**
 * Kumpulkan HealthInput mentah. DB tak terjangkau = input degraded
 * (dbOk=false, dbMs=null, dsb.) BUKAN throw -- meter laporkan
 * RED, halaman tak 500 (filsafat P13: "jangan 500, laporkan").
 */
export async function collectHealthInput(
  nowIso: string = new Date().toISOString()
): Promise<HealthInput> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  let dbOk = false;
  let dbMs: number | null = null;
  let schemaVersion: number | null = null;
  let audit24h = 0;
  let lastAuditAt: string | null = null;
  let backupLast: string | null = null;
  let backupLastBy: string | null = null;
  let vapidConfigured = false;
  let notifCount = 0;
  try {
    const d = await db();
    const t0 = Date.now();
    const svRow = (await d
      .prepare('SELECT version FROM schema_version LIMIT 1')
      .get()) as { version: number } | undefined;
    dbMs = Date.now() - t0;
    dbOk = true;
    schemaVersion = svRow ? Number(svRow.version) : null;
    const auditRow = (await d
      .prepare(`SELECT COUNT(*) c, MAX(created_at) m FROM audit_log WHERE created_at >= ?`)
      .get(dayAgo)) as { c: number; m: string | null };
    audit24h = Number(auditRow.c);
    lastAuditAt = auditRow.m;
    const bRow = (await d
      .prepare(`SELECT value FROM settings WHERE key = 'backup_last'`)
      .get()) as { value: string } | undefined;
    backupLast = bRow ? bRow.value : null;
    const byRow = (await d
      .prepare(`SELECT value FROM settings WHERE key = 'backup_last_by'`)
      .get()) as { value: string } | undefined;
    backupLastBy = byRow ? byRow.value : null;
    const vRow = (await d
      .prepare('SELECT public_key FROM vapid_keys WHERE id = 1')
      .get()) as { public_key: string } | undefined;
    vapidConfigured = Boolean(vRow && String(vRow.public_key).trim());
    const nRow = (await d.prepare('SELECT COUNT(*) c FROM notifications').get()) as {
      c: number;
    };
    notifCount = Number(nRow.c);
  } catch {
    // DB tak terjangkau: kartu tetap dirender dengan status GAGAL/OFFLINE
    // (itulah gunanya meter -- jangan 500, laporkan).
  }

  // Stempel build: marker SW-BUILD di public/sw.js (frozen; hanya dibaca).
  let buildStamp = '';
  try {
    const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
    const m = sw.match(/^\/\/ SW-BUILD:(\S+)/m);
    if (m) buildStamp = m[1];
  } catch {
    // dev tanpa build: kartu menampilkan "stempel tidak tersedia".
  }

  return {
    dbOk,
    dbMs,
    schemaVersion,
    expectedSchema: SCHEMA_VERSION,
    buildStamp,
    cacheKeys: cacheStats().keys,
    audit24h,
    lastAuditAt,
    backupLast,
    backupLastBy,
    vapidConfigured,
    notifCount,
    nowIso,
  };
}
