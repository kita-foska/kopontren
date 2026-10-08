'use client';

/**
 * W2.2 -- UI admin Laporan Formal: tab shell + panel Posisi (Neraca)
 * + lazy-load Laporan V1 (laba/rugi simplifikasi). Baca via
 * GET /api/laporan/formal (tier 'laporan'). W5.3a B1: 5 panel formal
 * berbagi period picker -- URL state ?periode= (hook useAsOfPeriod),
 * kunci API tetap ?as_of=. V1 (lazy) tidak ikut.
 * Gaya meniru gl-client.tsx:
 * container pakai class 'card' (ui.tsx TIDAK punya komponen Card),
 * PageSkeleton tanpa prop, ErrorState text/tech, Badge tone, Button.
 */
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, Badge, Button, ErrorState, PageSkeleton, Td, Table, TermTip, Th, Trow } from '@/components/ui';
import { rp, todayWibStr } from '@/lib/format';
import type { PosisiPayload } from '@/lib/laporan/posisi';
import type { LkaPayload } from '@/lib/laporan/lka';
import type { LpePayload } from '@/lib/laporan/lpe';
import type { LakPayload, LakActivity } from '@/lib/laporan/lak';
import type { CalkPayload } from '@/lib/laporan/calk';

/** V1 (laba/rugi simplifikasi) di-lazy-load -- datanya berat. */
const V1Client = dynamic(
  () =>
    import('@/components/admin/laporan-admin-client').then((m) => m.LaporanAdminClient),
  { ssr: false, loading: () => <PageSkeleton /> },
);

type TabId = 'posisi' | 'lka' | 'lpe' | 'lak' | 'calk' | 'v1';

/** Bentuk respons GET /api/laporan/formal?report=posisi (route W2.2). */
type FormalResp = PosisiPayload & {
  ok: true;
  gl_enabled: boolean;
  coop_registered: boolean;
  coa: { code: string; name: string; group: string }[];
  notes: string[];
};

/** Bentuk respons GET /api/laporan/formal?report=lka (route W2.3). */
type LkaResp = LkaPayload & {
  ok: true;
  gl_enabled: boolean;
  coop_registered: boolean;
  coa: { code: string; name: string; group: string }[];
  notes: string[];
};

/** Bentuk respons GET /api/laporan/formal?report=lpe (route W2.4). */
type LpeResp = LpePayload & {
  ok: true;
  gl_enabled: boolean;
  coop_registered: boolean;
  coa: { code: string; name: string; group: string }[];
  notes: string[];
};

/** Bentuk respons GET /api/laporan/formal?report=lak (route W2.5). */
type LakResp = LakPayload & {
  ok: true;
  gl_enabled: boolean;
  coop_registered: boolean;
  coa: { code: string; name: string; group: string }[];
  notes: string[];
};

/** Bentuk respons GET /api/laporan/formal?report=calk (route W2.6). */
type CalkResp = CalkPayload & {
  ok: true;
  gl_enabled: boolean;
  coop_registered: boolean;
  coa: { code: string; name: string; group: string }[];
  notes: string[];
};

/**
 * /admin/laporan: shell tab. 'posisi' = Laporan Posisi W2.2 (formal,
 * Sek.5.1); 'v1' = laporan V1 simplifikasi (lazy). Laporan V2 menyusul
 * wave berikutnya -- tab barisnya sudah disiapkan di sini.
 */
export function LaporanFormalClient() {
  const [tab, setTab] = useState<TabId>('posisi');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'posisi', label: 'Laporan Posisi (Neraca)' },
    { id: 'lka', label: 'Laba-Rugi' },
    { id: 'lpe', label: 'Perubahan Ekuitas' },
    { id: 'lak', label: 'Arus Kas' },
    { id: 'calk', label: 'Catatan LK (CALK)' },
    { id: 'v1', label: 'Laporan V1' },
  ];

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-navy-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                'rounded-md px-3 py-1.5 text-sm font-bold transition ' +
                (tab === t.id
                  ? 'bg-white text-slate-900 shadow dark:bg-navy-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {/* UX-1 (E23/E24): legenda istilah singkat; daftar lengkap di
          /admin/glosarium (src/lib/glossary.ts, E39). */}
      <div className="card mt-3 p-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        {'Istilah: '}
        <TermTip
          term="Neraca"
          tip="Laporan posisi harta (aset) dan kewajiban (utang) per tanggal. Potret kekayaan toko."
        />
        {' - '}
        <TermTip
          term="LKA"
          tip="Laporan Laba-Rugi: pendapatan dikurangi beban; selisihnya = laba/rugi bersih."
        />
        {' - '}
        <TermTip
          term="LPE"
          tip="Laporan Perubahan Ekuitas: apa yang menambah/mengurangi cadangan dalam periode."
        />
        {' - '}
        <TermTip
          term="CALK"
          tip="Catatan Atas Laporan Keuangan: penjelasan kebijakan dan rincian di balik angka."
        />
        {' - '}
        <TermTip
          term="D=K"
          tip="Debit harus sama dengan Kredit. Bila tidak seimbang, ada pencatatan yang salah; cek /admin/rekonsiliasi."
        />
        {'. Daftar lengkap: menu Glosarium.'}
      </div>

      {tab === 'posisi' ? <PositionPanel /> : tab === 'lka' ? <LkaPanel /> : tab === 'lpe' ? <LpePanel /> : tab === 'lak' ? <LakPanel /> : tab === 'calk' ? <CalkPanel /> : <V1Client />}
    </div>
  );
}

