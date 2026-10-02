'use client';

/**
 * W2.7 -- komponen client halaman /admin/zis: form input ZIS
 * masuk/keluar per jenis + kartu total + riwayat + export CSV
 * (server /api/zis?csv=1, pola zakat-client).
 * D1: GL off -> tercatat tanpa jurnal (badge). D3: wakaf -> jurnal
 * manual 1120/4100/6020 = W3.5 (badge). 0 emoji; ikon inline SVG saja.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Button, Empty, Table, Td, Th, Trow, Toast, useToast } from '@/components/ui';
import { fetchTimeout } from '@/lib/fetch-util';
import { fmtDateTime, rp } from '@/lib/format';
import { wibToday } from '@/lib/zakat-period';

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

/** Status jurnal per baris (D1/D3: gl-off & wakaf = tanpa auto-jurnal). */
function statusBadge(r: ZisRow, glOn: boolean) {
  if (r.kind === 'wakaf') return <Badge tone="amber">Jurnal manual (W3.5)</Badge>;
  if (r.posted_entry) return <Badge tone="green">Jurnal {r.posted_entry.slice(0, 8)}...</Badge>;
  if (!glOn) return <Badge tone="gray">GL off - tanpa jurnal</Badge>;
  return <Badge tone="red">Tanpa jurnal</Badge>;
}

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Jumlah harus rupiah integer > 0');
      return;
    }
    setBusy(true);
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
    setBusy(false);
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
          <p className="label">Status GL</p>
          <div className="mt-2">
            {d.gl_enabled ? (
              <Badge tone="green">GL aktif - auto jurnal</Badge>
            ) : (
              <Badge tone="gray">GL off - tercatat saja</Badge>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Wakaf: jurnal manual (1120/4100/6020) = W3.5
          </p>
        </div>
      </div>

      {/* Form input */}
      <form onSubmit={submit} className="card p-4">
        <h2 className="mb-3 font-bold">Catat ZIS</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
            Jenis
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
                <Th>Status</Th>
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
