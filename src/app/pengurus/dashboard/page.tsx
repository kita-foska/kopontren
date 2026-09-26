import { redirect } from 'next/navigation';
import Link from 'next/link';
import { canAccess, currentUser, isManager } from '@/lib/auth';
import { db } from '@/db';
import { rp, startOfDayJakarta } from '@/lib/format';
import { Shell } from '@/components/shell';
import { PengurusDashboardClient } from '@/components/pengurus-dashboard-client';

export const dynamic = 'force-dynamic';

/**
 * Dashboard pengurus (global): KPI multi-periode + grafik 7/30/365 hari
 * dengan deteksi anomali + export CSV/Excel/PDF + laporan via WhatsApp.
 * KPI dihitung di server; chart & export dieksekusi client via /api/reports.
 */
export default async function PengurusDashboardPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: laporan (admin, manajer, pengurus).
  if (!canAccess(user, 'laporan')) redirect('/');
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

  // Pengurus = read-only (TIDAK operasional): KPI yang mengarah ke halaman
  // operasional (kas/member/produk) dinamis -> /admin/laporan, agar pengurus
  // tak jatuh ke dead-end (halaman tsb di-guard isManager/'member'/'stock').
  const readOnly = !isManager(user);
  const laporan = '/admin/laporan';
  const cards = [
    {
      label: 'Penjualan 30 Hari',
      value: rp(s30.t),
      sub: s30.c + ' transaksi',
      href: laporan,
    },
    {
      label: 'Arus Kas 30 Hari',
      value: rp(cash30.inn - cash30.out),
      sub: 'masuk ' + rp(cash30.inn) + ' / keluar ' + rp(cash30.out),
      href: readOnly ? laporan : '/admin/kas',
    },
    {
      label: 'Member Aktif',
      value: String(memberCount),
      sub: 'loyalty & poin',
      href: readOnly ? laporan : '/admin/member',
    },
    {
      label: 'Stok Menipis',
      value: String(lowStock),
      sub: 'produk di bawah 10',
      href: '/admin/dashboard',
      warn: lowStock > 0,
    },
    {
      label: 'Cabang Terdaftar',
      value: String(storeCount),
      sub: 'data penjualan masih global',
      href: readOnly ? laporan : '/admin/produk',
    },
  ];

  return (
    <Shell user={user}>
      <div className="hero-bg mb-5 rounded-2xl p-5 text-white shadow-md">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Dashboard <span className="text-white/80">Global</span>
        </h1>
        <p className="mt-1 text-sm text-white/70">
          {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(
            new Date()
          )}{' '}
          · laporan keseluruhan Kopontren (rapat pengurus)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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

      <div className="mt-4">
        <PengurusDashboardClient />
      </div>
    </Shell>
  );
}