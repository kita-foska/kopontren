import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const AkadClient = lazy(() => import('@/components/admin/akad-client').then((m) => m.AkadClient), {
  loading: () => <PageSkeleton />,
});

export const dynamic = 'force-dynamic';

export default async function AkadPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // W3.3 (Q3): baca = tier akad (admin+manajer) ATAU laporan (termasuk
  // pengurus, read-only -- selaras CALK item 8 + pola zis item 7).
  // Tulis (form + event + status) hanya tier akad (admin+manajer).
  const canWrite = canAccess(user, 'akad');
  if (!canWrite && !canAccess(user, 'laporan')) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <div className="print-area">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
          Akad <span className="text-accent-500 dark:text-accent-300">Syariah</span>
        </h1>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Perjanjian per jenis (Sek.6.2/6.4; skema v23): murabahah, mudharabah, musyarakah,
          ijarah, wakalah (bridge W3.4) + event per akad (jurnal auto hanya saat GL aktif, D1).
          Pengurus: read-only (Q3; rincian via CALK item 8).
        </p>
        <AkadClient canWrite={canWrite} />
      </div>
    </Shell>
  );
}
