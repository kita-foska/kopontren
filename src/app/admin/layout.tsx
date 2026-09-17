import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!isManager(user)) redirect('/');
  return <>{children}</>;
}
