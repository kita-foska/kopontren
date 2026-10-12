import { NextResponse } from 'next/server';
import { db } from '@/db';
import { currentUser } from '@/lib/auth';
import { wibToday } from '@/lib/zakat-period';
import {
  EKSPOR_JENIS,
  buildKoperasiCsv,
  buildPoinCsv,
  buildTransaksiCsv,
  coopMemberIdsQuery,
  koperasiQuery,
  poinQuery,
  transaksiQuery,
  type EksporHasil,
  type EksporKoperasiRow,
  type EksporPoinRow,
  type EksporTransaksiRow,
} from '@/lib/member/ekspor-csv';

/**
 * P3c -- Unduhan CSV "Unduh Data Saya" (sisi pengguna, SELF-SCOPE):
 * GET /api/members/ekspor?jenis=poin|transaksi|koperasi[&csv=1]
 *
 * Guard: 401 bila belum login; 404 bila users.member_id kosong / kartu
 * tak ditemukan; 400 bila jenis tak valid. Data selalu milik kartu
 * pengguna sendiri (anti-bocor lintas member):
 *  - poin/transaksi: ledger point_history & sales terikat member_id.
 *  - koperasi: pinjaman dicocokkan dari NAMA lewat coop_members
 *    (pola P1c: entitas terpisah, lower(trim(name))), lalu hanya
 *    pinjaman atas id anggota koperasi tersebut.
 * Output: SELALU CSV + BOM, tanggal WIB, header Indonesia, tanpa
 * emoji. Tanpa batas baris (keputusan D3: data per-member kecil).
 * (Param csv=1 = konvensi helper P3d; endpoint memang hanya CSV.)
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });

  const d = await db();

  // 1) Relasi user -> kartu member (self-scope; boleh NULL).
  const link = (await d
    .prepare('SELECT member_id FROM users WHERE id = ?')
    .get(user.id)) as { member_id: number | null } | undefined;
  if (!link?.member_id)
    return NextResponse.json(
      { error: 'Kartu keanggotaan belum terhubung ke akun ini.' },
      { status: 404 },
    );

  // 2) Jenis valid (guard 400).
  const jenis = new URL(req.url).searchParams.get('jenis');
  if (!jenis || !(EKSPOR_JENIS as readonly string[]).includes(jenis))
    return NextResponse.json(
      { error: "jenis harus 'poin', 'transaksi', atau 'koperasi'" },
      { status: 400 },
    );

  // 3) Baris kartu (butuh name utk pencocokan koperasi).
  const member = (await d
    .prepare('SELECT id, name FROM members WHERE id = ?')
    .get(link.member_id)) as { id: number; name: string } | undefined;
  if (!member)
    return NextResponse.json({ error: 'Kartu keanggotaan tidak ditemukan.' }, { status: 404 });

  // 4) Query per jenis (string query SATU sumber dari modul hermetis).
  let out: EksporHasil;
  if (jenis === 'koperasi') {
    const qId = coopMemberIdsQuery(member.name);
    const matches = (await d.prepare(qId.sql).all(...qId.args)) as unknown as {
      id: string;
    }[];
    let rows: EksporKoperasiRow[] = [];
    if (matches.length > 0) {
      const q = koperasiQuery(matches.map((m) => m.id));
      rows = (await d.prepare(q.sql).all(...q.args)) as unknown as EksporKoperasiRow[];
    }
    out = buildKoperasiCsv(rows, wibToday());
  } else if (jenis === 'transaksi') {
    const q = transaksiQuery(member.id);
    const rows = (await d.prepare(q.sql).all(...q.args)) as unknown as EksporTransaksiRow[];
    out = buildTransaksiCsv(rows, wibToday());
  } else {
    const q = poinQuery(member.id);
    const rows = (await d.prepare(q.sql).all(...q.args)) as unknown as EksporPoinRow[];
    out = buildPoinCsv(rows, wibToday());
  }

  return new Response(out.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${out.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
