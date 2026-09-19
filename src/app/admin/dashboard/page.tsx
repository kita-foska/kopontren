import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUser, isManager } from '@/lib/auth';
import { db } from '@/db';
import { rp, startOfDayJakarta } from '@/lib/format';
import { Shell } from '@/components/shell';
import { LowStockClient } from '@/components/admin/low-stock-client';

export const dynamic = 'force-dynamic';

/**
 * Dashboard admin: ringkasan operasional harian + prediksi stok menipis
 * + notifikasi stok via WhatsApp (deep-link, tanpa API credentials).
 */
export default async function AdminDashboardPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!isManager(user)) redirect('/');
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

  const cards = [
    {
      label: 'Penjualan Hari Ini',
      value: rp(salesToday.t),
      sub: salesToday.c + ' transaksi · laba ' + rp(salesToday.t - cogsToday),
      href: '/admin/laporan',
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
      {/* Hero gradien (glassmorphism ringan) */}
      <div className="grad-hero mb-5 rounded-2xl p-5 text-white shadow-md">
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
              'card fade-up p-4 transition hover:-translate-y-0.5 hover:shadow-md ' +
              (c.warn ? 'border-amber-500/50' : '')
            }
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {c.label}
            </p>
            <p className="mt-1 text-xl font-extrabold text-accent-500 dark:text-accent-300">
              {c.value}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{c.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="card fade-up p-4">
          <h2 className="mb-2 font-bold">Aksi cepat</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/kasir" className="btn-primary">
              + Jual (POS)
            </Link>
            <Link href="/admin/produk" className="btn-ghost">
              Kelola Produk
            </Link>
            <Link href="/admin/laporan" className="btn-ghost">
              Laporan Pengurus
            </Link>
            <Link href="/admin/pengguna" className="btn-ghost">
              Pengguna
            </Link>
            <Link href="/admin/data" className="btn-ghost">
              Data &amp; Backup
            </Link>
          </div>
        </div>
        <LowStockClient items={stockForecast} />
      </div>
    </Shell>
  );
}