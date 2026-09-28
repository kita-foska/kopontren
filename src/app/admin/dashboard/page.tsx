import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { db } from '@/db';
import { kpiDelta, rp, startOfDayJakarta, type KpiDelta } from '@/lib/format';
import { Shell } from '@/components/shell';
import { LowStockClient } from '@/components/admin/low-stock-client';
import { ActivityFeed, type FeedItem, type KpiMover } from '@/components/activity-feed';
import { Button, TermTip } from '@/components/ui';

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
      delta: deltaSales ? { ...deltaSales, tip: TIP_SALES } : undefined,
    },
    {
      label: 'Belum Direkap',
      value: String(unreported.c),
      sub: rp(unreported.t) + ' menunggu laporan',
      href: '/laporan',
      warn: unreported.c > 0,
    },
    {
      label: 'Arus Kas 7 Hari',
      value: rp(cash7.inn - cash7.out),
      sub: 'masuk ' + rp(cash7.inn) + ' / keluar ' + rp(cash7.out),
      href: '/admin/kas',
      delta: deltaCash ? { ...deltaCash, tip: TIP_CASH } : undefined,
    },
    {
      label: 'Member Aktif',
      value: String(memberCount),
      sub: 'loyalty & poin',
      href: '/admin/member',
    },
    {
      label: 'Piutang Buka',
      value: rp(debtOpen.t),
      sub: debtOpen.c + ' pelanggan',
      href: '/piutang',
    },
    {
      label: 'Hutang Supplier Buka',
      value: rp(payableOpen.t),
      sub: payableOpen.c + ' supplier',
      href: '/admin/hutang',
    },
  ];

  return (
    <Shell user={user}>
      {/* Hero flat (design system: tanpa gradient/shadow — PHASE 1) */}
      <div className="card-hero mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Dashboard <span className="text-white/80">Admin</span>
        </h1>
        <p className="mt-1 text-sm text-white/70">
          {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(
            new Date()
          )}{' '}
          · ringkasan operasional Kopontren
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={
              'card fade-up p-4 tile-hover ' +
              (c.warn ? 'border-amber-500/50' : '')
            }
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {c.label}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-accent-500 dark:text-accent-300">
              {c.value}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{c.sub}</p>
            {c.delta && (
              <p
                className={
                  'mt-0.5 text-xs font-semibold tabular-nums ' +
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