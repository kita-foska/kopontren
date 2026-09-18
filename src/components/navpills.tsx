'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavPills({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="flex gap-1.5 whitespace-nowrap">
      {items.map((it) => {
        const active =
          it.href === '/'
            ? pathname === '/'
            : pathname === it.href || pathname.startsWith(it.href + '/');
        return (
          <Link
            key={it.href}
            href={it.href}
            className={
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition ' +
              (active
                ? 'bg-accent-500 text-white shadow'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700')
            }
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
