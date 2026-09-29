import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { tutorialBySlug } from '@/lib/tutorial-data';

export const dynamic = 'force-dynamic';

/**
 * T2: viewer /tutorial/[slug] — header + iframe statis (public/tutorial/<slug>.html).
 * Guard: level 'personal' (semua role) + validasi slug dari TUTORIALS.
 */
export default async function TutorialViewerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canAccess(user, 'personal')) redirect(roleHome(user.role));
  const t = tutorialBySlug(slug);
  if (!t) notFound();
  return (
    <Shell user={user}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link
          href="/tutorial"
          prefetch
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-accent-500 hover:text-accent-500 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 dark:hover:border-accent-500 dark:hover:text-accent-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Tutorial
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">{t.title}</h1>
      </div>
      <TutorialFrame slug={t.slug} title={t.title} />
    </Shell>
  );
}

/**
 * Iframe statis: konten public/tutorial/<slug>.html adalah salinan byte-exact
 * dari docs/ — 0 script tag, CSS inline self-contained, jadi sandbox
 * allow-same-origin sudah cukup (tanpa allow-scripts: konten tetap inert).
 * Catatan (Option C diterima): halaman dokumen tetap light; tidak mengikuti
 * tema dark aplikasi.
 */
function TutorialFrame({ slug, title }: { slug: string; title: string }) {
  return (
    <iframe
      src={`/tutorial/${slug}.html`}
      title={title}
      sandbox="allow-same-origin"
      className="h-[calc(100dvh-150px)] min-h-[480px] w-full rounded-xl border border-slate-200 bg-white dark:border-navy-600"
    />
  );
}
