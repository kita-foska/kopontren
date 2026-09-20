import { redirect } from 'next/navigation';
import { canAccess, currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const ZakatClient = lazy(
  () => import('@/components/admin/zakat-client').then((m) => m.ZakatClient),
  {
    loading: () => <p className="text-sm text-slate-500 dark:text-slate-400">Memuat…</p>,
  }
);

export const dynamic = 'force-dynamic';

export default async function ZakatPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: zakat (admin, manajer, pengurus). Simpan pengaturan & riwayat tetap admin.
  if (!canAccess(user, 'zakat')) redirect('/');
  return (
    <Shell user={user}>
      {/* .print-area: opt-in "cetak halaman penuh" di @media print
          (atk. global receipt body*{visibility:hidden} membuat halaman
          cetak jadi kosong tanpa kelas ini — lihat globals.css). */}
      <div className="print-area">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
          Perhitungan <span className="text-accent-500 dark:text-accent-300">Zakat Toko</span>
        </h1>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Zakat tijarah (perdagangan) 2,5% dari harta dagang: modal + laba kotor + piutang − hutang.
        </p>
        <ZakatClient />
      </div>
    </Shell>
  );
}
