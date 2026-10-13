import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { TermTip } from '@/components/ui';
import type { KpiDelta } from '@/lib/format';

/**
 * KpiCard + KpiGrid (UI/UX P1): KPI tile bersama utk dashboard admin &
 * pengurus. Komponen server (tanpa hook/handler) -> aman utk RSC;
 * TermTip (client, dari ui.tsx) dirender sebagai anak.
 *
 * Kebijakan warna (UX-4, tanpa token baru):
 * - token role semantik dari tailwind.config.ts:
 *   success = emerald, risk = rose, attention = amber, info = blue;
 * - identitas maroon (skala accent) tetap utk warna nilai KPI;
 * - slate netral utk tone 'flat'.
 */
export type KpiCardDef = {
  label: string;
  value: string;
  sub?: string;
  href: string;
  icon: ReactNode;
  warn?: boolean;
  delta?: KpiDelta & { tip: string };
};

export function KpiCard({
  label,
  value,
  sub,
  href,
  icon,
  warn,
  delta,
}: KpiCardDef) {
  return (
    <Link
      href={href}
      className={
        'group card fade-up relative flex flex-col justify-between p-4 tile-hover border-slate-200/80 hover:border-accent-400/50 dark:border-navy-700 ' +
        (warn ? 'border-attention-500/60 ring-1 ring-attention-500/30' : '')
      }
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="card-label truncate">{label}</span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-black/5 transition group-hover:scale-110 dark:bg-navy-900/90 dark:ring-white/10">
            {icon}
          </span>
        </div>
        <p className="mt-2 text-2xl font-extrabold tracking-tight text-accent-600 dark:text-accent-300">
          {value}
        </p>
      </div>
      <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-navy-700/60">
        <div className="flex items-center justify-between gap-1 text-xs">
          <p className="truncate text-slate-500 dark:text-slate-400">{sub}</p>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100 group-hover:text-accent-500" />
        </div>
        {delta && (
          <p
            className={
              'mt-1 text-xs font-bold tabular-nums ' +
              (delta.tone === 'down'
                ? 'text-risk-600 dark:text-risk-400'
                : delta.tone === 'flat'
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'text-success-600 dark:text-success-400')
            }
          >
            <TermTip tip={delta.tip}>{delta.text}</TermTip>
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * KpiGrid: tata letak kartu KPI. Default = 1 kolom (<360px) /
 * 2 kolom (360px s.d. 1023px) / 3 kolom (lg) -- menstandarkan grid
 * dashboard admin & pengurus (keputusan P1; polish mobile: kartu KPI
 * tidak cekik di layar kecil). `cols` utk override jumlah kolom lg
 * (mis. 'lg:grid-cols-5').
 */
export function KpiGrid({ cards, cols }: { cards: KpiCardDef[]; cols?: string }) {
  return (
    <div className={'grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 ' + (cols ?? 'lg:grid-cols-3')}>
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} />
      ))}
    </div>
  );
}