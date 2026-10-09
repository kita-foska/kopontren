'use client';

/**
 * W2.7 -- komponen client halaman /admin/zis: form input ZIS
 * masuk/keluar per jenis + kartu total + riwayat + export CSV
 * (server /api/zis?csv=1, pola zakat-client).
 * D1: GL off -> tercatat tanpa jurnal (badge). D3: wakaf -> jurnal
 * manual 1120/4100/6020 = W3.5 (badge). 0 emoji; ikon inline SVG saja.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Button, Empty, Table, Td, Th, TermTip, Trow, Toast, useToast } from '@/components/ui';
import { fetchTimeout } from '@/lib/fetch-util';
import { fmtDateTime, rp } from '@/lib/format';
import { wibToday } from '@/lib/zakat-period';
import { createInFlightGuard } from '@/lib/inflight';

type ZisRow = {
  id: string;
  kind: string;
  direction: string;
  amount: number;
  payer: string | null;
  occurred_at: string;
  posted_entry: string | null;
  created_by: string | null;
  created_at: string;
};

type ZisTotalsRow = { kind: string; direction: string; s: number; c: number };

type ZisData = {
  rows: ZisRow[];
  totals: ZisTotalsRow[];
  gl_enabled: boolean;
  coop: boolean;
};

/** Payload GET /api/zis/rekap (mirror ZisRekapPayload lib/zis-rekap.ts
 * + gl_enabled utk badge status GL). */
type ZisRekapKind = { kind: string; in_total: number; out_total: number; net: number };
type ZisRekapMonth = { month: string; in_total: number; out_total: number; net: number };
type ZisRekapData = {
  period: { from: string | null; to: string | null };
  by_kind: ZisRekapKind[];
  monthly: ZisRekapMonth[];
  grand: { in_total: number; out_total: number; net: number };
  c2090: { gl_balance: number; posted_in: number; unposted_in: number };
  gl_enabled: boolean;
};

/** Label scope periode utk keterangan kartu rekap. */
function rekapScopeLabel(mode: string): string {
  if (mode === 'month') return 'bulan ini';
  if (mode === 'year') return 'tahun ini';
  if (mode === 'custom') return 'periode custom';
  return 'seluruh periode';
}

/** Label basa-awam jenis ZIS (nilai DB tetap raw). */
const KIND_LABELS: Record<string, string> = {
  zakat: 'Zakat',
  infak: 'Infak',
  sedekah: 'Sedekah',
  wakaf: 'Wakaf',
};

/** Ikon unduh (inline SVG 14px; tanpa emoji/ikon-font). */
const IconDownload = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/** Status jurnal per baris (D1: gl-off = tanpa jurnal; D3: wakaf masuk
 * auto-jurnal D1120/K4100 (W3.5); wakaf keluar = jurnal manual). */
function statusBadge(r: ZisRow, glOn: boolean) {
  if (r.kind === 'wakaf') {
    if (r.posted_entry) return <Badge tone="green">Jurnal {r.posted_entry.slice(0, 8)}...</Badge>;
    if (!glOn) return <Badge tone="gray">GL off - tanpa jurnal</Badge>;
    if (r.direction === 'out') return <Badge tone="amber">Wakaf keluar: jurnal manual (W3.5)</Badge>;
    return <Badge tone="red">Tanpa jurnal</Badge>;
  }
  if (r.posted_entry) return <Badge tone="green">Jurnal {r.posted_entry.slice(0, 8)}...</Badge>;
  if (!glOn) return <Badge tone="gray">GL off - tanpa jurnal</Badge>;
  return <Badge tone="red">Tanpa jurnal</Badge>;
}

/** W5.3a (B2): inflight guard modul -- cegah double-POST /api/zis
 *  bila tombol "Simpan" diklik ganda; disable-busy UI tetap jalan. */
const zisInFlight = createInFlightGuard();

