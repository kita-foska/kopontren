/**
 * F3.4+ W2.2 -- API Laporan Formal (baca): GET /api/laporan/formal
 *
 * Dispatch `?report=...` + tier `laporan` (admin/manajer/pengurus) +
 * cache 60 dtk + periode WIB. W2.2 menerbitkan report `posisi`
 * (Laporan Posisi Keuangan formal, Sek.5.1); W2.3 menambah report `lka`
 * (Laporan Laba-Rugi formal, Sek.5.2). Report lain (LPE, LAK, CALK)
 * menyusul wave berikutnya -- dispatch disiapkan.
 *
 * `?as_of=YYYY-MM-DD` = tanggal laporan WIB (default = hari ini WIB).
 * Batas kumulatif `at` = akhir hari `as_of` (entry_date < at).
 *
 * D=K (rekon #15 JOURNAL_BAL): `flag_rekon15=true` bila SUM(debit) tak
 * sama SUM(credit) s.d. `at` -- klien menolak render angka formal +
 * flag ke /admin/rekonsiliasi (cek JOURNAL_BAL).
 *
 * Cache: ref-cache prefix 'lapformal:' (TTL 60 dtk backstop) - key
 * 'lapformal:posisi:<at>'. Multi-instance Vercel mengandalkan TTL.
 */
import { NextResponse } from 'next/server';
import { db, getSettings } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { cached } from '@/lib/ref-cache';
import { buildPosisi } from '@/lib/laporan/posisi';
import { buildLka } from '@/lib/laporan/lka';
import { wibToday } from '@/lib/zakat-period';

export const FORMAL_NOTES: string[] = [
  'Laporan Posisi (Neraca) kumulatif s.d. as_of (entry_date < batas), struktur Sek.5.1.',
  'D=K (rekon #15 JOURNAL_BAL): bila flag_rekon15=true, angka formal TIDAK dianggap otoritatif -- periksa cek JOURNAL_BAL di /admin/rekonsiliasi.',
  'Laba/rugi berjalan (SUM 4xxx - SUM 5xxx) belum ditutup ke 3020; penutupan manual periodik (jurnal closing, Sek.3.2.6).',
  'Wakaf (1120 + 6020) bersifat memo dan TIDAK dijumlahkan ke total aset.',
  'Cache 60 detik (TTL backstop); mutasi GL tidak otomatis meng-invalidate laporan -- tunggu TTL (60 dtk) atau tekan Muat ulang.',
];

const LKA_NOTES: string[] = [
  'Laporan Laba-Rugi kumulatif s.d. as_of (entry_date < batas), struktur Sek.5.2.',
  'D=K (rekon #15 JOURNAL_BAL): bila flag_rekon15=true, angka formal TIDAK dianggap otoritatif -- periksa cek JOURNAL_BAL di /admin/rekonsiliasi.',
  'Laba/rugi berjalan (SUM 4xxx - SUM 5xxx) belum ditutup ke 3020; penutupan manual periodik (jurnal closing, Sek.3.2.6).',
  'MEMO (ujrah konsinyasi 4040, cashback 2030, SHU 3020) TIDAK dijumlahkan ke laba bersih.',
  'Akun 5050 (denda) TIDAK AKTIF (F3.3 #6: tidak ada skema denda); tidak dihitung ke Beban.',
  'Cache 60 detik (TTL backstop); mutasi GL tidak otomatis meng-invalidate -- tunggu TTL atau tekan Muat ulang.',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** as_of 'YYYY-MM-DD' -> batas eksklusif akhir hari (YYYY-MM-DD + 1). */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });

  const url = new URL(req.url);
  const report = (url.searchParams.get('report') ?? 'posisi').trim();
  const supported = ['posisi', 'lka'];
  if (!supported.includes(report))
    return NextResponse.json(
      { error: 'report "' + report + '" belum tersedia', supported },
      { status: 400 }
    );

  let asOf = (url.searchParams.get('as_of') ?? '').trim();
  if (!DATE_RE.test(asOf) || Number.isNaN(Date.parse(asOf + 'T00:00:00Z')))
    asOf = wibToday();

  try {
    // `at` dihitung di dalam try: nextDay() dapat melempar RangeError pada
    // tanggal invalid; selalu tertangkap -> balas JSON 500, bukan HTML 500.
    const at = nextDay(asOf);
    const payload = await cached('lapformal:' + report + ':' + at, async () => {
      const d = await db();
      const coa = (await d
        .prepare('SELECT code, name, "group" FROM coa WHERE status = ? ORDER BY code')
        .all('open')) as { code: string; name: string; group: string }[];
      const s = await getSettings();
      const common = {
        ok: true,
        report,
        gl_enabled: s.gl_enabled === '1',
        coop_registered: s.coop_registered === '1',
        coa,
      };
      if (report === 'lka') {
        const lka = await buildLka(d, at);
        // as_of dikirim via ...lka (LkaPayload.as_of = at); tak perlu duplikat.
        return { ...common, ...lka, notes: LKA_NOTES };
      }
      const posisi = await buildPosisi(d, at);
      // as_of dikirim via ...posisi (PosisiPayload.as_of = at); tak perlu duplikat.
      return { ...common, ...posisi, notes: FORMAL_NOTES };
    });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Turso/Vercel exception tak tertangani dulu bocor sebagai halaman HTML
    // 500; klien api() salah baca HTML tsb. Tangkap global balas JSON 500
    // (pola /api/gl); cache sukses terakhir tetap backstop.
    return NextResponse.json(
      { error: 'Gagal memuat Laporan Posisi. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}