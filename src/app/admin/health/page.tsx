import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { currentUser } from '@/lib/auth';
import {
  buildHealthCards,
  healthSummary,
  type HealthCard,
  type HealthTone,
} from '@/lib/health';
import { collectHealthInput } from '@/lib/health-collector';
import { fmtDateTime } from '@/lib/format';
import { Shell } from '@/components/shell';
import { Badge, Button } from '@/components/ui';
import { KpiGrid, type KpiCardDef } from '@/components/kpi-card';
import { ModuleStatusPanel } from './module-status-client';
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
 * Logika status = modul pure src/lib/health.ts (suite 33/44);
 * pengumpulan input = kolektor shared W14-3 (src/lib/health-collector.ts,
 * dipakai juga dashboard pengurus -- jantung yang sama, UX-4).
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

  // -- W14-3: kolektor shared -- query DB + stempel build + ref-cache
  //    kini satu fungsi (src/lib/health-collector.ts), dipakai bersama
  //    dashboard pengurus. DB tak terjangkau = input degraded, bukan 500.
  const input = await collectHealthInput(nowIso);
  const cacheKeys = input.cacheKeys;
  const cards = buildHealthCards(input);
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

      {/* P14 (Offline Confidence): panel status data per modul (client;
          baca localStorage sisi klien + ref-cache per-instance). */}
      <ModuleStatusPanel cacheKeys={cacheKeys} nowIso={nowIso} />
    </Shell>
  );
}
