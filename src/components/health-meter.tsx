import {
  healthMeterRows,
  healthScore,
  healthScoreTone,
  type HealthCard,
  type HealthTone,
} from '@/lib/health';

/**
 * W14-3 HEALTH METER (dashboard pengurus, 26 Okt 2026): speedometer SVG
 * (busur 180 derajat, 3 zona -- merah 0-39 / amber 40-89 / hijau 90-100 --
 * jarum + busur progres) + 3 baris rasio (Database / Backup / Push) +
 * drill-down ke /admin/health (P9: angka punya sumber).
 *
 * Komponen server-safe: murni SVG statis dari prop (tanpa 'use client',
 * tanpa hook -- render identik di server & klien, tanpa hydration issue).
 * Logika skor/zone/baris = src/lib/health.ts (pure; diuji suite 44).
 * Semua ikon = inline SVG; 0 emoji/unicode (gate).
 * W15 P1 polish visual: jarum melayang (radius 38->58, tak menembus teks
 * skor), tick batas zona 0/40/90/100, skor amber dapat dark variant.
 */

/** Warna zona (token tailwind: success=emerald, amber, rose). */
const ZONE_HEX: Record<ReturnType<typeof healthScoreTone>, string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#f43f5e',
};

/** Label zona (bahasa awam, P15 komunikatif). */
const ZONE_LABEL: Record<ReturnType<typeof healthScoreTone>, string> = {
  green: 'Sehat',
  amber: 'Perhatian',
  red: 'Gangguan',
};

/** Warna teks per tone kartu (alias tema: success dkk.). */
const TONE_TEXT: Record<HealthTone, string> = {
  good: 'text-success-600 dark:text-success-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-rose-600 dark:text-rose-400',
};

/** Titik pada busur: skor 0..100 -> koordinat viewBox 200x110 (pusat 100,100). */
function pointAt(score: number, radius: number): { x: number; y: number } {
  const a = (Math.PI * Math.max(0, Math.min(100, score))) / 100;
  return { x: 100 - radius * Math.cos(a), y: 100 - radius * Math.sin(a) };
}

/** Path busur zona (busur atas; sweep=1 dari kiri ke kanan). */
function arcPath(fromScore: number, toScore: number): string {
  const p0 = pointAt(fromScore, 80);
  const p1 = pointAt(toScore, 80);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A 80 80 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

export interface HealthMeterProps {
  /** 7 kartu kesehatan (buildHealthCards, kolektor shared W14-3). */
  cards: HealthCard[];
  /** Link drill-down ke sumber detail (P9); kosongkan bila tak layak. */
  drillHref?: string;
  /** Teks kecil pengganti link (mis. 'hanya admin') bila drillHref kosong. */
  drillNote?: string;
}

export function HealthMeter({ cards, drillHref, drillNote }: HealthMeterProps) {
  const score = healthScore(cards);
  const tone = healthScoreTone(score);
  const rows = healthMeterRows(cards);
  // W15 P1: jarum "melayang" (segmen radius 38->58, tidak lagi dari pusat)
  // agar saat skor 35..65 (jarum hampir vertikal) tidak menembus teks skor
  // besar di tengah gauge (baseline y=84, tinggi font 26).
  const needleTip = pointAt(score, 58);
  const needleBase = pointAt(score, 38);
  const progressEnd = pointAt(score, 80);
  const toneCls =
    tone === 'green'
      ? 'text-success-600 dark:text-success-400'
      : tone === 'amber'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';

  return (
    <section
      aria-label={`Kesehatan sistem: skor ${score} dari 100, ${ZONE_LABEL[tone]}`}
      className="flex flex-col gap-4 sm:flex-row sm:items-center"
    >
      {/* -- Speedometer (busur 180 derajat + 3 zona + jarum + progres) -- */}
      <div className="flex shrink-0 flex-col items-center">
        <svg
          viewBox="0 0 200 110"
          className="w-52 sm:w-60"
          role="img"
          aria-label={`Speedometer kesehatan: skor ${score} dari 100`}
        >
          <title>{`Skor kesehatan sistem: ${score} dari 100`}</title>
          <path d={arcPath(0, 40)} fill="none" stroke={ZONE_HEX.red} strokeOpacity="0.25" strokeWidth="10" />
          <path d={arcPath(40, 90)} fill="none" stroke={ZONE_HEX.amber} strokeOpacity="0.25" strokeWidth="10" />
          <path d={arcPath(90, 100)} fill="none" stroke={ZONE_HEX.green} strokeOpacity="0.25" strokeWidth="10" />
          {score > 0 && (
            <path
              d={`M 20 100 A 80 80 0 0 1 ${progressEnd.x.toFixed(2)} ${progressEnd.y.toFixed(2)}`}
              fill="none"
              stroke={ZONE_HEX[tone]}
              strokeWidth="10"
              strokeLinecap="round"
            />
          )}
          {/* W15 P1: tick batas zona (0/40/90/100) -- garis pendek di dalam
              pita zona agar awam mudah membaca batas antara zona. */}
          {[0, 40, 90, 100].map((v) => {
            const t0 = pointAt(v, 66);
            const t1 = pointAt(v, 72);
            return (
              <line
                key={`tick-${v}`}
                x1={t0.x}
                y1={t0.y}
                x2={t1.x}
                y2={t1.y}
                stroke="currentColor"
                strokeWidth="2"
                className="text-slate-400 dark:text-slate-500"
              />
            );
          })}
          {[0, 40, 90, 100].map((v) => {
            const p = pointAt(v, 92);
            return (
              <text
                key={v}
                x={p.x}
                y={p.y + 3}
                textAnchor="middle"
                fontSize="8"
                className="fill-slate-400 dark:fill-slate-500"
              >
                {v}
              </text>
            );
          })}
          <line
            x1={needleBase.x}
            y1={needleBase.y}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className={toneCls}
          />
          <circle cx="100" cy="100" r="4" className="fill-slate-600 dark:fill-slate-300" />
          <text
            x="100"
            y="84"
            textAnchor="middle"
            fontSize="26"
            fontWeight="800"
            className={
              tone === 'green'
                ? 'fill-success-600 dark:fill-success-400'
                : tone === 'amber'
                  ? 'fill-amber-500 dark:fill-amber-400'
                  : 'fill-rose-500'
            }
          >
            {score}
          </text>
          <text x="100" y="96" textAnchor="middle" fontSize="8" className="fill-slate-400 dark:fill-slate-500">
            dari 100
          </text>
        </svg>
        <span className={`mt-1 text-xs font-bold uppercase tracking-wider ${toneCls}`}>
          {ZONE_LABEL[tone]}
        </span>
      </div>

      {/* -- 3 baris rasio + drill-down (P9) -- */}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold">Kesehatan Sistem</h3>
        <ul className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-xs sm:text-sm">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  r.tone === 'good' ? 'bg-success-500' : r.tone === 'warn' ? 'bg-amber-500' : 'bg-rose-500'
                }`}
              />
              <span className="w-16 shrink-0 font-semibold">{r.label}</span>
              <span className={`font-bold tabular-nums ${TONE_TEXT[r.tone]}`}>{r.value}</span>
              <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">{r.sub}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {drillHref ? (
            <>
              Detail 7 kartu (DB, koneksi, versi, cache, log, backup, notifikasi):{' '}
              <a
                href={drillHref}
                className="font-bold text-accent-600 underline hover:no-underline dark:text-accent-400"
              >
                Kesehatan Sistem
              </a>
            </>
          ) : (
            drillNote ?? 'Detail 7 kartu tersedia di /admin/health.'
          )}
        </p>
      </div>
    </section>
  );
}
