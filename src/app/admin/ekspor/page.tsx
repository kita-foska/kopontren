import { redirect } from 'next/navigation';
import { currentUser, isAdmin } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { ExportCenterClient } from '@/components/admin/ekspor/export-center-client';

export const dynamic = 'force-dynamic';

export default async function EksporAdminPage() {
  const user = await currentUser();
  // Pusat Ekspor = fitur admin-only (level 'admin'; isAdmin). Endpoint CSV
  // di baliknya guard tier 'laporan' (superset); halaman ini lebih ketat.
  if (!user || !isAdmin(user)) redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Pusat <span className="text-accent-500 dark:text-accent-300">Ekspor</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Unduh CSV modul dan cetak laporan formal (sistem administrasi).
      </p>
      <ExportCenterClient />
    </Shell>
  );
}