/**
 * W5.3a (B1) -- period picker 5 panel formal.
 * Baca-on-mount: ?periode= valid YYYY-MM-DD -> dipakai; tak valid /
 * tidak ada -> fallback hari ini (WIB). Ganti (setAsOf): state lokal
 * + router.replace ?periode= (tanpa reload; halaman /admin/laporan
 * force-dynamic jadi useSearchParams aman tanpa Suspense boundary).
 * Kunci API tetap ?as_of= (GET /api/laporan/formal).
 */
function useAsOfPeriod() {
  const sp = useSearchParams();
  const router = useRouter();
  const [asOf, setAsOfState] = useState(() => {
    const p = sp.get('periode');
    return p !== null && /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : todayWibStr();
  });
  const setAsOf = useCallback(
    (v: string) => {
      setAsOfState(v);
      void router.replace('/admin/laporan?periode=' + v);
    },
    [router],
  );
  return [asOf, setAsOf] as const;
}

/** Panel W2.2: pilih as_of, muat GET /api/laporan/formal, render neraca. */
function PositionPanel() {
  const [asOf, setAsOf] = useAsOfPeriod();
  const [data, setData] = useState<FormalResp | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const r = await api<FormalResp>('/api/laporan/formal?report=posisi&as_of=' + asOf);
    if (r.ok && r.data) {
      setData(r.data);
    } else {
      setData(null);
      setErr(r.error || 'Gagal memuat Laporan Posisi.');
    }
    setLoading(false);
  }, [asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-3">
      {/* Bar atas: as_of + status D=K + auto-posting + kopontren. */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            as_of
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
          />
          <Button variant="ghost" onClick={() => load()}>
            Muat ulang
          </Button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.d_k.balanced ? 'green' : 'red'}>
              {data.d_k.balanced ? 'D=K seimbang' : 'Tidak seimbang'}
            </Badge>
            {data.gl_enabled ? (
              <Badge tone="blue">auto-posting</Badge>
            ) : (
              <Badge tone="gray">auto-posting off</Badge>
            )}
            {data.coop_registered && <Badge tone="amber">kopontren reg.</Badge>}
          </div>
        )}
      </div>

      {err && !loading && (
        <div className="card p-4">
          <ErrorState text={err} onRetry={() => load()} />
        </div>
      )}

      {/* D=K gagal (rekon #15 JOURNAL_BAL): tolak angka formal. */}
      {data && !data.d_k.balanced && (
        <div className="card border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            Debit tak sama Kredit s.d. {data.as_of} (selisih {rp(data.d_k.gap)}). Angka
            formal TIDAK otoritatif.
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            Perbaiki mutasi jurnal, atau cek JOURNAL_BAL di{' '}
            <a href="/admin/rekonsiliasi" className="font-bold underline">
              /admin/rekonsiliasi
            </a>
            .
          </p>
        </div>
      )}

      {data && <PosisiStatement p={data} />}
      {data && data.notes.length > 0 && <NotesList notes={data.notes} />}
    </div>
  );
}

/** Satu baris label + nilai (rp). `strong` = baris total (bold + border). */
function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      className={
        'flex items-center justify-between gap-4 py-1.5 text-sm ' +
        (strong
          ? 'border-t border-slate-200 pt-2 font-bold dark:border-navy-700'
          : 'text-slate-700 dark:text-slate-300')
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{rp(value)}</span>
    </div>
  );
}

/** Rincian akun (wakaf memo & ekuitas): tabel kode + nama + saldo neto. */
function DetailRows({
  rows,
  names,
}: {
  rows: { code: string; value: number }[];
  names: (code: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table minW="min-w-[36rem]">
        <thead>
          <tr className="border-b border-slate-200 dark:border-navy-700">
            <Th>Kode</Th>
            <Th>Akun</Th>
            <Th>Saldo</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Trow key={r.code}>
              <Td className="font-mono text-xs">{r.code}</Td>
              <Td>{names(r.code)}</Td>
              <Td className="tabular-nums">{rp(r.value)}</Td>
            </Trow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/** Neraca (Laporan Posisi) s.d. as_of -- struktur Sek.5.1. */
function PosisiStatement({ p }: { p: FormalResp }) {
  const s = p.sections;
  const t = p.totals;
  const nameMap = new Map(p.coa.map((c) => [c.code, c.name]));
  const names = (code: string) => nameMap.get(code) ?? code;
  // Wakaf (1120+6020) memo: TIDAK dijumlahkan ke total_aset, tapi dipakai di
  // rekon (aset + wakaf = kewajib + ekuitas_menutup) agar selisih = 0 saat
  // D=K seimbang (invariant test A: total_aset + wakafTotal === ...).
  const wakafTotal = s.wakaf_memo.reduce((a, r) => a + r.value, 0);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* ASET */}
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
          ASET
        </h3>
        <Line label="Aset lancar" value={s.aset_lancar} />
        <Line label="Aset tetap neto (1050 - 1060)" value={s.aset_tetap_neto} />
        <Line label="Investasi syariah" value={s.investasi_syariah} />
        <Line label="Total aset" value={t.total_aset} strong />
        {s.wakaf_memo.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Wakaf (memo, tak dijumlahkan)
            </p>
            <DetailRows rows={s.wakaf_memo} names={names} />
          </div>
        )}
      </div>

      {/* KEWAJIBAN */}
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-rose-700 dark:text-rose-400">
          KEWAJIBAN
        </h3>
        <Line label="Kewajiban lancar" value={s.kewajiban_lancar} />
        <Line label="Kewajiban anggota" value={s.kewajiban_anggota} />
        <Line label="Kewajiban ZIS" value={s.kewajiban_zis} />
        <Line label="Total kewajiban" value={t.total_kewajiban} strong />
      </div>

      {/* EKUITAS */}
      <div className="card p-4 md:col-span-2">
        <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">EKUITAS</h3>
        {s.ekuitas.some((r) => r.value !== 0) ? (
          <DetailRows rows={s.ekuitas} names={names} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Belum ada ekuitas (30xx) s.d. {p.as_of}.
          </p>
        )}
        <div className="mt-3">
          <Line label="Total ekuitas (30xx)" value={t.total_ekuitas} />
          <Line label="Laba/rugi berjalan (4xx tanpa 4040 - 5xx - 6030, pre-closing; spt lka.laba_bersih)" value={t.laba_rugi_berjalan} />
          <Line label="Total ekuitas menutup (set closing)" value={t.total_ekuitas_menutup} strong />
        </div>
      </div>

      {/* Rekon D=K: aset (+ wakaf memo) vs (kewajiban + ekuitas menutup). */}
      <div className="card p-4 md:col-span-2">
        <p className="mb-2 text-sm font-bold">Rekonsiliasi posisi</p>
        <Line label="Total aset" value={t.total_aset} />
        <Line label="Wakaf memo (1120+6020, tak dijumlahkan ke aset)" value={wakafTotal} />
        <Line
          label="Kewajiban + ekuitas menutup"
          value={t.total_kewajiban + t.total_ekuitas_menutup}
        />
        <Line
          label="Selisih"
          value={t.total_aset + wakafTotal - (t.total_kewajiban + t.total_ekuitas_menutup)}
          strong
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Wakaf (1120+6020) memo TIDAK dijumlahkan ke total aset; di rekon ini aset
          ditambah kembali wakaf memo sehingga selisih = 0 saat D=K seimbang. Laba/rugi
          berjalan (4xx - 5xx) sudah termuat dalam ekuitas menutup -- bukan sumber
          selisih. Jurnal closing memindahkan laba/rugi berjalan ke 3020 (Sek.3.2.6)
          untuk neraca setelah penutupan.
        </p>
      </div>
    </div>
  );
}

