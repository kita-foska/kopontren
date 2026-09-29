import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { TUTORIALS } from '@/lib/tutorial-data';

export const dynamic = 'force-dynamic';

/**
 * T2: landing /tutorial — grid 8 kartu (salinan docs/*.html di public/tutorial/).
 * Guard: level 'personal' = semua role (mirror MENU_ITEMS sidebar).
 */
export default async function TutorialLandingPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canAccess(user, 'personal')) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        <span className="text-accent-500 dark:text-accent-300">Tutorial</span> &amp; Panduan
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        SOP dan dokumentasi aplikasi Kopontren. Konten berasal dari docs/ (disinkronkan via
        scripts/sync-tutorial.mjs).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {TUTORIALS.map((t) => (
          <Link
            key={t.slug}
            href={`/tutorial/${t.slug}`}
            prefetch
            className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-accent-500 dark:border-navy-600 dark:bg-navy-800 dark:hover:border-accent-500"
          >
            <h2 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">{t.title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.desc}</p>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
