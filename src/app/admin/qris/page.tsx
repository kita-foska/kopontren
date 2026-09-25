import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const QrisClient = lazy(
  () => import('@/components/admin/qris-client').then((m) => m.QrisClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function QrisPage() {
  const user = await currentUser();
  if (!user || !isManager(user)) redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Pembayaran <span className="text-accent-500 dark:text-accent-300">QRIS</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Encoder QRIS statis/dinamis (EMVCo/QRIS-BI): isi NMID resmi untuk mengaktifkan QR —
        placeholder pralayar sampai NMID turun.
      </p>
      <QrisClient />
    </Shell>
  );
}