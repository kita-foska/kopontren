/**
 * W8-1 (Q72) -- GET /api/audit/anomalies -- deteksi anomali audit_log.
 *
 * Tier 'audit' (admin/pengurus). READ-ONLY: baca <=350 baris audit_log
 * terbaru, jalankan detectAnomalies (pure lib), kembalikan flags.
 * Cache 60 dtk (ref-cache prefix 'audit:anomalies') agar refresh tidak
 * menembus Turso berulang; dibuang saat purge audit (invalidate 'audit:').
 *
 * Respons: { flags: AnomalyFlag[], as_of, analyzed_count }.
 * 0 schema change. 0 fiqih (reporting murni).
 */
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { cached } from '@/lib/ref-cache';
import {
  detectAnomalies,
  type AuditLogRow,
  type AnomalyFlag,
} from '@/lib/audit-anomaly';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'audit'))
    return NextResponse.json({ error: 'Hanya admin/pengurus' }, { status: 403 });
  const url = new URL(req.url);
  // Cap 350 baris (target Rows Read; A1 butuh jendela 60 mnt -- 350 baris
  // cukup utk 90 hari aktivitas normal; bila lebih, window masih terisi).
  const limit = Math.min(350, Math.max(1, Number(url.searchParams.get('limit')) || 350));
  const asOf = new Date().toISOString();
  const d = await db();
  const rows = (await d
    .prepare(
      `SELECT id, action, table_name, record_id, old_value, new_value, user_name, created_at
       FROM audit_log ORDER BY id DESC LIMIT ?`
    )
    .all(limit)) as unknown as AuditLogRow[];
  // Cache 60 dtk: deteksi = fungsi deterministik dari 350 baris terakhir;
  // TTL cukup (multi-instance Vercel tidak saling invalidate, backstop).
  const flags = await cached('audit:anomalies:350', async (): Promise<AnomalyFlag[]> =>
    detectAnomalies(rows)
  );
  return NextResponse.json({ flags, as_of: asOf, analyzed_count: rows.length });
}

