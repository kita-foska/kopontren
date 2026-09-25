import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { countPointHistory, queryPointHistory } from '@/lib/points';

/**
 * GET /api/members/[id]/points?limit=&offset= — riwayat ledger
 * poin & reward satu member (tabel point_history, BACA-SAJA).
 *
 * Dipakai halaman /admin/member (tier 'member': admin/manajer — halaman
 * itu sendiri guarded tier 'member', jadi endpoint disamakan). Guard
 * lebih ketat dari GET /api/members (tier 'pos'): detail ledger per-member
 * = data PII member, kasir tak perlu.
 *
 * Tanpa cache: ledger tertulis tiap transaksi POS & penghapusan transaksi;
 * saldo basi menyesatkan. Limit default 20, maks 50 — Rows Read aman
 * (WHERE member_id ber-index idx_point_history_member; COUNT kecil).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'member'))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const p = await params;
  const id = Number(p.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: 'ID member tidak valid' }, { status: 400 });

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  try {
    const d = await db();
    const member = (await d
      .prepare('SELECT id FROM members WHERE id = ?')
      .get(id)) as { id: number } | undefined;
    if (!member)
      return NextResponse.json({ error: 'Member tidak ditemukan' }, { status: 404 });
    const entries = await queryPointHistory(d, id, limit, offset);
    const total = await countPointHistory(d, id);
    return NextResponse.json({ ok: true, entries, total, limit, offset });
  } catch {
    // Pola /api/neraca (24 Sep): exception tak tertangani (mis. DB
    // transien) dulu bocor sebagai HTML 500 — klien api() salah bacanya
    // sebagai "Kesalahan jaringan." Tangkap global -> balas JSON 500
    // dgn pesan jelas; klien menampilkan pesan + tombol muat ulang.
    return NextResponse.json(
      { error: 'Gagal memuat riwayat poin. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}