/** W2.3 -- panel Laba-Rugi: pilih as_of, muat ?report=lka, render P&L Sek.5.2. */
function LkaPanel() {
  const [asOf, setAsOf] = useAsOfPeriod();
  const [data, setData] = useState<LkaResp | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const r = await api<LkaResp>('/api/laporan/formal?report=lka&as_of=' + asOf);
    if (r.ok && r.data) {
      setData(r.data);
    } else {
      setData(null);
      setErr(r.error || 'Gagal memuat Laporan Laba-Rugi.');
    }
    setLoading(false);
  }, [asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-3">
      {/* Bar atas: as_of + status D=K + auto-posting + kopontren. */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            as_of
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
          />
          <Button variant="ghost" onClick={() => load()}>
            Muat ulang
          </Button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.d_k.balanced ? 'green' : 'red'}>
              {data.d_k.balanced ? 'D=K seimbang' : 'Tidak seimbang'}
            </Badge>
            {data.gl_enabled ? (
              <Badge tone="blue">auto-posting</Badge>
            ) : (
              <Badge tone="gray">auto-posting off</Badge>
            )}
            {data.coop_registered && <Badge tone="amber">kopontren reg.</Badge>}
          </div>
        )}
      </div>

      {err && !loading && (
        <div className="card p-4">
          <ErrorState text={err} onRetry={() => load()} />
        </div>
      )}

      {/* D=K gagal (rekon #15 JOURNAL_BAL): tolak angka formal. */}
      {data && !data.d_k.balanced && (
        <div className="card border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            Debit tak sama Kredit s.d. {data.as_of} (selisih {rp(data.d_k.gap)}). Angka
            formal TIDAK otoritatif.
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            Perbaiki mutasi jurnal, atau cek JOURNAL_BAL di{' '}
            <a href="/admin/rekonsiliasi" className="font-bold underline">
              /admin/rekonsiliasi
            </a>
            .
          </p>
        </div>
      )}

      {data && <LkaStatement p={data} />}
      {data && data.notes.length > 0 && <NotesList notes={data.notes} />}
    </div>
  );
}

