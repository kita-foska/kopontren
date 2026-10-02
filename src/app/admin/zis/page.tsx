import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const ZisClient = lazy(() => import('@/components/admin/zis-client').then((m) => m.ZisClient), {
  loading: () => <PageSkeleton />,
});

export const dynamic = 'force-dynamic';

export default async function ZisPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // W2.7: tier zis = admin + manajer (D2). Pengurus membaca data ZIS
  // via CALK item 7 (laporan), bukan modul ini.
  if (!canAccess(user, 'zis')) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      {/* .print-area: opt-in "cetak halaman penuh" di @media print
          (atk. global receipt body*{visibility:hidden} membuat halaman
          cetak jadi kosong tanpa kelas ini -- lihat globals.css). */}
      <div className="print-area">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
          Pencatatan <span className="text-accent-500 dark:text-accent-300">ZIS</span>
        </h1>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Zakat, infak, sedekah: input masuk/keluar per jenis + auto-jurnal GL (skema v22,
          OQ-1: masuk D1100/C2090; keluar zakat D5090/C1100; infak/sedekah D5100/C1100).
          Wakaf: tercatat, jurnal manual 1120/4100/6020 = W3.5.
        </p>
        <ZisClient />
      </div>
    </Shell>
  );
}
