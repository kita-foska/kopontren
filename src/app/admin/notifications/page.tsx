import { redirect } from 'next/navigation';
import { currentUser, isAdmin, isNotifViewer, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { NotificationListClient } from '@/components/admin/notification-list-client';

export const dynamic = 'force-dynamic';

/**
 * /admin/notifications — pusat notifikasi ADMIN (in-app).
 * Viewer: admin + pengurus (Q3: pengurus = view read-only; pengaturan &
 * kirim manual tetap admin-only).
 */
export default async function AdminNotificationsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!isNotifViewer(user)) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <div className="card-hero mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Notifikasi <span className="text-white/80">Admin</span>
        </h1>
        <p className="mt-1 text-sm text-white/70">
          Pusat notifikasi dalam aplikasi &amp; push (admin &amp; pengurus)
        </p>
      </div>
      <NotificationListClient canManageNotif={isAdmin(user)} />
    </Shell>
  );
}
