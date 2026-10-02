/**
 * F3.4+ W2.2 -- API Laporan Formal (baca): GET /api/laporan/formal
 *
 * Dispatch `?report=...` + tier `laporan` (admin/manajer/pengurus) +
 * cache 60 dtk + periode WIB. W2.2 menerbitkan report `posisi`
 * (Laporan Posisi Keuangan formal, Sek.5.1); W2.3 menambah report `lka`
 * (Laporan Laba-Rugi formal, Sek.5.2); W2.4 menambah report `lpe`
 * (Laporan Perubahan Ekuitas formal, Sek.5.3); W2.5 menambah report
 * `lak` (Laporan Arus Kas formal, Sek.5.4); W2.6 menambah report
 * `calk` (CALK -- Catatan atas Laporan Keuangan, template Sek.5.5).
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
import { buildLpe } from '@/lib/laporan/lpe';
import { buildLak } from '@/lib/laporan/lak';
import { buildCalk } from '@/lib/laporan/calk';
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

const LPE_NOTES: string[] = [
  'Laporan Perubahan Ekuitas kumulatif s.d. as_of (entry_date < batas), struktur Sek.5.3; kolom = 7 akun ekuitas 30xx (3010-3070).',
  'D=K (rekon #15 JOURNAL_BAL): bila flag_rekon15=true, angka formal TIDAK dianggap otoritatif -- periksa cek JOURNAL_BAL di /admin/rekonsiliasi.',
  'Alur: Saldo awal (opening) + SHU (closing ke 3020) + Alokasi SHU (coop: 3020 -> 3030/3040/3050/3060) - Distribusi = Saldo akhir.',
  'Distribusi (SHU dibagi ke anggota) TERTANGGUNG pada Alokasi (3050 jasa anggota + 3060 dibagi, Sek.13.4); baris Distribusi sendiri = placeholder 0 (modul distribusi menyusul, W2.6).',
  'Simpanan 2050/2060/2070 = kewajiban anggota, TIDAK ekuitas -- dipapar sebagai memo kaki, TIDAK dijumlahkan ke total ekuitas.',
  'Nama kolom 30xx dikandung modul (LPE_COLUMNS); 3020-3070 masih status pending di COA (Kolom 1/2 Sek.4.2).',
  'Cache 60 detik (TTL backstop); mutasi GL tidak otomatis meng-invalidate -- tunggu TTL atau tekan Muat ulang.',
];

const LAK_NOTES: string[] = [
  'Laporan Arus Kas kumulatif s.d. as_of (entry_date < batas), struktur Sek.5.4; klasifikasi per entri sesuai akun lawan (investasi/pendanaan/operasional).',
  'D=K (rekon #15 JOURNAL_BAL): bila flag_rekon15=true, angka formal TIDAK dianggap otoritatif -- periksa cek JOURNAL_BAL di /admin/rekonsiliasi.',
  'Kas usaha = 1010 + 1020; kas sosial/ZIS = 1100 TERPISAH -- tidak dicampur ke kas usaha (invariant rekon #16 GL_CASH, cek sendiri W5.2).',
  'Transfer antar-kas (1010<->1020) bukan aktivitas; pergeseran kas 1010/1020<->1100 tercatat di footer (pergeseran_kas_sosial) agar identitas footer tetap terpenuhi.',
  'Identitas footer: saldo_awal + neto_aktivitas + pergeseran_kas_sosial = saldo_akhir; per akun kas: penutup = pembuka + masuk - keluar + transfer.',
  'Rincian ZIS per akun lawan bersifat atribusi eksak (masuk/keluar per kode lawan, s.d. batas).',
  'Cache 60 detik (TTL backstop); mutasi GL tidak otomatis meng-invalidate -- tunggu TTL atau tekan Muat ulang.',
];

const CALK_NOTES: string[] = [
  'CALK (Catatan atas Laporan Keuangan) template Sek.5.5: item 1-3 (info entitas, struktur, kebijakan akuntansi) = teks panel + badge data; item 4-8 dari GL kumulatif s.d. as_of (entry_date < batas); item 9 (peristiwa pasca-periode) = input manual di panel, draft lokal (localStorage), TIDAK tersimpan di server.',
  'W2.6 GL-only (skema v21): tabel zis/akad belum ada -- ZIS per jenis adalah aproksimasi akun COA (4090/5100 menyatukan infak+sedekah; 6030 = zakat tijarah, memo syariah); W2.7 menambah pemisahan ZIS per jenis (kolom zis.kind); W3.3 menambah item 8 akad_ringkas (ringkasan per jenis dari tabel akad, modul W3.2).',
  'Wakaf (1120 aset + 6020 memo) TIDAK dijumlahkan ke total aset; simpanan 2050/2060/2070 = kewajiban anggota, TIDAK ekuitas (memo).',
  'Tanggal N buku pembuka (Sek.10) menunggu migrasi Wave 6 -- belum ada di aplikasi.',
  'D=K (rekon #15 JOURNAL_BAL): bila flag_rekon15=true, angka formal TIDAK dianggap otoritatif -- periksa cek JOURNAL_BAL di /admin/rekonsiliasi.',
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
  const supported = ['posisi', 'lka', 'lpe', 'lak', 'calk'];
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
      if (report === 'lak') {
        const lak = await buildLak(d, at);
        // as_of dikirim via ...lak (LakPayload.as_of = at); tak perlu duplikat.
        return { ...common, ...lak, notes: LAK_NOTES };
      }
      if (report === 'calk') {
        const calk = await buildCalk(d, at);
        // as_of dikirim via ...calk (CalkPayload.as_of = at); tak perlu duplikat.
        return { ...common, ...calk, notes: CALK_NOTES };
      }
      if (report === 'lpe') {
        const lpe = await buildLpe(d, at);
        // as_of dikirim via ...lpe (LpePayload.as_of = at); tak perlu duplikat.
        return { ...common, ...lpe, notes: LPE_NOTES };
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
      { error: 'Gagal memuat laporan formal. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}