/**
 * F3.4+ W1.4 - API GL (baca): GET /api/gl
 *
 * Endpoint satu GET utk dua halaman admin: /admin/gl (neraca saldo) &
 * /admin/jurnal (daftar entry + manual + pembalikan; tulis via
 * POST /api/jurnal). Guard tier 'laporan' (admin/manajer/pengurus),
 * sama dgn /api/neraca.
 *
 * Periode: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (to EKSKLUSIF, ISO WIB,
 * konsisten dgn entry_date Sek.6). Default = bulan WIB saat ini.
 *
 * Cache: ref-cache prefix 'gl:' (TTL 60 dtk backstop) - key
 * 'gl:<from>:<to>' mengikuti parameter. Route tulis (POST /api/jurnal)
 * memanggil invalidate('gl:'); multi-instance Vercel mengandalkan TTL.
 *
 * Respons V1: coa (akun status='open'), trial (neraca saldo KUMULATIF,
 * akun tak bermutasi difilter, totals + balanced), entries (200 terbaru
 * dalam [from,to) + barisnya), notes (catatan V1, wajib dibaca).
 */
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { cached } from '@/lib/ref-cache';
import { trialBalance } from '@/lib/gl';
import { wibToday } from '@/lib/zakat-period';

// Module-local (TIDAK export): modul route Next.js hanya boleh mengeksport
// handler HTTP (GET/POST/...) + route config (dynamic/revalidate/...). Export
// nilai lain (mis. konstanta) melanggar constraint type-check .next/types yang
// di-generate next build (property tak dikenal => 'never') -> build Error di
// Vercel sejak W1.4. Dipakai internal utk respons GET (field 'notes').
const GL_NOTES: string[] = [
  'Neraca saldo bersifat KUMULATIF (sejak pembukuan), dibatasi batas periode to - bukan mutasi per-periode.',
  'Setiap entry harus seimbang (SUM debit = SUM kredit; rekonsiliasi #15 JOURNAL_BAL). balanced=false = ada entry tak seimbang - periksa di halaman Jurnal.',
  'Koreksi tidak menghapus data: gunakan jurnal pembalik (type=reversal, link reversed_by dua arah) lewat halaman Jurnal.',
  'Auto-posting transaksi (sales/kas/belanja/pembelian) hanya aktif bila setting gl_enabled=1; default 0 (zero behavior change).',
  'Cache 60 detik per periode (prefix gl:). Tombol Muat ulang tetap dapat data maks. 60 dtk basi; mutasi lewat halaman Jurnal langsung meng-invalidate.',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Periode default: bulan WIB saat ini (from = awal bulan, to = awal bulan depan). */
function defaultPeriod(): { from: string; to: string } {
  const t = wibToday();
  const from = t.slice(0, 8) + '01';
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const to = String(ny) + '-' + String(nm).padStart(2, '0') + '-01';
  return { from, to };
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });

  const url = new URL(req.url);
  let from = url.searchParams.get('from') ?? '';
  let to = url.searchParams.get('to') ?? '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    const d = defaultPeriod();
    from = d.from;
    to = d.to;
  }

  try {
    const payload = await cached('gl:' + from + ':' + to, async () => {
      const d = await db();
      const coa = (await d
        .prepare('SELECT code, name, "group", kind FROM coa WHERE status = ? ORDER BY code')
        .all('open')) as { code: string; name: string; group: string; kind: string }[];
      const coaMap = new Map(coa.map((r) => [r.code, r]));

      const trialRows = await trialBalance(d, to);
      const trial = trialRows
        .map((r) => {
          const acc = coaMap.get(r.account_code);
          return {
            code: r.account_code,
            name: acc ? acc.name : r.account_code,
            group: acc ? acc.group : '',
            debit: r.debit,
            credit: r.credit,
            diff: r.diff,
          };
        })
        .filter((r) => r.debit > 0 || r.credit > 0);
      const totalDebit = trial.reduce((a, r) => a + r.debit, 0);
      const totalCredit = trial.reduce((a, r) => a + r.credit, 0);

      const entries = (await d
        .prepare(
          'SELECT id, entry_date, type, desc, created_by, reversed_by ' +
            'FROM journal_entries WHERE entry_date >= ? AND entry_date < ? ' +
            'ORDER BY entry_date DESC, id DESC LIMIT 200'
        )
        .all(from, to)) as {
        id: string;
        entry_date: string;
        type: string;
        desc: string;
        created_by: string | null;
        reversed_by: string | null;
      }[];
      const linesByEntry = new Map<string, { account_code: string; debit: number; credit: number }[]>();
      if (entries.length > 0) {
        const ph = entries.map(() => '?').join(',');
        const lines = (await d
          .prepare(
            `SELECT entry_id, account_code, debit, credit FROM journal_lines
             WHERE entry_id IN (${ph})`
          )
          .all(...entries.map((e) => e.id))) as {
          entry_id: string;
          account_code: string;
          debit: number;
          credit: number;
        }[];
        for (const l of lines) {
          const arr = linesByEntry.get(l.entry_id) ?? [];
          arr.push({
            account_code: l.account_code,
            debit: Math.round(Number(l.debit) || 0),
            credit: Math.round(Number(l.credit) || 0),
          });
          linesByEntry.set(l.entry_id, arr);
        }
      }

      return {
        ok: true,
        period: { from, to },
        coa,
        trial,
        totals: { debit: totalDebit, credit: totalCredit },
        balanced: totalDebit === totalCredit,
        entries: entries.map((e) => ({
          ...e,
          lines: linesByEntry.get(e.id) ?? [],
        })),
        notes: GL_NOTES,
      };
    });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Turso/Vercel exception tak tertangani dulu bocor sebagai halaman HTML
    // 500; klien api() salah baca HTML tsb. Tangkap global balas JSON 500
    // (pola /api/neraca); cache sukses terakhir tetap backstop.
    return NextResponse.json({ error: 'Gagal memuat GL. Silakan coba lagi.' }, { status: 500 });
  }
}

