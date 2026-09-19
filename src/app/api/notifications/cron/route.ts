import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { currentUser, isAdmin } from '@/lib/auth';
import { runCron } from '@/lib/notify';

/**
 * POST /api/notifications/cron — jalankan pekerjaan terjadwal.
 * Query ?job= due|daily|weekly|monthly|all (default: due).
 *
 * Otorisasi (aman secara default):
 *  1. Jika env CRON_SECRET di-set DAN header `x-cron-secret` cocok ->
 *     diizinkan tanpa sesi (untuk scheduler eksternal: Vercel Cron /
 *     crontab / GitHub Actions).
 *  2. Selain itu, wajib login sebagai admin.
 * Idempotent harian via marker settings — aman dipanggil > 1x/hari.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get('x-cron-secret') || '';
    // Perbandingan constant-time (timing-safe) utk secret.
    const a = Buffer.from(provided);
    const s = Buffer.from(secret);
    const match = a.length === s.length && crypto.timingSafeEqual(a, s);
    if (match) {
      const job = new URL(req.url).searchParams.get('job') || 'due';
      const res = await runCron(job);
      return NextResponse.json({ ok: true, source: 'cron-secret', ...(res as object) });
    }
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const job = new URL(req.url).searchParams.get('job') || 'due';
  const res = await runCron(job);
  return NextResponse.json({ ok: true, ...(res as object) });
}

