/**
 * P0-C3 — Rekonsiliasi data (read-only, flag-only): GET /api/reconciliation
 *
 * Endpoint BARU (P0-C3): memverifikasi konsistensi finansial antar
 * modul (penjualan vs pembayaran, kas/shif, stok/retur, piutang/hutang,
 * ledger poin/reward, konsinyasi) TANPA pernah memperbaiki data —
 * selisih dilaporkan sebagai drift + detail baris. Daftar 13 cek &
 * rumus → src/lib/rekonsiliasi.ts (queryRekonsiliasi +
 * REKONSILIASI_NOTES; wajib terbaca sebelum mengubah angka).
 *
 * Guard tier 'laporan' (sama dgn /api/neraca, /api/keuangan,
 * /api/rekap): hanya admin/manajer/pengurus.
 *
 * Cache: 'rekonsiliasi' 60 dtk (ref-cache; TTL global). Read-only,
 * route tulis TIDAK perlu invalidate — backstop TTL 60 dtk pasca
 * mutasi (pola sama dgn 'neraca').
 */
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { cached } from '@/lib/ref-cache';
import { REKONSILIASI_NOTES, queryRekonsiliasi } from '@/lib/rekonsiliasi';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });

  try {
    const payload = await cached('rekonsiliasi', async () => {
      const d = await db();
      const p = await queryRekonsiliasi(d);
      return { ok: true, ...p, notes: REKONSILIASI_NOTES };
    });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // DB exception tak tertangani (mis. Turso transien) dulu bocor
    // sebagai halaman HTML 500 → klien salah baca. Tangkap global →
    // JSON 500 dgn pesan jelas; klien menampilkan error + muat ulang.
    // (Pola sama dgn /api/neraca.)
    return NextResponse.json({ error: 'Gagal memuat rekonsiliasi. Silakan coba lagi.' }, { status: 500 });
  }
}