export function ZisClient() {
  const [data, setData] = useState<ZisData | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [kind, setKind] = useState('zakat');
  const [direction, setDirection] = useState('in');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [occurred, setOccurred] = useState('');
  const [toast, showToast, clearToast, toastTone, toastAction] = useToast();
  // P3b: state Rekap ZIS (period picker + payload + refetch on change).
  const [rekapMode, setRekapMode] = useState('all');
  const [rekapFrom, setRekapFrom] = useState('');
  const [rekapTo, setRekapTo] = useState('');
  const [rekap, setRekap] = useState<ZisRekapData | null>(null);
  const [rekapBusy, setRekapBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<ZisData>('/api/zis?limit=200');
    if (r.ok && r.data) setData(r.data);
    if (!r.ok) showToast('Gagal memuat riwayat ZIS', 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P3b: ambil rekap -- batasan periode dihitung lokal (WIB via wibToday,
  // sudah diimport W2.7 utk form); date-only 'YYYY-MM-DD' dinormalisasi
  // route ke tengah-malam WIB (from inklusif, to eksklusif).
  const loadRekap = useCallback((mode: string, from: string, to: string) => {
    const t = wibToday();
    let f = '';
    let tt = '';
    if (mode === 'month') {
      const y = t.slice(0, 4);
      const mNo = Number(t.slice(5, 7));
      f = y + '-' + String(mNo).padStart(2, '0') + '-01';
      tt = mNo === 12 ? String(Number(y) + 1) + '-01-01' : y + '-' + String(mNo + 1).padStart(2, '0') + '-01';
    } else if (mode === 'year') {
      const y = Number(t.slice(0, 4));
      f = t.slice(0, 4) + '-01-01';
      tt = String(y + 1) + '-01-01';
    } else if (mode === 'custom') {
      f = from;
      tt = to;
    }
    const qs = new URLSearchParams();
    if (f) qs.set('from', f);
    if (tt) qs.set('to', tt);
    const url = '/api/zis/rekap' + (qs.toString() ? '?' + qs.toString() : '');
    setRekapBusy(true);
    api<ZisRekapData>(url)
      .then((r) => {
        if (r.ok && r.data) setRekap(r.data);
        else if (!r.ok) showToast('Gagal memuat rekap ZIS', 'error');
      })
      .catch(() => showToast('Gagal memuat rekap ZIS', 'error'))
      .finally(() => setRekapBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRekap(rekapMode, rekapFrom, rekapTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rekapMode, rekapFrom, rekapTo]);

  /** Export CSV riwayat -- pola zakat-client (server ?csv=1 + unduh blob). */
  async function exportCsv() {
    setCsvBusy(true);
    try {
      const res = await fetchTimeout('/api/zis?csv=1&limit=500');
      if (!res.ok) {
        showToast('Gagal mengekspor CSV', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zis-history-${wibToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('CSV riwayat ZIS diunduh');
    } catch {
      showToast('Gagal mengekspor CSV', 'error');
    } finally {
      setCsvBusy(false);
    }
  }

  // P3b: turunan rekap utk kartu alokasi (non-wakaf = ZIS disalurkan
  // keluar; wakaf = disposal aset, jalur manual W3.5 -- bukan kas 1100).
  const rekapNonWakaf = rekap ? rekap.by_kind.filter((k) => k.kind !== 'wakaf') : [];
  const rekapAllocOut = rekapNonWakaf.reduce((a, k) => a + k.out_total, 0);
  const rekapAllocIn = rekapNonWakaf.reduce((a, k) => a + k.in_total, 0);
  const rekapUnalloc = rekapAllocIn - rekapAllocOut;
  const rekapWakafOut = rekap ? rekap.by_kind.find((k) => k.kind === 'wakaf')?.out_total ?? 0 : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // W5.3a B2: inflight guard sinkron -- selagi POST berjalan,
    // klik berikutnya dibuang (re-arm lewat release di finally).
    if (!zisInFlight.tryStart()) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      zisInFlight.release();
      showToast('Jumlah harus rupiah integer > 0');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { kind, direction, amount: amt };
      if (payer.trim()) body.payer = payer.trim();
      // tanggal input (WIB) -> ISO tengah-malam WIB hari tsb (entry_date GL).
      if (occurred) body.occurred_at = occurred + 'T00:00:00.000+07:00';
      const r = await api<{ ok?: boolean; posted?: string | null; error?: string }>('/api/zis', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const label =
          (KIND_LABELS[kind] ?? kind) +
          ' ' +
          (direction === 'in' ? 'masuk' : 'keluar') +
          ' tercatat' +
          (r.data?.posted
            ? ' - jurnal ' + String(r.data.posted).slice(0, 8) + '...'
            : data && !data.gl_enabled
              ? ' - GL off (tanpa jurnal)'
              : '');
        showToast(label);
        setAmount('');
        setPayer('');
        setOccurred('');
        await load();
      } else {
        showToast(r.error || 'Gagal mencatat ZIS', 'error');
      }
    } finally {
      zisInFlight.release();
      setBusy(false);
    }
  }

  const d = data;
  const totalIn = d
    ? d.totals.filter((t) => t.direction === 'in').reduce((a, t) => a + Number(t.s), 0)
    : 0;
  const totalOut = d
    ? d.totals.filter((t) => t.direction === 'out').reduce((a, t) => a + Number(t.s), 0)
    : 0;

  if (!d) {
    return (
      <div className="card p-4 text-sm text-slate-500 dark:text-slate-400">Memuat...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Kartu total + status GL */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="label">Total Masuk</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
            {rp(totalIn)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">semua jenis masuk</p>
        </div>
        <div className="card p-4">
          <p className="label">Total Keluar</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-rose-600 dark:text-rose-400">
            {rp(totalOut)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">semua jenis keluar</p>
        </div>
        <div className="card p-4">
          <p className="label">Selisih</p>
          <p
            className={
              'mt-1 text-xl font-extrabold tracking-tight ' +
              (totalIn - totalOut >= 0
                ? 'text-slate-800 dark:text-slate-100'
                : 'text-rose-600 dark:text-rose-400')
            }
          >
            {rp(totalIn - totalOut)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">masuk - keluar</p>
        </div>
        <div className="card p-4">
          <p className="label">
            <TermTip
              term="GL"
              tip="GL (General Ledger) = buku besar. GL aktif: catatan ZIS otomatis tercatat di jurnal; off: hanya tersimpan sebagai catatan."
            >
              Status GL
            </TermTip>
          </p>
          <div className="mt-2">
            {d.gl_enabled ? (
              <Badge tone="green">GL aktif - auto jurnal</Badge>
            ) : (
              <Badge tone="gray">GL off - tercatat saja</Badge>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Wakaf masuk: auto-jurnal D1120/K4100; wakaf keluar: manual (W3.5).
          </p>
        </div>
      </div>

      {/* Rekap ZIS (P3b): by_kind + per-bulan + alokasi + saldo 2090. */}
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">
            <TermTip term="Rekap" tip="Rekapitulasi ZIS: total per jenis, per bulan, alokasi, dan saldo COA 2090 (ZIS terkumpul belum disalurkan).">
              Rekap ZIS
            </TermTip>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {rekapBusy ? <span className="text-xs text-slate-500 dark:text-slate-400">Memuat...</span> : null}
            <select
              className="input"
              value={rekapMode}
              onChange={(e) => setRekapMode(e.target.value)}
              aria-label="Periode rekap ZIS"
            >
              <option value="all">Semua</option>
              <option value="month">Bulan ini</option>
              <option value="year">Tahun ini</option>
              <option value="custom">Custom</option>
            </select>
            {rekapMode === 'custom' ? (
              <>
                <input
                  type="date"
                  className="input"
                  value={rekapFrom}
                  onChange={(e) => setRekapFrom(e.target.value)}
                  aria-label="Dari"
                />
                <input
                  type="date"
                  className="input"
                  value={rekapTo}
                  onChange={(e) => setRekapTo(e.target.value)}
                  aria-label="Sampai"
                />
              </>
            ) : null}
          </div>
        </div>
        {rekap ? (
          <div className="space-y-4">
            <div>
              <h3 className="label mb-2">Total per jenis ({rekapScopeLabel(rekapMode)})</h3>
              <Table minW="min-w-[560px]">
                <thead>
                  <tr>
                    <Th>Jenis</Th>
                    <Th className="text-right">Masuk</Th>
                    <Th className="text-right">Keluar</Th>
                    <Th className="text-right">Net</Th>
                  </tr>
                </thead>
                <tbody>
                  {rekap.by_kind.map((k) => (
                    <Trow key={k.kind} hover>
                      <Td>{KIND_LABELS[k.kind] ?? k.kind}</Td>
                      <Td className="text-right tabular-nums">{rp(k.in_total)}</Td>
                      <Td className="text-right tabular-nums">{rp(k.out_total)}</Td>
                      <Td className="text-right font-bold tabular-nums">{rp(k.net)}</Td>
                    </Trow>
                  ))}
                  <Trow>
                    <Td className="font-bold">TOTAL</Td>
                    <Td className="text-right font-bold tabular-nums">{rp(rekap.grand.in_total)}</Td>
                    <Td className="text-right font-bold tabular-nums">{rp(rekap.grand.out_total)}</Td>
                    <Td className="text-right font-bold tabular-nums">{rp(rekap.grand.net)}</Td>
                  </Trow>
                </tbody>
              </Table>
            </div>
            {rekapMode !== 'month' && rekap.monthly.length > 0 ? (
              <div>
                <h3 className="label mb-2">
                  Per bulan
                  {rekap.monthly.length > 24 ? ' (menampilkan 24 terakhir dari ' + rekap.monthly.length + ' bulan)' : ''}
                </h3>
                <Table minW="min-w-[560px]">
                  <thead>
                    <tr>
                      <Th>Bulan</Th>
                      <Th className="text-right">Masuk</Th>
                      <Th className="text-right">Keluar</Th>
                      <Th className="text-right">Net</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rekap.monthly.slice(-24).map((mo) => (
                      <Trow key={mo.month} hover>
                        <Td>{mo.month}</Td>
                        <Td className="text-right tabular-nums">{rp(mo.in_total)}</Td>
                        <Td className="text-right tabular-nums">{rp(mo.out_total)}</Td>
                        <Td className="text-right font-bold tabular-nums">{rp(mo.net)}</Td>
                      </Trow>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="label">Teralokasi (disalurkan)</p>
                <p className="mt-1 text-lg font-extrabold tabular-nums">{rp(rekapAllocOut)}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  zakat/infak/sedekah keluar {rekapScopeLabel(rekapMode)} (dibook beban 5090/5100)
                </p>
              </div>
              <div>
                <p className="label">Belum disalurkan</p>
                <p className="mt-1 text-lg font-extrabold tabular-nums">{rp(rekapUnalloc)}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  net masuk-keluar operasional {rekapScopeLabel(rekapMode)} (bukan saldo GL 2090)
                </p>
              </div>
              <div>
                <p className="label">Wakaf disposal</p>
                <p className="mt-1 text-lg font-extrabold tabular-nums">{rp(rekapWakafOut)}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  keluar wakaf = disposal aset (jurnal manual 6020/1120, W3.5)
                </p>
              </div>
              <div>
                <p className="label">Saldo COA 2090 (GL)</p>
                <p className="mt-1 text-lg font-extrabold tabular-nums">{rp(rekap.c2090.gl_balance)}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  all-time -- OQ-1: kumulatif; keluar ZIS tak mengurangi 2090
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {!rekap.gl_enabled ? <Badge tone="gray">GL off -- 2090 tidak bertambah</Badge> : null}
                  {rekap.c2090.unposted_in > 0 ? (
                    <Badge tone="amber">{rekap.c2090.unposted_in} baris masuk belum jurnal (D6: tak di-backfill)</Badge>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Form input */}
      <form onSubmit={submit} className="card p-4">
        <h2 className="mb-3 font-bold">Catat ZIS</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
            <TermTip
              term="Jenis ZIS"
              tip="Zakat = kewajiban; infak/sedekah = sukarela; wakaf = harta dipegang untuk umum. Tiap jenis punya pencatatan sendiri."
            >
              Jenis
            </TermTip>
            <select className="input mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="zakat">Zakat</option>
              <option value="infak">Infak</option>
              <option value="sedekah">Sedekah</option>
              <option value="wakaf">Wakaf</option>
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
            Arah
            <select className="input mt-1" value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="in">Masuk</option>
              <option value="out">Keluar</option>
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-2">
            Jumlah (Rp)
            <input
              className="input mt-1"
              inputMode="numeric"
              placeholder="mis. 2500000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
            Pemberi
            <input
              className="input mt-1"
              placeholder="opsional"
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
            Tanggal (WIB)
            <input
              className="input mt-1"
              type="date"
              value={occurred}
              onChange={(e) => setOccurred(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Menyimpan...' : 'Simpan'}
          </Button>
          <Button variant="ghost" onClick={exportCsv} disabled={csvBusy}>
            {IconDownload}
            {csvBusy ? 'Mengunduh...' : 'Export CSV'}
          </Button>
        </div>
      </form>

      {/* Riwayat */}
      <div className="card p-4">
        <h2 className="mb-3 font-bold">Riwayat (terbaru {d.rows.length})</h2>
        {d.rows.length === 0 ? (
          <Empty compact text="Belum ada catatan ZIS. Gunakan form di atas." />
        ) : (
          <Table minW="min-w-[720px]">
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Jenis</Th>
                <Th>Arah</Th>
                <Th className="text-right">Jumlah</Th>
                <Th>Pemberi</Th>
                <Th>
                  <TermTip
                    term="Status"
                    tip="Apakah catatan ini sudah tercatat di buku (jurnal GL): hijau = ada nomor jurnal, abu = GL off, merah = belum tercatat."
                  >
                    Status
                  </TermTip>
                </Th>
                <Th>Oleh</Th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <Trow key={r.id} hover>
                  <Td>{fmtDateTime(r.occurred_at)}</Td>
                  <Td>{KIND_LABELS[r.kind] ?? r.kind}</Td>
                  <Td>{r.direction === 'in' ? 'Masuk' : 'Keluar'}</Td>
                  <Td className="text-right font-bold tabular-nums">{rp(r.amount)}</Td>
                  <Td>{r.payer || '-'}</Td>
                  <Td>{statusBadge(r, d.gl_enabled)}</Td>
                  <Td>{r.created_by || '-'}</Td>
                </Trow>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {toast ? <Toast msg={toast} tone={toastTone} action={toastAction} onClose={clearToast} /> : null}
    </div>
  );
}
