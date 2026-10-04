import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

// UX-1 (E37/E39): halaman Glosarium -- daftar istilah resmi
// (src/lib/glossary.ts) dalam bahasa awam; guard level 'personal'
// (semua role, mirror pola /tutorial).
const GlosariumClient = lazy(
  () => import('@/components/admin/glosarium-client').then((m) => m.GlosariumClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function GlosariumPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Level personal = semua role (sama dgn /tutorial).
  if (!canAccess(user, 'personal')) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        <span className="text-accent-500 dark:text-accent-300">Glosarium</span>{' '}
        Istilah
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Penjelasan bahasa awam tiap istilah di aplikasi: laporan, akad syariah, ZIS,
        dan keuntungan member. Tombol ? di tiap halaman memberi penjelasan singkat;
        di sini daftar lengkapnya.
      </p>
      <GlosariumClient />
    </Shell>
  );
}
