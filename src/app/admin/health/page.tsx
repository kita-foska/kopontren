import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { currentUser } from '@/lib/auth';
import { db, SCHEMA_VERSION } from '@/db';
import { cacheStats } from '@/lib/ref-cache';
import {
  buildHealthCards,
  healthSummary,
  type HealthCard,
  type HealthTone,
} from '@/lib/health';
import { fmtDateTime } from '@/lib/format';
import { Shell } from '@/components/shell';
import { Badge, Button } from '@/components/ui';
import { KpiGrid, type KpiCardDef } from '@/components/kpi-card';
import {
  Archive,
  Bell,
  Database,
  Layers,
  ScrollText,
  Tag,
  Wifi,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * P13 Health Center (admin-only, guard = role === 'admin', pola
 * /admin/data): 7 kartu status sistem -- DB, Koneksi, Versi, Cache,
 * Log, Backup terakhir, Notifikasi (definisi P13, TODO L1298).
 * Server component: query DB langsung (pola dashboard); tanpa client
 * component; "Muat Ulang" = link ke halaman ini (tanpa polling).
 * Logika status = modul pure src/lib/health.ts (suite 33).
 */

/** Ikon per kartu (lucide = inline SVG; gaya identik dashboard admin). */
const CARD_ICONS: Record<HealthCard['key'], ReactNode> = {
  db: <Database className="h-5 w-5 text-success-600 dark:text-success-400" />,
  koneksi: <Wifi className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
  versi: <Tag className="h-5 w-5 text-slate-500 dark:text-slate-400" />,
  cache: <Layers className="h-5 w-5 text-slate-500 dark:text-slate-400" />,
  log: <ScrollText className="h-5 w-5 text-slate-500 dark:text-slate-400" />,
  backup: <Archive className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
  notifikasi: <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
};

const SUMMARY_TONE: Record<HealthTone, 'green' | 'amber' | 'red'> = {
  good: 'green',
  warn: 'amber',
  bad: 'red',
};

export default async function AdminHealthPage() {
  const user = await currentUser();
  if (!user || user.role !== 'admin') redirect(user ? '/' : '/login');

  const nowIso = new Date().toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  // -- DB + skema: satu round-trip = ukur latensi sekaligus versi. --
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
      .prepare(
        `SELECT COUNT(*) c, MAX(created_at) m FROM audit_log WHERE created_at >= ?`
      )
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
    // (itulah gunanya halaman ini -- jangan 500, laporkan).
  }

  // -- Stempel build: marker SW-BUILD di public/sw.js (frozen; hanya dibaca).
  let buildStamp = '';
  try {
    const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
    const m = sw.match(/^\/\/ SW-BUILD:(\S+)/m);
    if (m) buildStamp = m[1];
  } catch {
    // dev tanpa build: kartu menampilkan "stempel tidak tersedia".
  }

  const cards = buildHealthCards({
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
  });
  const summary = healthSummary(cards);
  const kpiCards: KpiCardDef[] = cards.map((c) => ({
    label: c.label,
    value: c.value,
    sub: c.sub,
    tip: c.tip,
    warn: c.warn,
    href: c.href,
    icon: CARD_ICONS[c.key],
  }));

  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Kesehatan <span className="text-amber-700 dark:text-amber-400">Sistem</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Status database, koneksi, versi, cache, log, backup terakhir, dan
        notifikasi. Klik kartu untuk melihat sumber datanya.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SUMMARY_TONE[summary.tone]}>{summary.label}</Badge>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Diperiksa {fmtDateTime(nowIso)}
          </span>
        </div>
        <Button variant="ghost" size="sm" as="a" href="/admin/health">
          Muat Ulang
        </Button>
      </div>

      <KpiGrid cards={kpiCards} />
    </Shell>
  );
}
