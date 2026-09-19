'use client';

import { useMemo } from 'react';

export type DailyPoint = { day: string; c: number; t: number };

/** n label hari kalender WIB (YYYY-MM-DD), dari hari ke-n…hari ini. */
function wibDayLabels(n: number): string[] {
  const out: string[] = [];
  const wibNow = new Date(Date.now() + 7 * 3600 * 1000);
  const todayMs = Date.UTC(
    wibNow.getUTCFullYear(),
    wibNow.getUTCMonth(),
    wibNow.getUTCDate()
  );
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(todayMs - i * 86400000);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate()
      ).padStart(2, '0')}`
    );
  }
  return out;
}

function wibShort(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  }).format(dt);
}

/**
 * Chart batang penjualan per-hari (CSS murni, responsif, tanpa dependensi).
 * - Hari tanpa penjualan tetap ter-render (baseline tipis) agar sumbu-x utuh.
 * - Anomali: bar > mean + 1,5σ (kuning) atau hari kosong saat ada penjualan
 *   lain (abu-abu) — hanya ditampilkan utk periode >= 14 hari.
 */
export function SalesBarChart({
  points,
  days,
}: {
  points: DailyPoint[];
  days: number;
}) {
  const bars = useMemo(() => {
    const map = new Map(points.map((p) => [p.day, p] as const));
    return wibDayLabels(Math.max(1, days)).map((day) => {
      const p = map.get(day);
      return { day, c: p?.c ?? 0, t: p?.t ?? 0 };
    });
  }, [points, days]);

  const { mean, std, max } = useMemo(() => {
    const vals = bars.map((b) => b.t);
    const mx = Math.max(1, ...vals);
    const m = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length || 1));
    return { mean: m, std: sd, max: mx };
  }, [bars]);

  const showAnom = days >= 14 && std > 0;
  const step = days <= 10 ? 1 : days <= 31 ? Math.ceil(days / 8) : Math.ceil(days / 12);

  return (
    <div>
      <div className="flex h-40 items-end gap-[2px] sm:h-48">
        {bars.map((b) => {
          const hPct = (b.t / max) * 100;
          const isAnom = showAnom && b.t > mean + 1.5 * std;
          const isZero = b.t === 0 && mean > 0;
          const cls = isAnom
            ? 'bg-amber-400'
            : isZero
              ? 'bg-slate-300 dark:bg-navy-600'
              : 'bg-accent-500 dark:bg-accent-400';
          return (
            <div key={b.day} className="h-full flex-1" title={`${wibShort(b.day)}: Rp ${b.t.toLocaleString('id-ID')} (${b.c} transaksi)`}>
              <div
                className={`chart-bar w-full rounded-t-sm ${cls}`}
                style={{ height: `${b.t > 0 ? Math.max(3, hPct) : 1}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {bars.map((b, i) => (
          <div key={b.day} className="flex-1 text-center text-[9px] font-semibold text-slate-400 dark:text-slate-500">
            {i % step === 0 ? wibShort(b.day) : ''}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent-500" /> Normal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Anomali (&gt;1,5σ)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-navy-600" /> Tanpa penjualan
        </span>
        {showAnom && (
          <span className="text-slate-400 dark:text-slate-500">
            rata-rata Rp {Math.round(mean).toLocaleString('id-ID')}/hari
          </span>
        )}
      </div>
    </div>
  );
}