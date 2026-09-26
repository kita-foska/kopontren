import { redirect } from 'next/navigation';
import { currentUser, isAdmin } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { NotificationListClient } from '@/components/admin/notification-list-client';

export const dynamic = 'force-dynamic';

/**
 * /admin/notifications — pusat notifikasi ADMIN (in-app).
 * Hanya role 'admin' (kasir/pengurus tidak mendapat akses).
 */
export default async function AdminNotificationsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) redirect('/admin/dashboard');
  return (
    <Shell user={user}>
      <div className="hero-bg mb-5 rounded-2xl p-5 text-white shadow-md">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Notifikasi <span className="text-white/80">Admin</span>
        </h1>
        <p className="mt-1 text-sm text-white/70">
          Pusat notifikasi dalam aplikasi &amp; push (khusus admin)
        </p>
      </div>
      <NotificationListClient />
    </Shell>
  );
}
