import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton, TermTip } from '@/components/ui';

const JurnalClient = lazy(
  () => import('@/components/admin/jurnal-client').then((m) => m.JurnalClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function JurnalPage() {
  const user = await currentUser();
  // Tier: admin-only (guard sama dgn /admin/pengguna & POST /api/jurnal):
  // pengurus = read-only (lihat data lewat /admin/gl).
  if (!user || user.role !== 'admin') redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        <TermTip
          term="Jurnal GL"
          tip="Catatan jurnal (debit/kredit) yang ditulis manual. Data GL tidak bisa dihapus; koreksi lewat jurnal pembalik."
        >
          Jurnal <span className="text-accent-500 dark:text-accent-300">GL</span>
        </TermTip>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Buat jurnal manual dan{' '}
        <TermTip tip="Koreksi tanpa hapus: dicatatkan entri berlawanan; bukti asal tetap ada untuk audit.">
          journal entry pembalik
        </TermTip>{' '}
        (koreksi tanpa hapus:
        data GL bersifat immutable, semua koreksi tercatat sebagai type=reversal).
      </p>
      <JurnalClient />
    </Shell>
  );
}