/** LKA s.d. as_of -- struktur Sek.5.2 (NETO - HPP = KOTOR - BEBAN = SEBELUM ZIS - ZIS = BERSIH). */
function LkaStatement({ p }: { p: LkaResp }) {
  const pd = p.pendapatan;
  const hp = p.hpp;
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
          PENDAPATAN
        </h3>
        <Line label="Pendapatan bruto (4010)" value={pd.bruto} />
        <Line label="Potongan & diskon (4020)" value={pd.diskon} />
        <Line label="Retur penjualan (4030)" value={pd.retur_penjualan} />
        <Line label="Pendapatan neto (4010 - 4020 - 4030)" value={pd.neto} strong />

        <div className="mt-3">
          <h3 className="mb-2 text-sm font-bold text-rose-700 dark:text-rose-400">HPP</h3>
          <Line label="HPP bruto (5010)" value={hp.bruto} />
          <Line label="Retur COGS (5020, netting V2-2)" value={hp.retur} />
          <Line label="HPP neto (5010 - 5020)" value={hp.neto} strong />
        </div>
      </div>

      <div className="card p-4">
        <Line label="Laba Kotor (neto - HPP)" value={p.laba_kotor} strong />
        <Line
          label="Beban (5030+5040+5060+5070+5080; 5050 denda tidak aktif)"
          value={p.beban}
        />
        <Line label="Laba Sebelum ZIS (kotor - beban)" value={p.laba_sebelum_zis} strong />
        <Line label="ZIS (5090+5100+6030)" value={p.zis} />
        {p.pendapatan_lainnya.rows.length > 0 ? (
          <div className="mt-2">
            <h4 className="mb-1 text-xs font-bold text-sky-700 dark:text-sky-400">
              PENDAPATAN LAIN KOPERASI (4050-4100)
            </h4>
            {p.pendapatan_lainnya.rows.map((r) => (
              <Line key={r.code} label={r.label + ' (' + r.code + ')'} value={r.value} />
            ))}
            <Line
              label="Total pendapatan lain (4050-4100)"
              value={p.pendapatan_lainnya.total}
              strong
            />
          </div>
        ) : null}
        <Line
          label="Laba Bersih (sebelum ZIS - ZIS + pendapatan lain)"
          value={p.laba_bersih}
          strong
        />
      </div>

      {/* MEMO: ujrah konsinyasi (4040), cashback (2030), SHU (3020) -- TIDAK dijumlahkan. */}
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
          MEMO (tidak dijumlahkan ke laba bersih)
        </h3>
        <div className="overflow-x-auto">
          <Table minW="min-w-[30rem]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-navy-700">
                <Th>Baris</Th>
                <Th>Kode</Th>
                <Th>Nilai</Th>
              </tr>
            </thead>
            <tbody>
              {p.memo.map((r) => (
                <Trow key={r.code}>
                  <Td>{r.label}</Td>
                  <Td className="font-mono text-xs">{r.code}</Td>
                  <Td className="tabular-nums">{rp(r.value)}</Td>
                </Trow>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Ujrah konsinyasi (4040), cashback (2030), dan SHU (3020) ditampilkan sebagai
          memo saja; TIDAK masuk perhitungan laba bersih.
        </p>
      </div>
    </div>
  );
}

/** W2.4 -- panel Perubahan Ekuitas: pilih as_of, muat ?report=lpe, render LPE Sek.5.3. */
function LpePanel() {
  const [asOf, setAsOf] = useAsOfPeriod();
  const [data, setData] = useState<LpeResp | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const r = await api<LpeResp>('/api/laporan/formal?report=lpe&as_of=' + asOf);
    if (r.ok && r.data) {
      setData(r.data);
    } else {
      setData(null);
      setErr(r.error || 'Gagal memuat Laporan Perubahan Ekuitas.');
    }
    setLoading(false);
  }, [asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-3">
      {/* Bar atas: as_of + status D=K + auto-posting + kopontren. */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            as_of
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
          />
          <Button variant="ghost" onClick={() => load()}>
            Muat ulang
          </Button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.d_k.balanced ? 'green' : 'red'}>
              {data.d_k.balanced ? 'D=K seimbang' : 'Tidak seimbang'}
            </Badge>
            {data.gl_enabled ? (
              <Badge tone="blue">auto-posting</Badge>
            ) : (
              <Badge tone="gray">auto-posting off</Badge>
            )}
            {data.coop_registered && <Badge tone="amber">kopontren reg.</Badge>}
          </div>
        )}
      </div>

      {err && !loading && (
        <div className="card p-4">
          <ErrorState text={err} onRetry={() => load()} />
        </div>
      )}

      {/* D=K gagal (rekon #15 JOURNAL_BAL): tolak angka formal. */}
      {data && !data.d_k.balanced && (
        <div className="card border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            Debit tak sama Kredit s.d. {data.as_of} (selisih {rp(data.d_k.gap)}). Angka
            formal TIDAK otoritatif.
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            Perbaiki mutasi jurnal, atau cek JOURNAL_BAL di{' '}
            <a href="/admin/rekonsiliasi" className="font-bold underline">
              /admin/rekonsiliasi
            </a>
            .
          </p>
        </div>
      )}

      {data && <LpeStatement p={data} />}
      {data && data.notes.length > 0 && <NotesList notes={data.notes} />}
    </div>
  );
}

