import { redirect } from 'next/navigation';
import Link from 'next/link';
import { canAccess, currentUser, isManager, roleHome } from '@/lib/auth';
import { db } from '@/db';
import { kpiDelta, rp, startOfDayJakarta, type KpiDelta } from '@/lib/format';
import { Shell } from '@/components/shell';
import { PengurusDashboardClient } from '@/components/pengurus-dashboard-client';
import { ActivityFeed, type FeedItem, type KpiMover } from '@/components/activity-feed';
import { TermTip } from '@/components/ui';

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

  // I-3 UX-6: delta konteks — 30h terakhir vs 30h sebelumnya (server-side),
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
    newMembers > 0 ? { text: '▲ ' + newMembers + ' baru · 30 hari ini', tone: 'up' } : null;

  // I-8 UX-6: feed "Apa yang berubah" — 5 audit log terbaru (server-side,
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
    warn?: boolean;
    delta?: KpiDelta & { tip: string };
  };
  const TIP_SALES =
    'Perbandingan: total penjualan 30 hari terakhir vs 30 hari sebelumnya ' +
    '(WIB). "baru" = periode sebelumnya tidak ada penjualan; ' +
    '"stabil" = perubahan < 0,5%.';
  const TIP_CASH =
    'Arus kas = masuk (penjualan + kas masuk manual) − keluar ' +
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
      delta: deltaSales ? { ...deltaSales, tip: TIP_SALES } : undefined,
    },
    {
      label: 'Arus Kas 30 Hari',
      value: rp(cash30.inn - cash30.out),
      sub: 'masuk ' + rp(cash30.inn) + ' / keluar ' + rp(cash30.out),
      href: readOnly ? laporan : '/admin/kas',
      delta: deltaCash ? { ...deltaCash, tip: TIP_CASH } : undefined,
    },
    {
      label: 'Member Aktif',
      value: String(memberCount),
      sub: 'loyalty & poin',
      href: readOnly ? laporan : '/admin/member',
      delta: deltaMember ? { ...deltaMember, tip: TIP_MEMBER } : undefined,
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
      <div className="card-hero mb-5">
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
              'card fade-up p-4 tile-hover ' +
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