/**
 * FASE A3 — Neraca Sederhana V1 (foto posisi per hari ini): GET /api/neraca
 *
 * Endpoint BARU (keputusan A3, pola FASE A1): /api/keuangan, /api/reports
 * & /api/kas TIDAK disentuh — mereka tetap milik fitur existing (P&L,
 * KPI, halaman Kas). Neraca = snapshot TANPA parameter periode: saldo
 * kas kumulatif, stok saat ini, tagihan terbuka. Rumus & catatan V1 →
 * src/lib/neraca.ts (queryNeraca + NERACA_NOTES; wajib terbaca sebelum
 * mengubah angka).
 *
 * Guard tier 'laporan' (sama dgn /api/keuangan & /api/rekap): hanya
 * admin/manajer/pengurus.
 *
 * Cache: 'neraca' 60 dtk (ref-cache; TTL global ref-cache). Route WRITE
 * TIDAK memanggil invalidate('neraca:') — TTL 60 dtk jadi backstop:
 * neraca paling lama basi ~60 dtk pasca-mutasi (pola sama dgn
 * 'keuangan:'). Snapshot neraca toleran basi; bila nanti agregat ini
 * dipakai realtime, baris invalidate cukup ditambah di route tulis
 * (belajar pola 'kas:').
 */
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { cached } from '@/lib/ref-cache';
import { NERACA_NOTES, queryNeraca } from '@/lib/neraca';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });

  try {
    const payload = await cached('neraca', async () => {
      const d = await db();
      const p = await queryNeraca(d);
      return { ok: true, ...p, notes: NERACA_NOTES };
    });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Turso/Vercel exception tak tertangani (mis. DB transien) dulu bocor
    // sebagai halaman HTML 500; klien api() salah baca HTML tsb sebagai
    // "Kesalahan jaringan." (sebenarnya server error). Tangkap global →
    // balas JSON 500 dengan pesan jelas; client menampilkan r.error +
    // tombol "Muat ulang." Cache sukses terakhir tetap backstop (TTL 60 dtk).
    return NextResponse.json({ error: 'Gagal memuat neraca. Silakan coba lagi.' }, { status: 500 });
  }
}