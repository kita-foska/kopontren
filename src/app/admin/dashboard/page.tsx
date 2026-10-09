import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { db } from '@/db';
import { kpiDelta, rp, startOfDayJakarta, type KpiDelta } from '@/lib/format';
import { Shell } from '@/components/shell';
import { LowStockClient } from '@/components/admin/low-stock-client';
import { ActivityFeed, type FeedItem, type KpiMover } from '@/components/activity-feed';
import { Button, TermTip } from '@/components/ui';
import {
  TrendingUp,
  Clock,
  Wallet,
  Users,
  CreditCard,
  Building2,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Dashboard admin: ringkasan operasional harian + prediksi stok menipis
 * + notifikasi stok via WhatsApp (deep-link, tanpa API credentials).
 * Tier: laporan (admin, manajer, pengurus).
 */
export default async function AdminDashboardPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // H2: guard-fail -> role-aware (member -> /member; role internal -> /).
  if (!canAccess(user, 'laporan')) redirect(roleHome(user.role));
  const d = await db();
  const today = startOfDayJakarta(0);
  const d7 = startOfDayJakarta(-6);

  const salesToday = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(total),0) t, COALESCE(SUM(discount),0) ds
         FROM sales WHERE created_at >= ?`
      )
      .get(today)) as { c: number; t: number; ds: number }
  );
  const cogsToday = (
    (await d
      .prepare(
        `SELECT COALESCE(SUM(si.qty * COALESCE(NULLIF(si.cost_price,0), p.cost_price, 0)),0) v
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE s.created_at >= ?`
      )
      .get(today)) as { v: number }
  ).v;
  const unreported = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales WHERE status = 'unreported'`
      )
      .get()) as { c: number; t: number }
  );
  const cash7 = (
    (await d
      .prepare(
        `SELECT
         (SELECT COALESCE(SUM(total),0) FROM sales WHERE created_at >= ?)
         + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='income' AND created_at >= ?) AS inn,
         (SELECT COALESCE(SUM(qty*unit_cost),0) FROM purchases WHERE created_at >= ?)
         + (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE created_at >= ?)
         + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='expense' AND created_at >= ?) AS out`
      )
      .get(d7, d7, d7, d7, d7)) as { inn: number; out: number }
  );
  const memberCount = ((await d.prepare(`SELECT COUNT(*) c FROM members`).get()) as {
    c: number;
  }).c;
  const debtOpen = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(remaining),0) t FROM debts WHERE status = 'open'`
      )
      .get()) as { c: number; t: number }
  );
  const payableOpen = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(remaining),0) t FROM payables WHERE status = 'open'`
      )
      .get()) as { c: number; t: number }
  );
  // Prediksi stok: rata-rata terjual 14 hari terakhir -> sisa ±berapa hari.
  const d14 = startOfDayJakarta(-13);
  const lowStockSimple = (
    (await d
      .prepare(
        `SELECT p.id, p.name, p.stock, p.unit FROM products p
         WHERE p.active = 1 AND p.stock < 10 ORDER BY p.stock ASC LIMIT 12`
      )
      .all()) as { id: number; name: string; stock: number; unit: string }[]
  );
  const avgDaily = (
    (await d
      .prepare(
        `SELECT si.product_id, COALESCE(SUM(si.qty),0) / 14.0 AS avg_daily
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= ?
         GROUP BY si.product_id`
      )
      .all(d14)) as { product_id: number; avg_daily: number }[]
  );
  const avgMap = new Map(avgDaily.map((r) => [r.product_id, r.avg_daily]));
  const stockForecast = lowStockSimple.map((p) => {
    const avg = avgMap.get(p.id) ?? 0;
    const daysLeft = avg > 0 ? Math.floor(p.stock / avg) : null;
    return { ...p, avg_daily: avg, days_left: daysLeft };
  });

  // I-3 UX-6: delta konteks KPI — nilai periode vs periode sebelumnya
  // ("▲ 12% · vs kemarin"), dihitung di server; TermTip menjelaskan pakan.
  const salesY = (
    (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales
         WHERE created_at >= ? AND created_at < ?`
      )
      .get(startOfDayJakarta(-1), today)) as { c: number; t: number }
  );
  const cashPrev7 = (
    (await d
      .prepare(
        `SELECT
         (SELECT COALESCE(SUM(total),0) FROM sales WHERE created_at >= ? AND created_at < ?)
         + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='income' AND created_at >= ? AND created_at < ?) AS inn,
         (SELECT COALESCE(SUM(qty*unit_cost),0) FROM purchases WHERE created_at >= ? AND created_at < ?)
         + (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE created_at >= ? AND created_at < ?)
         + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='expense' AND created_at >= ? AND created_at < ?) AS out`
      )
      .get(d14, d7, d14, d7, d14, d7, d14, d7, d14, d7)) as { inn: number; out: number }
  );
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
    'Perbandingan: penjualan hari ini vs kemarin (WIB 00:00–23:59). ' +
    'Persentase dihitung dari total penjualan tercatat — retur & void ' +
    'sudah mengurangi jumlah. "baru" = kemarin tidak ada penjualan; ' +
    '"stabil" = perubahan < 0,5%.';
  const TIP_CASH =
    'Arus kas = masuk (penjualan + kas masuk manual) − keluar ' +
    '(pembelian supplier + pengeluaran + kas keluar manual). ' +
    'Perbandingan: 7 hari terakhir vs 7 hari sebelumnya (WIB).';
  const deltaSales = kpiDelta(salesToday.t, salesY.t, 'vs kemarin');
  const deltaCash = kpiDelta(
    cash7.inn - cash7.out,
    cashPrev7.inn - cashPrev7.out,
    'vs 7 hari sebelumnya'
  );
  // I-8 UX-6: feed "Apa yang berubah" — 5 audit log terbaru (server-side,
  // philosophy I-3: tanpa fetch tambahan di klien). Hanya dirender utk
  // user dgn tier "audit" (pengurus = read-only; manajer tak punya tier ->
  // kartu tersembunyi, bukan dead-end UI).
  const feedOk = canAccess(user, 'audit');
  const feedLogs: FeedItem[] = feedOk
    ? ((await d
        .prepare(
          `SELECT id, username, user_name, user_role, action, record_id, created_at
           FROM audit_log ORDER BY id DESC LIMIT 5`
        )
        .all()) as FeedItem[])
    : [];
  const cards: DashCard[] = [
    {
      label: 'Penjualan Hari Ini',
      value: rp(salesToday.t),
      sub: salesToday.c + ' transaksi · laba ' + rp(salesToday.t - cogsToday),
      href: '/admin/laporan',
      icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
      delta: deltaSales ? { ...deltaSales, tip: TIP_SALES } : undefined,
    },
    {
      label: 'Belum Direkap',
      value: String(unreported.c),
      sub: rp(unreported.t) + ' menunggu laporan',
      href: '/laporan',
      icon: <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
      warn: unreported.c > 0,
    },
    {
      label: 'Arus Kas 7 Hari',
      value: rp(cash7.inn - cash7.out),
      sub: 'masuk ' + rp(cash7.inn) + ' / keluar ' + rp(cash7.out),
      href: '/admin/kas',
      icon: <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
      delta: deltaCash ? { ...deltaCash, tip: TIP_CASH } : undefined,
    },
    {
      label: 'Member Aktif',
      value: String(memberCount),
      sub: 'loyalty & poin',
      href: '/admin/member',
      icon: <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />,
    },
    {
      label: 'Piutang Buka',
      value: rp(debtOpen.t),
      sub: debtOpen.c + ' pelanggan',
      href: '/piutang',
      icon: <CreditCard className="h-5 w-5 text-rose-600 dark:text-rose-400" />,
    },
    {
      label: 'Hutang Supplier Buka',
      value: rp(payableOpen.t),
      sub: payableOpen.c + ' supplier',
      href: '/admin/hutang',
      icon: <Building2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />,
    },
  ];

  return (
    <Shell user={user}>
      {/* Hero modern dengan aksen soft glass depth */}
      <div className="card-hero relative mb-5 overflow-hidden shadow-lg shadow-accent-700/10">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-white">
                <Sparkles className="h-3 w-3" /> Kopontren
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
              Dashboard <span className="text-white/85">Admin</span>
            </h1>
            <p className="mt-1 text-xs text-white/80 sm:text-sm">
              {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(
                new Date()
              )}{' '}
              · Ringkasan operasional real-time Kopontren Al Ittihad
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              as="a"
              href="/kasir"
              className="bg-white/90 text-slate-800 hover:bg-white shadow-sm"
            >
              Buka Kasir POS
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-black/5 transition group-hover:scale-110 dark:bg-navy-900/90 dark:ring-white/10">
                  {c.icon}
                </span>
              </div>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-accent-600 dark:text-accent-300">
                {c.value}
              </p>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-navy-700/60">
              <div className="flex items-center justify-between gap-1 text-xs">
                <p className="text-slate-500 dark:text-slate-400 truncate">{c.sub}</p>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 opacity-0 transition group-hover:opacity-100 group-hover:text-accent-500 shrink-0" />
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

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="card fade-up p-4">
          <h2 className="mb-2 font-bold">Aksi cepat</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" as="a" href="/kasir">
              + Jual (POS)
            </Button>
            <Button variant="ghost" as="a" href="/admin/produk">
              Kelola Produk
            </Button>
            <Button variant="ghost" as="a" href="/admin/laporan">
              Laporan Pengurus
            </Button>
            <Button variant="ghost" as="a" href="/admin/pengguna">
              Pengguna
            </Button>
            <Button variant="ghost" as="a" href="/admin/data">
              Data &amp; Backup
            </Button>
          </div>
        </div>
        <LowStockClient items={stockForecast} canManageStock={canAccess(user, 'stock')} />
      </div>

      {feedOk && (
        <div className="mt-4">
          <ActivityFeed
            logs={feedLogs}
            movers={
              [
                deltaSales
                  ? { label: 'Penjualan hari ini', text: deltaSales.text, tone: deltaSales.tone }
                  : null,
                deltaCash
                  ? { label: 'Arus kas 7h', text: deltaCash.text, tone: deltaCash.tone }
                  : null,
              ].filter((m): m is KpiMover => m !== null)
            }
            ctaHref="/admin/audit"
          />
        </div>
      )}
    </Shell>
  );
}