/** LPE s.d. as_of -- struktur Sek.5.3 (akun 30xx dgn mutasi + memo simpanan). */
function LpeStatement({ p }: { p: LpeResp }) {
  const t = p.totals;
  // Sel numerik: 0 -> '-' agar matriks ringkas.
  const nz = (v: number) => (v === 0 ? '-' : rp(v));
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
          Perubahan Ekuitas s.d. {p.as_of} (kumulatif, Sek.5.3)
        </h3>
        <div className="overflow-x-auto">
          <Table minW="min-w-[46rem]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-navy-700">
                <Th>Akun Ekuitas</Th>
                <Th>Saldo Awal</Th>
                <Th>(+) SHU</Th>
                <Th>(+/-) Alokasi</Th>
                <Th>(-) Distribusi</Th>
                <Th>Saldo Akhir</Th>
              </tr>
            </thead>
            <tbody>
              {p.columns.map((c) => (
                <Trow key={c.code}>
                  <Td>
                    {c.name}{' '}
                    <span className="font-mono text-xs text-slate-400">{c.code}</span>
                    {!c.open && <span className="ml-1 text-xs text-slate-400">(placeholder)</span>}
                  </Td>
                  <Td className="tabular-nums">{nz(c.pembuka)}</Td>
                  <Td className="tabular-nums">{nz(c.shu)}</Td>
                  <Td className="tabular-nums">{nz(c.alokasi)}</Td>
                  <Td className="tabular-nums">{nz(c.distribusi)}</Td>
                  <Td className="tabular-nums font-bold">{nz(c.penutup)}</Td>
                </Trow>
              ))}
              <Trow>
                <Td className="font-bold">Total Ekuitas</Td>
                <Td className="tabular-nums font-bold">{nz(t.pembuka)}</Td>
                <Td className="tabular-nums font-bold">{nz(t.shu)}</Td>
                <Td className="tabular-nums font-bold">{nz(t.alokasi)}</Td>
                <Td className="tabular-nums font-bold">{nz(t.distribusi)}</Td>
                <Td className="tabular-nums font-bold">{nz(t.penutup)}</Td>
              </Trow>
            </tbody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Saldo penuh ekuitas (SUM 30xx, kredit-debit) = <b>{rp(p.full_balance_ekuitas)}</b>.
          Saldo Akhir = Saldo Awal + SHU + Alokasi - Distribusi; distribusi SHU (dibagi ke
          anggota) tertanggung pada Alokasi (3050+3060, Sek.13.4) -- baris Distribusi masih
          placeholder 0 (modul distribusi menyusul, W2.6).
        </p>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-rose-700 dark:text-rose-400">
          MEMO -- Simpanan Anggota (kewajiban, bukan ekuitas)
        </h3>
        <div className="overflow-x-auto">
          <Table minW="min-w-[30rem]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-navy-700">
                <Th>Baris</Th>
                <Th>Kode</Th>
                <Th>Nilai</Th>
              </tr>
            </thead>
            <tbody>
              {p.memos.simpanan.map((s) => (
                <Trow key={s.code}>
                  <Td>{s.label}</Td>
                  <Td className="font-mono text-xs">{s.code}</Td>
                  <Td className="tabular-nums">{nz(s.value)}</Td>
                </Trow>
              ))}
              <Trow>
                <Td className="font-bold">Total simpanan</Td>
                <Td>&nbsp;</Td>
                <Td className="tabular-nums font-bold">{rp(p.memos.simpanan_total)}</Td>
              </Trow>
            </tbody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          2050/2060/2070 (Simpanan Pokok/Wajib/Sukarela) adalah kewajiban kepada anggota
          (Kolom 1/2 Sek.4.2) -- TIDAK dijumlahkan ke total ekuitas di atas.
        </p>
      </div>
    </div>
  );
}

/** W2.5 -- panel Arus Kas: pilih as_of, muat ?report=lak, render LAK Sek.5.4. */
function LakPanel() {
  const [asOf, setAsOf] = useAsOfPeriod();
  const [data, setData] = useState<LakResp | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const r = await api<LakResp>('/api/laporan/formal?report=lak&as_of=' + asOf);
    if (r.ok && r.data) {
      setData(r.data);
    } else {
      setData(null);
      setErr(r.error || 'Gagal memuat Laporan Arus Kas.');
    }
    setLoading(false);
  }, [asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-3">
      {/* Bar atas: as_of + status D=K + auto-posting + kopontren. */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            as_of
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
          />
          <Button variant="ghost" onClick={() => load()}>
            Muat ulang
          </Button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.d_k.balanced ? 'green' : 'red'}>
              {data.d_k.balanced ? 'D=K seimbang' : 'Tidak seimbang'}
            </Badge>
            {data.gl_enabled ? (
              <Badge tone="blue">auto-posting</Badge>
            ) : (
              <Badge tone="gray">auto-posting off</Badge>
            )}
            {data.coop_registered && <Badge tone="amber">kopontren reg.</Badge>}
          </div>
        )}
      </div>

      {err && !loading && (
        <div className="card p-4">
          <ErrorState text={err} onRetry={() => load()} />
        </div>
      )}

      {/* D=K gagal (rekon #15 JOURNAL_BAL): tolak angka formal. */}
      {data && !data.d_k.balanced && (
        <div className="card border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            Debit tak sama Kredit s.d. {data.as_of} (selisih {rp(data.d_k.gap)}). Angka
            formal TIDAK otoritatif.
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            Perbaiki mutasi jurnal, atau cek JOURNAL_BAL di{' '}
            <a href="/admin/rekonsiliasi" className="font-bold underline">
              /admin/rekonsiliasi
            </a>
            .
          </p>
        </div>
      )}

      {data && <LakStatement p={data} />}
      {data && data.notes.length > 0 && <NotesList notes={data.notes} />}
    </div>
  );
}

/** Satu aktivitas LAK: arus neto + rincian masuk/keluar + kode lawan (info). */
function LakActivityBlock({ title, a }: { title: string; a: LakActivity }) {
  return (
    <div>
      <Line label={title} value={a.neto} strong />
      <div className="ml-1 text-xs text-slate-500 dark:text-slate-400">
        masuk {rp(a.masuk)} / keluar {rp(a.keluar)}
        {a.codes.length > 0 && <span> -- akun lawan: {a.codes.join(', ')}</span>}
      </div>
    </div>
  );
}

