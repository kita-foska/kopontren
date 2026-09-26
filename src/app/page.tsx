import { redirect } from 'next/navigation';
import { canAccess, currentUser, isManager } from '@/lib/auth';
import { db } from '@/db';
import { rp, startOfDayJakarta } from '@/lib/format';
import { Shell } from '@/components/shell';
import { Empty, StatusBadge } from '@/components/ui';
import { payMethodLabel } from '@/lib/pay-methods';
import { ShoppingCart } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const d = await db();
  const dayStart = startOfDayJakarta(0);

  const salesToday = (
    (await d
      .prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales WHERE created_at >= ?`)
      .get(dayStart)) as { c: number; t: number }
  );
  const unreported = (
    (await d
      .prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales WHERE status = 'unreported'`)
      .get()) as { c: number; t: number }
  );
  const lowStock = (
    await d
      .prepare(
        `SELECT name, stock, unit FROM products WHERE active = 1 AND stock < 5 ORDER BY stock ASC LIMIT 5`
      )
      .all()
  ) as { name: string; stock: number; unit: string }[];
  const activeProducts = (
    (await d.prepare(`SELECT COUNT(*) c FROM products WHERE active = 1`).get()) as { c: number }
  ).c;
  const row = (
    (await d
      .prepare(
      `SELECT
       (SELECT COALESCE(SUM(total),0) FROM sales WHERE created_at >= ?)
       + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='income' AND created_at >= ?) AS inn,
       (SELECT COALESCE(SUM(qty*unit_cost),0) FROM purchases WHERE created_at >= ?)
       + (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE created_at >= ?)
       + (SELECT COALESCE(SUM(amount),0) FROM cash_entries WHERE type='expense' AND created_at >= ?) AS out`
      )
      .get(dayStart, dayStart, dayStart, dayStart, dayStart)) as { inn: number; out: number }
  );

  // PHASE 2 — dashboard kasir: transaksi terakhir (read-only, 5 baris).
  const lastSales = (await d
    .prepare(
      `SELECT id, total, pay_method, status, created_at FROM sales ORDER BY created_at DESC LIMIT 5`
    )
    .all()) as {
    id: number;
    total: number;
    pay_method: string;
    status: string;
    created_at: string;
  }[];

  const dateLine = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'full',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());

  const txTime = (iso: string) =>
    new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(new Date(iso));

  return (
    <Shell user={user}>
      {user.pw_default === 1 && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <b>Perhatian:</b> password Anda masih default.{' '}
          {user.role === 'admin' ? (
            <>
              Ubah di{' '}
              <a className="font-semibold underline" href="/admin/pengguna">
                Admin → Pengguna
              </a>{' '}
              sebelum dipakai operasional.
            </>
          ) : user.role === 'pengurus' ? (
            <>Minta admin untuk mengubahnya di halaman Admin → Pengguna.</>
          ) : (
            <>Minta pengurus untuk mengubahnya di halaman Admin → Pengguna.</>
          )}
        </div>
      )}
      {user.role === 'kasir' ? (
        /* ===== Layout KASIR (PHASE 2): CTA MULAI JUAL + 2 stat + BELUM DILAPORKAN +
           TRANSAKSI TERAKHIR (read-only). ===== */
        <div className="space-y-4">
          <div className="card fade-up p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Sesi kasir · {dateLine}
            </p>
            <a
              href="/kasir"
              className="btn-primary mt-3 flex w-full items-center justify-center gap-2 py-4 text-base font-bold"
            >
              MULAI JUAL <span className="text-sm font-semibold opacity-70">(POS)</span>
            </a>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="card fade-up p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Penjualan hari ini
              </p>
              <p className="tabular-nums mt-1 text-2xl font-extrabold text-accent-500 dark:text-accent-300">
                {rp(salesToday.t)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{salesToday.c} transaksi</p>
            </div>
            <div className="card fade-up p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Stok menipis (&lt; 5)
              </p>
              <p className="tabular-nums mt-1 text-2xl font-extrabold text-amber-700 dark:text-amber-400">{lowStock.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                dari {activeProducts} produk aktif
              </p>
            </div>
          </div>

          <div
            className={'card fade-up p-4 ' + (unreported.c > 0 ? 'border-amber-500/50' : '')}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Belum dilaporkan
            </p>
            <p className="tabular-nums mt-1 text-2xl font-extrabold text-amber-700 dark:text-amber-400">{unreported.c}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {rp(unreported.t)} menunggu rekap oleh admin/pengurus
            </p>
          </div>

          <div className="card fade-up p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Transaksi terakhir
            </h2>
            {lastSales.length === 0 ? (
              <Empty
                icon={<ShoppingCart className="h-7 w-7" />}
                text="Belum ada transaksi."
                ctaLabel="Mulai transaksi"
                ctaHref="/kasir"
                ctaVariant="primary"
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-navy-700">
                {lastSales.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {payMethodLabel(s.pay_method)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {txTime(s.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={s.status} />
                      <span className="font-extrabold">{rp(s.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        /* ===== Layout lain (admin/manajer/pengurus/member): ringkasan penuh. ===== */
        <div className="space-y-4">
          <div className="hero-bg mb-5 rounded-2xl p-5 text-white">
            <h1 className="text-2xl font-extrabold tracking-tight">
              Ringkasan <span className="text-white/80">Hari Ini</span>
            </h1>
            <p className="mt-1 text-sm text-white/70">
              {dateLine} · login sebagai {user.display_name || user.username} ({user.role})
            </p>
          </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card fade-up p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Penjualan hari ini
          </p>
          <p className="tabular-nums mt-1 text-2xl font-extrabold text-accent-500 dark:text-accent-300">
            {rp(salesToday.t)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{salesToday.c} transaksi</p>
        </div>
        <div
          className={
            'card fade-up p-4 ' + (unreported.c > 0 ? 'border-amber-500/50' : '')
          }
        >
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Belum dilaporkan
          </p>
          <p className="tabular-nums mt-1 text-2xl font-extrabold text-amber-700 dark:text-amber-400">{unreported.c}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {rp(unreported.t)} menunggu rekap
          </p>
        </div>
        {isManager(user) && (
          <div className="card fade-up p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Arus kas hari ini
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{rp(row.inn - row.out)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              masuk {rp(row.inn)} / keluar {rp(row.out)}
            </p>
          </div>
        )}
        <div className="card fade-up p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Produk aktif
          </p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">{activeProducts}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {lowStock.length} stok menipis
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="card fade-up p-4">
          <h2 className="mb-2 font-bold">Aksi cepat</h2>
          <div className="flex flex-wrap gap-2">
            {canAccess(user, 'pos') && (
              <a href="/kasir" className="btn-primary">
                + Jual (POS)
              </a>
            )}
            {canAccess(user, 'laporan') && (
              <a href="/laporan" className="btn-ghost">
                Laporan & Rekap
              </a>
            )}
            {canAccess(user, 'supplier') && (
              <a href="/admin/belanja" className="btn-ghost">
                Belanja & Stok
              </a>
            )}
            {isManager(user) && (
              <a href="/admin/kas" className="btn-ghost">
                Pembukuan
              </a>
            )}
          </div>
        </div>
        <div className="card fade-up p-4">
          <h2 className="mb-2 font-bold">Stok menipis (&lt; 5)</h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Semua stok aman.</p>
          ) : (
            <ul className="space-y-1">
              {lowStock.map((p) => (
                <li key={p.name} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                    {p.stock} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Menu pengurus (Produk, Belanja, Konsinyasi, Kas, Laporan Pengurus, Pengguna, Data &amp;
          Backup) tersedia di menu navigasi — baris atas di desktop, tombol hamburger di layar
          kecil.
        </p>
      </div>
      )}
    </Shell>
  );
}