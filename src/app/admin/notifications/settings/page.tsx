import { redirect } from 'next/navigation';
import { currentUser, isAdmin } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { NotificationSettingsClient } from '@/components/admin/notification-settings-client';

export const dynamic = 'force-dynamic';

/**
 * /admin/notifications/settings — pengaturan notifikasi admin
 * (toggle in-app/push per jenis + aktivasi push PWA). Hanya role 'admin'.
 */
export default async function AdminNotificationSettingsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) redirect('/admin/notifications');
  return (
    <Shell user={user}>
      <div className="hero-bg mb-5 rounded-2xl p-5 text-white shadow-md">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Pengaturan <span className="text-white/80">Notifikasi</span>
        </h1>
        <p className="mt-1 text-sm text-white/70">
          Pilih jenis notifikasi (dalam aplikasi &amp; push) + aktifkan push PWA
        </p>
      </div>
      <NotificationSettingsClient />
    </Shell>
  );
}

