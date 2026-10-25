import { redirect } from 'next/navigation';
import { currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { NotificationSettingsClient } from '@/components/admin/notification-settings-client';
import { canReceiveNotif } from '@/lib/notify-scope';

export const dynamic = 'force-dynamic';

/**
 * /admin/notifications/settings -- pengaturan notifikasi per user
 * (toggle in-app/push per jenis + aktivasi push PWA).
 * W13 B2: semua role penerima (admin, manajer, pengurus, kasir).
 */
export default async function AdminNotificationSettingsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canReceiveNotif(user.role)) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <div className="card-hero mb-5">
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

