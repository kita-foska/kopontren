import { redirect } from 'next/navigation';
import Link from 'next/link';
import { canAccess, currentUser, isManager, roleHome } from '@/lib/auth';
import type { Feature } from '@/lib/features';
import { db } from '@/db';
import { kpiDelta, rp, startOfDayJakarta, type KpiDelta } from '@/lib/format';
import { Shell } from '@/components/shell';
import { PengurusDashboardClient } from '@/components/pengurus-dashboard-client';
import { ActivityFeed, type FeedItem, type KpiMover } from '@/components/activity-feed';
import { Button, TermTip } from '@/components/ui';
import {
  TrendingUp,
  Wallet,
  Users,
  AlertTriangle,
  Building2,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Dashboard pengurus (global): KPI multi-periode + grafik 7/30/365 hari
 * dengan deteksi anomali + export CSV/Excel/PDF + laporan via WhatsApp.
 * KPI dihitung di server; chart & export dieksekusi client via /api/reports.
 * I-3 UX-6: KPI 30h + delta konteks (vs 30h sebelumnya) + TermTip pakan;
 * kartu "Member Aktif" + baris member baru 30h.
 */
export default async function PengurusDashboardPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: laporan (admin, manajer, pengurus).
  // H2: guard-fail -> role-aware (member -> /member; role internal -> /).
  if (!canAccess(user, 'laporan')) redirect(roleHome(user.role));
  const d = await db();

  // KPI global 30 hari (server-side, tanpa fetch tambahan)
  const d30 = startOfDayJakarta(-29);
  const s30 = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales WHERE created_at >= ?`
      )
      .get(d30)) as { c: number; t: number }
  );
  const cash30 = (
    (await d
      .prepare(
        `SELECT
         (SELECT COALESCE(SUM(total),0) FROM sales WHERE created_at >= ?)
         + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='income' AND created_at >= ?) AS inn,
         (SELECT COALESCE(SUM(qty*unit_cost),0) FROM purchases WHERE created_at >= ?)
         + (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE created_at >= ?)
         + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='expense' AND created_at >= ?) AS out`
      )
      .get(d30, d30, d30, d30, d30)) as { inn: number; out: number }
  );
  const memberCount = ((await d.prepare(`SELECT COUNT(*) c FROM members`).get()) as {
    c: number;
  }).c;
  const lowStock = (
    (await d
      .prepare(`SELECT COUNT(*) c FROM products WHERE active = 1 AND stock < 10`)
      .get()) as { c: number }
  ).c;
  const storeCount = ((await d.prepare(`SELECT COUNT(*) c FROM stores`).get()) as {
    c: number;
  }).c;

  // I-3 UX-6: delta konteks -- 30h terakhir vs 30h sebelumnya (server-side),
  // + jumlah member baru periode ini sbg pakan kartu "Member Aktif".
  const d60 = startOfDayJakarta(-59);
  const sPrev30 = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales
         WHERE created_at >= ? AND created_at < ?`
      )
      .get(d60, d30)) as { c: number; t: number }
  );
  const cashPrev30 = (
    (await d
      .prepare(
        `SELECT
         (SELECT COALESCE(SUM(total),0) FROM sales WHERE created_at >= ? AND created_at < ?)
         + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='income' AND created_at >= ? AND created_at < ?) AS inn,
         (SELECT COALESCE(SUM(qty*unit_cost),0) FROM purchases WHERE created_at >= ? AND created_at < ?)
         + (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE created_at >= ? AND created_at < ?)
         + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='expense' AND created_at >= ? AND created_at < ?) AS out`
      )
      .get(d60, d30, d60, d30, d60, d30, d60, d30, d60, d30)) as { inn: number; out: number }
  );
  const newMembers = (
    (await d
      .prepare(`SELECT COUNT(*) c FROM members WHERE created_at >= ?`)
      .get(d30)) as { c: number }
  ).c;
  const deltaSales = kpiDelta(s30.t, sPrev30.t, 'vs 30 hari sebelumnya');
  const deltaCash = kpiDelta(
    cash30.inn - cash30.out,
    cashPrev30.inn - cashPrev30.out,
    'vs 30 hari sebelumnya'
  );
  const deltaMember: KpiDelta | null =
    newMembers > 0 ? { text: '+' + newMembers + ' baru, 30 hari ini', tone: 'up' } : null;

  // I-8 UX-6: feed "Apa yang berubah" -- 5 audit log terbaru (server-side,
  // philosophy I-3: tanpa fetch tambahan di klien). Pengurus punya tier
  // "audit" (read-only); user tanpa tier -> kartu tersembunyi.
  const feedOk = canAccess(user, 'audit');
  const feedLogs: FeedItem[] = feedOk
    ? ((await d
        .prepare(
          `SELECT id, username, user_name, user_role, action, record_id, created_at
           FROM audit_log ORDER BY id DESC LIMIT 5`
        )
        .all()) as FeedItem[])
    : [];

  // Pengurus = read-only (TIDAK operasional): KPI yang mengarah ke halaman
  // operasional (kas/member/produk) dinamis -> /admin/laporan, agar pengurus
  // tak jatuh ke dead-end (halaman tsb di-guard isManager/'member'/'stock').
  const readOnly = !isManager(user);
  const laporan = '/admin/laporan';
  type DashCard = {
    label: string;
    value: string;
    sub: string;
    href: string;
    icon: React.ReactNode;
    warn?: boolean;
    delta?: KpiDelta & { tip: string };
  };
  const TIP_SALES =
    'Perbandingan: total penjualan 30 hari terakhir vs 30 hari sebelumnya ' +
    '(WIB). "baru" = periode sebelumnya tidak ada penjualan; ' +
    '"stabil" = perubahan < 0,5%.';
  const TIP_CASH =
    'Arus kas = masuk (penjualan + kas masuk manual) - keluar ' +
    '(pembelian + pengeluaran + kas keluar manual), 30 hari terakhir ' +
    'vs 30 hari sebelumnya (WIB).';
  const TIP_MEMBER =
    'Kartu menampilkan total member terdaftar. Baris ini = jumlah ' +
    'member baru yang didaftarkan dalam 30 hari terakhir (WIB).';
  const cards: DashCard[] = [
    {
      label: 'Penjualan 30 Hari',
      value: rp(s30.t),
      sub: s30.c + ' transaksi',
      href: laporan,
      icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
      delta: deltaSales ? { ...deltaSales, tip: TIP_SALES } : undefined,
    },
    {
      label: 'Arus Kas 30 Hari',
      value: rp(cash30.inn - cash30.out),
      sub: 'masuk ' + rp(cash30.inn) + ' / keluar ' + rp(cash30.out),
      href: readOnly ? laporan : '/admin/kas',
      icon: <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
      delta: deltaCash ? { ...deltaCash, tip: TIP_CASH } : undefined,
    },
    {
      label: 'Member Aktif',
      value: String(memberCount),
      sub: 'loyalty & poin',
      href: readOnly ? laporan : '/admin/member',
      icon: <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />,
      delta: deltaMember ? { ...deltaMember, tip: TIP_MEMBER } : undefined,
    },
    {
      label: 'Stok Menipis',
      value: String(lowStock),
      sub: 'produk di bawah 10',
      href: '/admin/dashboard',
      icon: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
      warn: lowStock > 0,
    },
    {
      label: 'Cabang Terdaftar',
      value: String(storeCount),
      sub: 'data penjualan masih global',
      href: readOnly ? laporan : '/admin/produk',
      icon: <Building2 className="h-5 w-5 text-slate-600 dark:text-slate-400" />,
    },
  ];

  // UX-7D: baris quick actions -- mirror kartu "Aksi cepat" dashboard admin,
  // tiap CTA di-guard per tier (FEATURE_MATRIX, src/lib/features.ts).
  // Pengurus read-only: kas/piutang bukan miliknya, jadi CTA ke-5 =
  // dashboard admin (tier 'laporan').
  type QuickAction = { label: string; href: string; tier: Feature };
  const quickActions: QuickAction[] = [
    { label: 'Laporan', href: '/admin/laporan', tier: 'laporan' },
    { label: 'Zakat', href: '/admin/zakat', tier: 'zakat' },
    // W2.7 (D2/D5): CTA ZIS -- tampil utk tier zis (admin/manajer).
    { label: 'ZIS', href: '/admin/zis', tier: 'zis' },
    // W3.3 (Q3/OQ4): CTA Akad -- tampil utk tier laporan (termasuk pengurus,
    // read-only; tulis tetap hanya admin/manajer di /admin/akad).
    { label: 'Akad', href: '/admin/akad', tier: 'laporan' },
    { label: 'Audit', href: '/admin/audit', tier: 'audit' },
    { label: 'Ringkasan', href: '/', tier: 'personal' },
    { label: 'Dashboard', href: '/admin/dashboard', tier: 'laporan' },
  ];

  return (
    <Shell user={user}>
      <div className="card-hero relative mb-5 overflow-hidden shadow-lg shadow-accent-700/10">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-white">
                <Sparkles className="h-3 w-3" /> Pengurus
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
              Dashboard <span className="text-white/85">Global</span>
            </h1>
            <p className="mt-1 text-xs text-white/80 sm:text-sm">
              {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(
                new Date()
              )}{' '}
              · Laporan keseluruhan Kopontren (Rapat Pengurus)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              as="a"
              href="/admin/laporan"
              className="bg-white/90 text-slate-800 hover:bg-white shadow-sm"
            >
              Lihat Laporan Lengkap
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={
              'group card fade-up relative flex flex-col justify-between p-4 tile-hover border-slate-200/80 transition-all hover:border-accent-400/50 hover:shadow-lg dark:border-navy-700 ' +
              (c.warn ? 'border-amber-500/60 ring-1 ring-amber-500/30' : '')
            }
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {c.label}
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 ring-1 ring-black/5 transition group-hover:scale-110 dark:bg-navy-900/90 dark:ring-white/10">
                  {c.icon}
                </span>
              </div>
              <p className="mt-2 text-xl font-extrabold tracking-tight text-accent-600 dark:text-accent-300">
                {c.value}
              </p>
            </div>
            <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-navy-700/60">
              <div className="flex items-center justify-between gap-1 text-xs">
                <p className="text-slate-500 dark:text-slate-400 truncate">{c.sub}</p>
                <ArrowUpRight className="h-3 w-3 text-slate-400 opacity-0 transition group-hover:opacity-100 group-hover:text-accent-500 shrink-0" />
              </div>
              {c.delta && (
                <p
                  className={
                    'mt-1 text-xs font-bold tabular-nums ' +
                    (c.delta.tone === 'down'
                      ? 'text-rose-600 dark:text-rose-400'
                      : c.delta.tone === 'flat'
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-emerald-600 dark:text-emerald-400')
                  }
                >
                  <TermTip tip={c.delta.tip}>{c.delta.text}</TermTip>
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="card fade-up p-4">
        <h2 className="mb-2 font-bold">Aksi cepat</h2>
        <div className="flex flex-wrap gap-2">
          {quickActions
            .filter((qa) => canAccess(user, qa.tier))
            .map((qa) => (
              <Button key={qa.label} variant="ghost" as="a" href={qa.href}>
                {qa.label}
              </Button>
            ))}
        </div>
      </div>

      {feedOk && (
        <div className="mt-4">
          <ActivityFeed
            logs={feedLogs}
            movers={
              [
                deltaSales
                  ? { label: 'Penjualan 30h', text: deltaSales.text, tone: deltaSales.tone }
                  : null,
                deltaCash
                  ? { label: 'Arus kas 30h', text: deltaCash.text, tone: deltaCash.tone }
                  : null,
                deltaMember
                  ? { label: 'Member', text: deltaMember.text, tone: deltaMember.tone }
                  : null,
              ].filter((m): m is KpiMover => m !== null)
            }
            ctaHref="/admin/audit"
          />
        </div>
      )}

      <div className="mt-4">
        <PengurusDashboardClient />
      </div>
    </Shell>
  );
}