/** LAK s.d. as_of -- struktur Sek.5.4: footer, aktivitas, kas usaha, ZIS terpisah. */
function LakStatement({ p }: { p: LakResp }) {
  const f = p.footer;
  const ks = p.kas_sosial;
  // Sel numerik: 0 -> '-' agar ringkas (tabel ZIS).
  const nz = (v: number) => (v === 0 ? '-' : rp(v));
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
          Laporan Arus Kas Usaha s.d. {p.as_of} (Sek.5.4)
        </h3>
        <div className="overflow-x-auto">
          <Table minW="min-w-[36rem]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-navy-700">
                <Th>Arus</Th>
                <Th>Neto</Th>
              </tr>
            </thead>
            <tbody>
              <Trow>
                <Td>Saldo kas usaha awal (pembuka 1010+1020)</Td>
                <Td className="tabular-nums font-bold">{rp(f.saldo_awal)}</Td>
              </Trow>
              <Trow>
                <Td>
                  Arus dari aktivitas{' '}
                  <span className="text-slate-500 dark:text-slate-400">(neto op+inv+pend)</span>
                </Td>
                <Td className="tabular-nums font-bold">{rp(f.neto_aktivitas)}</Td>
              </Trow>
              {f.pergeseran_kas_sosial !== 0 && (
                <Trow>
                  <Td>Pergeseran kas sosial (1100, bukan aktivitas)</Td>
                  <Td className="tabular-nums">{rp(f.pergeseran_kas_sosial)}</Td>
                </Trow>
              )}
              <Trow>
                <Td className="font-bold">Saldo kas usaha akhir</Td>
                <Td className="tabular-nums font-bold">{rp(f.saldo_akhir)}</Td>
              </Trow>
            </tbody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Identitas footer: saldo_awal + neto_aktivitas + pergeseran_kas_sosial = saldo_akhir.
          Transfer antar-kas (1010&lt;&gt;1020 / 1100) bukan aktivitas.
        </p>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
          Arus per aktivitas (Sek.5.4)
        </h3>
        <LakActivityBlock title="Aktivitas operasional" a={p.aktivitas.operasional} />
        <div className="mt-2" />
        <LakActivityBlock title="Aktivitas investasi" a={p.aktivitas.investasi} />
        <div className="mt-2" />
        <LakActivityBlock title="Aktivitas pendanaan" a={p.aktivitas.pendanaan} />
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
          Kas usaha per akun (1010 + 1020)
        </h3>
        <div className="overflow-x-auto">
          <Table minW="min-w-[40rem]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-navy-700">
                <Th>Akun</Th>
                <Th>Pembuka</Th>
                <Th>Masuk</Th>
                <Th>Keluar</Th>
                <Th>Transfer</Th>
                <Th>Neto</Th>
                <Th>Penutup</Th>
              </tr>
            </thead>
            <tbody>
              {p.kas.map((k) => (
                <Trow key={k.code}>
                  <Td>
                    {k.name}{' '}
                    <span className="font-mono text-xs text-slate-400">{k.code}</span>
                  </Td>
                  <Td className="tabular-nums">{rp(k.pembuka)}</Td>
                  <Td className="tabular-nums">{rp(k.masuk)}</Td>
                  <Td className="tabular-nums">{rp(k.keluar)}</Td>
                  <Td className="tabular-nums">{rp(k.transfer)}</Td>
                  <Td className="tabular-nums">{rp(k.neto)}</Td>
                  <Td className="tabular-nums font-bold">{rp(k.penutup)}</Td>
                </Trow>
              ))}
            </tbody>
          </Table>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
          {ks.name} ({ks.code}) -- seksi terpisah
        </h3>
        <div className="overflow-x-auto">
          <Table minW="min-w-[40rem]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-navy-700">
                <Th>Pembuka</Th>
                <Th>Masuk</Th>
                <Th>Keluar</Th>
                <Th>Transfer</Th>
                <Th>Neto</Th>
                <Th>Penutup</Th>
              </tr>
            </thead>
            <tbody>
              <Trow>
                <Td className="tabular-nums">{rp(ks.pembuka)}</Td>
                <Td className="tabular-nums">{rp(ks.masuk)}</Td>
                <Td className="tabular-nums">{rp(ks.keluar)}</Td>
                <Td className="tabular-nums">{rp(ks.transfer)}</Td>
                <Td className="tabular-nums">{rp(ks.neto)}</Td>
                <Td className="tabular-nums font-bold">{rp(ks.penutup)}</Td>
              </Trow>
            </tbody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Kas sosial (ZIS) TIDAK dijumlahkan ke kas usaha (anti-campur, Sek.5.4).
        </p>
        {ks.rincian.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <Table minW="min-w-[30rem]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-700">
                  <Th>Rincian ZIS</Th>
                  <Th>Kode</Th>
                  <Th>Masuk</Th>
                  <Th>Keluar</Th>
                </tr>
              </thead>
              <tbody>
                {ks.rincian.map((r) => (
                  <Trow key={r.code}>
                    <Td>{r.label}</Td>
                    <Td className="font-mono text-xs">{r.code}</Td>
                    <Td className="tabular-nums">{nz(r.masuk)}</Td>
                    <Td className="tabular-nums">{nz(r.keluar)}</Td>
                  </Trow>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Item 9 (Sek.5.5): peristiwa pasca-periode -- input manual, draft LOKAL
 *  per as_of (localStorage perangkat ini), TIDAK tersimpan di server. */
function CalkPeristiwa({ asOf }: { asOf: string }) {
  const key = 'calk:peristiwa:' + asOf;
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(window.localStorage.getItem(key) ?? '');
    setSaved(false);
  }, [key]);

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
        9. Peristiwa pasca-periode s.d. {asOf} (input manual, Sek.5.5)
      </h3>
      <textarea
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder="Catat peristiwa pasca-periode (mis. sengkut, komitmen, sengketa) yang wajib diungkap..."
        className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-navy-600 dark:bg-navy-800"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            window.localStorage.setItem(key, text);
            setSaved(true);
          }}
        >
          Simpan draft
        </Button>
        {saved && <span className="text-xs text-slate-500 dark:text-slate-400">tersimpan lokal (perangkat ini)</span>}
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Draft per as_of, disimpan di perangkat ini (localStorage) -- TIDAK ke server/DB (API formal read-only).
      </p>
    </div>
  );
}

