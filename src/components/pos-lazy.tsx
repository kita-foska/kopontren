'use client';

import { lazy, Suspense } from 'react';

// The POS screen (~44 KB of JSX + state) is the heaviest client in the app.
// Loading it lazily keeps it out of the initial paint on low-end phones:
// the shell renders first, the POS chunk loads in the background.
const PosClient = lazy(
  () => import('@/components/pos-client').then((m) => ({ default: m.PosClient }))
);

export function PosLazy(props: { admin: boolean; cashier?: string }) {
  return (
    <Suspense
      fallback={
        <div className="grid h-64 place-items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        </div>
      }
    >
      <PosClient {...props} />
    </Suspense>
  );
}
