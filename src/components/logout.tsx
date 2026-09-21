'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * Tombol keluar. Di HP: ikon saja (hemat space header agar brand tidak
 * terpotong); mulai sm: teks "Keluar" seperti sebelumnya.
 */
export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }
  return (
    <button
      onClick={logout}
      title="Keluar"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 sm:h-auto sm:w-auto sm:rounded-full sm:px-3 sm:py-1.5 sm:text-xs sm:font-bold dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">Keluar</span>
    </button>
  );
}
