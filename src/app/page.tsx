import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { db } from '@/db';
import { rp, startOfDayJakarta } from '@/lib/format';
import { Shell } from '@/components/shell';

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
  const debtOpen =
    user.role !== 'pengurus'
      ? ((await d
          .prepare(
            `SELECT COALESCE(SUM(remaining),0) AS t, COUNT(*) AS c FROM debts WHERE status = 'open'`
          )
          .get()) as { c: number; t: number })
      : { c: 0, t: 0 };
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
  return (
    <Shell user={user}>
      {user.pw_default === 1 && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-300">
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
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Ringkasan <span className="text-accent-500 dark:text-accent-300">Hari Ini</span>
      </h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(
          new Date()
        )}{' '}
        · login sebagai {user.display_name || user.username} ({user.role})
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Penjualan hari ini
          </p>
          <p className="mt-1 text-2xl font-extrabold text-accent-500 dark:text-accent-300">
            {rp(salesToday.t)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{salesToday.c} transaksi</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Belum dilaporkan
          </p>
          <p className="mt-1 text-2xl font-extrabold text-amber-500">{unreported.c}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {rp(unreported.t)} menunggu rekap
          </p>
        </div>
        {user.role !== 'pengurus' && (
          <div className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Piutang belum lunas
            </p>
            <p className="mt-1 text-2xl font-extrabold text-rose-500">{rp(debtOpen.t)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {debtOpen.c} pelanggan ·{' '}
              <a href="/piutang" className="font-semibold text-accent-500 underline dark:text-accent-300">
                kelola
              </a>
            </p>
          </div>
        )}
        {isManager(user) && (
          <div className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Arus kas hari ini
            </p>
            <p className="mt-1 text-2xl font-extrabold">{rp(row.inn - row.out)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              masuk {rp(row.inn)} / keluar {rp(row.out)}
            </p>
          </div>
        )}
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Produk aktif
          </p>
          <p className="mt-1 text-2xl font-extrabold">{activeProducts}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {lowStock.length} stok menipis
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Aksi cepat</h2>
          <div className="flex flex-wrap gap-2">
            {user.role !== 'pengurus' && (
              <a href="/kasir" className="btn-primary">
                + Jual (POS)
              </a>
            )}
            <a href="/laporan" className="btn-ghost">
              Laporan & Rekap
            </a>
            {user.role === 'admin' && (
              <a href="/admin/belanja" className="btn-ghost">
                Belanja & Stok
              </a>
            )}
            {user.role === 'admin' && (
              <a href="/admin/kas" className="btn-ghost">
                Pembukuan
              </a>
            )}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Stok menipis (&lt; 5)</h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Semua stok aman.</p>
          ) : (
            <ul className="space-y-1">
              {lowStock.map((p) => (
                <li key={p.name} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="font-semibold text-amber-500">
                    {p.stock} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {user.role === 'admin' && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Menu lengkap (Produk, Belanja, Konsinyasi, Kas, Member, Laporan Pengurus, Pengguna,
          Data &amp; Backup) tersedia di navigasi atas.
        </p>
      )}
      {user.role === 'pengurus' && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Anda masuk sebagai pengurus (mode baca): Ringkasan, Laporan &amp; Rekap, dan Laporan
          Pengurus. Menu pengelolaan (Kasir, Produk, Kas, dsb.) khusus admin.
        </p>
      )}
    </Shell>
  );
}