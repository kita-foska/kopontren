// W16-C (26 Okt 2026): monitoring web-vitals PRODUCTION-ONLY.
// Pakai built-in `useReportWebVitals` dari 'next/web-vitals' --
// pustaka web-vitals ter-compile di next/dist (tanpa dependency npm
// 'web-vitals' anyar, sesuai ruling GO CODE W16-C).
//
// Metrik yang dilacak (console log, tanpa endpoint): CLS, FCP, LCP,
// INP, TTFB. Guard `process.env.NODE_ENV` = compile-time pada client
// bundle: dev server bebas noise, hanya production yang logging.
//
// Mount: <WebVitalsReporter /> di <body> layout.tsx (semua halaman).
// Komponen render null (tanpa DOM) -- hanya subscribe metrik.
'use client'

import { useReportWebVitals } from 'next/web-vitals';

const TRACKED_METRICS = ['CLS', 'FCP', 'LCP', 'INP', 'TTFB'];

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== 'production') return;
    if (TRACKED_METRICS.indexOf(metric.name) === -1) return;
    console.log(
      '[web-vitals] ' +
        metric.name +
        ' = ' +
        metric.value +
        (metric.delta ? ' (delta ' + metric.delta + ')' : '') +
        ' [rating=' +
        metric.rating +
        ']',
    );
  });
  return null;
}
