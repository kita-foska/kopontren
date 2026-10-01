'use client';

/**
 * W2.2 -- UI admin Laporan Formal: tab shell + panel Posisi (Neraca)
 * + lazy-load Laporan V1 (laba/rugi simplifikasi). Baca via
 * GET /api/laporan/formal (tier 'laporan'). Gaya meniru gl-client.tsx:
 * container pakai class 'card' (ui.tsx TIDAK punya komponen Card),
 * PageSkeleton tanpa prop, ErrorState text/tech, Badge tone, Button.
 */
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { api, Badge, Button, ErrorState, PageSkeleton, Td, Table, Th, Trow } from '@/components/ui';
import { rp, todayWibStr } from '@/lib/format';
import type { PosisiPayload } from '@/lib/laporan/posisi';

/** V1 (laba/rugi simplifikasi) di-lazy-load -- datanya berat. */
const V1Client = dynamic(
  () =>
    import('@/components/admin/laporan-admin-client').then((m) => m.LaporanAdminClient),
  { ssr: false, loading: () => <PageSkeleton /> },
);

type TabId = 'posisi' | 'v1';

/** Bentuk respons GET /api/laporan/formal?report=posisi (route W2.2). */
type FormalResp = PosisiPayload & {
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

      {tab === 'posisi' ? <PositionPanel /> : <V1Client />}
    </div>
  );
}

/** Panel W2.2: pilih as_of, muat GET /api/laporan/formal, render neraca. */
function PositionPanel() {
  const [asOf, setAsOf] = useState(todayWibStr);
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
          <Line label="Laba/rugi berjalan (4xx - 5xx, pre-closing)" value={t.laba_rugi_berjalan} />
          <Line label="Total ekuitas menutup (set closing)" value={t.total_ekuitas_menutup} strong />
        </div>
      </div>

      {/* Rekon D=K: aset vs (kewajiban + ekuitas menutup). */}
      <div className="card p-4 md:col-span-2">
        <p className="mb-2 text-sm font-bold">Rekonsiliasi posisi</p>
        <Line label="Total aset" value={t.total_aset} />
        <Line
          label="Kewajiban + ekuitas menutup"
          value={t.total_kewajiban + t.total_ekuitas_menutup}
        />
        <Line
          label="Selisih"
          value={t.total_aset - (t.total_kewajiban + t.total_ekuitas_menutup)}
          strong
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Selisih tak nol wajar sebelum jurnal closing memindahkan laba/rugi berjalan ke
          3020 (Sek.3.2.6); selisihnya = laba/rugi berjalan yang belum ditutup.
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