/** Panel W2.6: CALK template Sek.5.5 -- as_of + item 1-3 kebijakan +
 *  item 4-8 dari GL + item 9 input manual. Baca GET /api/laporan/formal?report=calk. */
function CalkPanel() {
  const [asOf, setAsOf] = useAsOfPeriod();
  const [data, setData] = useState<CalkResp | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const r = await api<CalkResp>('/api/laporan/formal?report=calk&as_of=' + asOf);
    if (r.ok && r.data) {
      setData(r.data);
    } else {
      setData(null);
      setErr(r.error || 'Gagal memuat Catatan LK (CALK).');
    }
    setLoading(false);
  }, [asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-3">
      {/* Bar atas: as_of + status D=K + auto-posting + kopontren (pola LakPanel). */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            as_of
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
          />
          <Button variant="ghost" onClick={() => load()}>
            Muat ulang
          </Button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.d_k.balanced ? 'green' : 'red'}>
              {data.d_k.balanced ? 'D=K seimbang' : 'Tidak seimbang'}
            </Badge>
            {data.gl_enabled ? (
              <Badge tone="blue">auto-posting</Badge>
            ) : (
              <Badge tone="gray">auto-posting off</Badge>
            )}
            {data.coop_registered && <Badge tone="amber">kopontren reg.</Badge>}
          </div>
        )}
      </div>

      {err && !loading && (
        <div className="card p-4">
          <ErrorState text={err} onRetry={() => load()} />
        </div>
      )}

      {/* D=K gagal (rekon #15 JOURNAL_BAL): angka formal tidak otoritatif. */}
      {data && !data.d_k.balanced && (
        <div className="card border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            Debit tak sama Kredit s.d. {data.as_of} (selisih {rp(data.d_k.gap)}). Angka
            formal TIDAK otoritatif.
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            Perbaiki mutasi jurnal, atau cek JOURNAL_BAL di{' '}
            <a href="/admin/rekonsiliasi" className="font-bold underline">
              /admin/rekonsiliasi
            </a>
            .
          </p>
        </div>
      )}

      {data && <CalkKebijakan p={data} />}
      {data && <CalkStatement p={data} />}
      {data && <CalkPeristiwa asOf={asOf} />}
      {data && data.notes.length > 0 && <NotesList notes={data.notes} />}
    </div>
  );
}

/** Item 1-3 (Sek.5.5): info entitas + status koperasi (flag Sek.1.1), dasar
 *  penyusunan hybrid (Sek.1.2), struktur, kebijakan akuntansi + badge
 *  item belum-diputuskan/PKGF/wave. */
function CalkKebijakan({ p }: { p: CalkResp }) {
  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
        1-3. Informasi umum entitas, struktur &amp; kebijakan akuntansi (Sek.5.5)
      </h3>
      <dl className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Entitas:</dt>
          <Badge tone={p.coop_registered ? 'green' : 'amber'}>
            {p.coop_registered ? 'Kopontren (tercatat/notaris)' : 'Kopontren (dalam proses -- menunggu registrasi, Sek.1.1)'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Dasar penyusunan:</dt>
          <dd>
            Hybrid SAK Syariah -- PAP -- SAK EP (hierarki Sek.1.2); mata uang IDR (kurs n/a).
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Tanggal N buku pembuka (Sek.10):</dt>
          <Badge tone="gray">menunggu migrasi Wave 6 -- belum di aplikasi</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Ikhtiar &amp; struktur:</dt>
          <dd>Unit usaha toko POS + dana pesantren (memo 6010); multi-store siap.</dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">HPP:</dt>
          <dd>Metode RNB snapshot (V2-2), dipetakan ke akun COA.</dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Penyusutan (1050/1060):</dt>
          <dd>Metode &amp; umur aset per Sek.13.11 (SETUJU); periode closing periodik (Sek.3.2.6).</dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Konsinyasi (P4, Sek.15.5):</dt>
          <dd>
            Ujrah = pendapatan 4040 + tagihan pemilik = settlement payable 2020 (A1.1 LEPAS, SETUJU);
            dasar hitung ujrah V1 <Badge tone="amber">menunggu ulama (E25)</Badge>
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Zakat (P3, Sek.15.4):</dt>
          <dd>
            24K / market (Opsi B FINAL) / haul anchor 2025-10-22;
            jembatan zakat_history <Badge tone="amber">belum di-switch (R6 -- modul zakat masih provisional)</Badge>
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Nisbah &amp; margin akad (Sek.13.1/3/5):</dt>
          <dd>Per akad, input manual -- app TIDAK mengisi default angka.</dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold text-slate-600 dark:text-slate-300">Rasio distribusi SHU (Sek.13.4):</dt>
          <dd>
            Jurnal alokasi 3020 &rarr; 3030/3040/3050/3060;
            angka rasio <Badge tone="gray">per catatan keputusan -- tidak di aplikasi (W3.2)</Badge>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Penerima LK formal = pengurus + pengasuh, triwulan &amp; tahunan, via app
        (penerima &amp; frekuensi: Sek.13.13 SETUJU).
      </p>
    </div>
  );
}

/** Item 4-8 (Sek.5.5): kas, piutang/hutang, ekuitas, ZIS, akad --
 *  angka GL s.d. as_of (entry_date &lt; batas). */
