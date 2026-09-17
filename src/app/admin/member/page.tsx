import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const MemberClient = lazy(
  () => import('@/components/admin/member-client').then((m) => m.MemberClient),
  {
    loading: () => (
      <p className="text-sm text-slate-500 dark:text-slate-400">Memuat komponen…</p>
    ),
  }
);

export const dynamic = 'force-dynamic';

export default async function AdminMemberPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!isManager(user)) redirect('/');

  return (
    <Shell user={user}>
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Data <span className="text-accent-500 dark:text-accent-300">Member & Santri</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Kelola data santri, pelanggan tetap, dan pantau poin loyalitas belanja koperasi.
        </p>
      </div>
      <MemberClient />
    </Shell>
  );
}
