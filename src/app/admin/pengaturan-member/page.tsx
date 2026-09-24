import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const MemberSettingsClient = lazy(
  () =>
    import('@/components/admin/member-settings-client').then((m) => m.MemberSettingsClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function PengaturanMemberPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Keuntungan <span className="text-accent-500 dark:text-accent-300">Member</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Atur poin, diskon member, saldo reward, promo ulang tahun, dan tier member.
      </p>
      <MemberSettingsClient />
    </Shell>
  );
}