function CalkStatement({ p }: { p: CalkResp }) {
  /** Sel numerik: 0 -> '-' agar ringkas (tabel CALK). */
  const nz = (v: number) => (v === 0 ? '-' : rp(v));
  const accTable = (title: string, rows: { code: string; name: string; value: number }[], badge?: string) => (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</h3>
        {badge && <Badge tone="gray">{badge}</Badge>}
      </div>
      <Table minW="min-w-[30rem]">
        <thead>
          <tr className="border-b border-slate-200 dark:border-navy-700">
            <Th>Akun</Th>
            <Th>Saldo wajar</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Trow key={r.code}>
              <Td>
                {r.code} {r.name}
              </Td>
              <Td className="tabular-nums">{nz(r.value)}</Td>
            </Trow>
          ))}
        </tbody>
      </Table>
    </div>
  );
  return (
    <div className="space-y-3">
      {accTable('4. Komponen kas -- saldo penutup (1010/1020/1100, terpisah, rekon #16)', p.kas)}

      {accTable(
        '5. Piutang per lawan transaksi (ringkasan)',
        p.piutang,
        'ringkasan per akun -- detail per lawan transaksi menyusul modul'
      )}
      {accTable(
        '5. Hutang per lawan transaksi (ringkasan)',
        p.hutang,
        'ringkasan per akun -- detail per lawan transaksi menyusul modul'
      )}

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
          6. Ekuitas (modal, SHU + rasio distribusi Sek.13.4)
        </h3>
        <Table minW="min-w-[30rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <Th>Akun</Th>
              <Th>Saldo wajar</Th>
            </tr>
          </thead>
          <tbody>
            {p.ekuitas.map((r) => (
              <Trow key={r.code}>
                <Td>
                  {r.code} {r.name}
                </Td>
                <Td className="tabular-nums">{nz(r.value)}</Td>
              </Trow>
            ))}
            <Trow>
              <Td className="font-bold">Total ekuitas (3010-3070)</Td>
              <Td className="tabular-nums font-bold">{rp(p.ekuitas_total)}</Td>
            </Trow>
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Simpanan anggota 2050/2060/2070 = kewajiban, BUKAN ekuitas (memo, pola LPE W2.4):{' '}
          {p.ekuitas_memo.filter((m) => m.value !== 0).map((m) => `${m.code} ${rp(m.value)}`).join(', ') || '-'}
        </p>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            7. ZIS -- diterima/disalurkan per jenis
          </h3>
          <Badge tone="amber">
            GL-only: 4090/5100 menyatukan infak+sedekah -- pemisahan per jenis setelah W2.7 (kolom zis.kind)
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Per jenis (kumulatif s.d. {p.as_of})
            </p>
            <Table minW="min-w-[26rem]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-700">
                  <Th>Jenis</Th>
                  <Th>Diterima</Th>
                  <Th>Disalurkan</Th>
                </tr>
              </thead>
              <tbody>
                {p.zis.map((z) => (
                  <Trow key={z.jenis}>
                    <Td>{z.jenis}</Td>
                    <Td className="tabular-nums">{nz(z.diterima)}</Td>
                    <Td className="tabular-nums">{nz(z.disalurkan)}</Td>
                  </Trow>
                ))}
              </tbody>
            </Table>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Per periode (bulan entri)
            </p>
            {p.zis_periode.length > 0 ? (
              <Table minW="min-w-[26rem]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-navy-700">
                    <Th>Periode</Th>
                    <Th>ZIS masuk</Th>
                    <Th>ZIS keluar</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.zis_periode.map((z) => (
                    <Trow key={z.periode}>
                      <Td>{z.periode}</Td>
                      <Td className="tabular-nums">{nz(z.diterima)}</Td>
                      <Td className="tabular-nums">{nz(z.disalurkan)}</Td>
                    </Trow>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Belum ada aliran ZIS (non-pembuka).</p>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Wakaf (F3.3 #14 AKTIF, PSAK 112): aset wakaf 1120 = {rp(p.zis_memo.aset_wakaf_1120)} + syariah
          memo 6020 = {rp(p.zis_memo.memo_6020)} -- memo, TIDAK masuk total aset.
        </p>
      </div>

      {accTable(
        '8. Akad berjalan per jenis',
        p.akad_berjalan,
        'rincian per akad: modul akad /admin/akad (W3.2; pengurus read-only, Q3) + ringkasan di bawah'
      )}

      {/* W3.3 (OQ3): item 8 -- ringkasan per jenis akad dari tabel akad
          (akad_ringkas; aktif/settled/saldo_aktif s.d. as_of). */}
      <div className="card p-4">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
          8a. Akad -- ringkasan per jenis (tabel akad, modul W3.2/W3.3)
        </h3>
        {p.akad_ringkas.length > 0 ? (
          <Table minW="min-w-[26rem]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-navy-700">
                <Th>Jenis</Th>
                <Th>Aktif</Th>
                <Th>Settled</Th>
                <Th>Saldo Aktif</Th>
              </tr>
            </thead>
            <tbody>
              {p.akad_ringkas.map((a) => (
                <Trow key={a.type}>
                  <Td>{a.type}</Td>
                  <Td className="tabular-nums">{a.aktif}</Td>
                  <Td className="tabular-nums">{a.settled}</Td>
                  <Td className="tabular-nums">{nz(a.saldo_aktif)}</Td>
                </Trow>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">Belum ada akad tercatat.</p>
        )}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Saldo aktif = total amount akad status=&#39;active&#39; s.d. {p.as_of};
          &#39;settled&#39; = soft status (bukan hapus baris, OQ 1).
        </p>
      </div>
    </div>
  );
}

/** Catatan formal (route FORMAL_NOTES). */
function NotesList({ notes }: { notes: string[] }) {


  return (
    <div className="card p-4">
      <p className="mb-2 text-sm font-bold">Catatan</p>
      <ul className="list-disc space-y-1 pl-4 text-xs text-slate-500 dark:text-slate-400">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}