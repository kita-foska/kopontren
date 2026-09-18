import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { LaporanClient } from '@/components/laporan-client';

export const dynamic = 'force-dynamic';

export default async function LaporanPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Laporan & <span className="text-amber-500">Rekap</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Daftar transaksi, tandai sudah/belum dilapor, dan kirim rekap ke WhatsApp pengurus.
      </p>
      <LaporanClient admin={isManager(user)} />
    </Shell>
  );
}
