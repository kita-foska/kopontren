'use client';

/**
 * W3.3 -- komponen client halaman /admin/akad: form akad per jenis +
 * form event per akad + simulasi Sek.6.3 (tanpa booking; semua angka
 * dari input user, 0 default/preset) + timeline event + export CSV
 * (server /api/akad?csv=1, pola zis-client).
 * D1: GL off -> event tercatat tanpa jurnal (badge). Wakalah = bridge
 * W3.4 (jurnal manual); denda = tak pernah di-post (F3.3 #6).
 * Q3: prop canWrite (tier akad = admin+manajer); pengurus = read-only
 * (form disembunyikan, data + simulasi + CSV tetap). 0 emoji; ikon
 * inline SVG saja.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Badge, Button, Empty, Table, Td, Th, TermTip, Trow, Toast, useToast } from '@/components/ui';
import { fetchTimeout } from '@/lib/fetch-util';
import { fmtDateTime, rp } from '@/lib/format';
import { wibToday } from '@/lib/zakat-period';

type AkadRow = {
  id: string;
  type: string;
  counterparty: string;
  amount: number;
  terms_json: string | null;
  status: string;
  opened_at: string;
  settled_at: string | null;
  note: string | null;
};

type AkadEventRow = {
  id: string;
  akad_id: string;
  kind: string;
  amount: number;
  event_date: string;
  posted_entry: string | null;
  entry_desc: string | null;
  created_by: string | null;
};

type AkadTotalsRow = { type: string; c: number; a: number; s: number; sa: number };

type AkadData = {
  rows: AkadRow[];
  events: AkadEventRow[];
  totals: AkadTotalsRow[];
  gl_enabled: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  murabahah: 'Murabahah',
  mudharabah: 'Mudharabah',
  musyarakah: 'Musyarakah',
  ijarah: 'Ijarah',
  wakalah: 'Wakalah',
};

const KIND_LABELS: Record<string, string> = {
  pencairan: 'Pencairan',
  angsuran: 'Angsuran',
  settlement: 'Settlement',
  bagi_hasil: 'Bagi Hasil',
  ijarah_periodik: 'Sewa (periode)',
  denda: 'Denda',
};

/** Kind valid per tipe (mirror lib/akad.ts KINDS_BY_TYPE; denda tdk dipost). */
const KINDS_BY_TYPE: Record<string, string[]> = {
  murabahah: ['pencairan', 'angsuran', 'settlement'],
  mudharabah: ['pencairan', 'bagi_hasil', 'settlement'],
  musyarakah: ['pencairan', 'bagi_hasil', 'settlement'],
  ijarah: ['pencairan', 'ijarah_periodik'],
  wakalah: ['denda'],
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

/** Status jurnal per event (D1 + W3.4 + F3.3 #6). */
function eventBadge(ev: AkadEventRow, glOn: boolean) {
  if (ev.kind === 'denda') return <Badge tone="gray">Tak di-post (F3.3 #6)</Badge>;
  if (ev.posted_entry) return <Badge tone="green">Jurnal {ev.posted_entry.slice(0, 8)}...</Badge>;
  if (ev.kind === 'pencairan' && glOn) return <Badge tone="red">Tanpa jurnal</Badge>;
  if (!glOn) return <Badge tone="gray">GL off - tercatat saja</Badge>;
  return <Badge tone="amber">Wakalah: jurnal manual (W3.4)</Badge>;
}



/** Flag checkbox utk form event per tipe/kind (Sek.6.4: lunas murabahah; heldPp bagi hasil). */
function flagFor(type: string, kind: string): 'lunas' | 'heldPp' | null {
  if (type === 'murabahah' && kind === 'pencairan') return 'lunas';
  if ((type === 'mudharabah' || type === 'musyarakah') && kind === 'bagi_hasil') return 'heldPp';
  return null;
}


export function AkadClient({ canWrite }: { canWrite: boolean }) {
  const [data, setData] = useState<AkadData | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [toast, showToast, clearToast, toastTone, toastAction] = useToast();

  // Form akad.
  const [aType, setAType] = useState('murabahah');
  const [aCounter, setACounter] = useState('');
  const [aAmount, setAAmount] = useState('');
  const [aOpened, setAOpened] = useState('');
  const [aNote, setANote] = useState('');
  const [aNisbah, setANisbah] = useState('');
  const [aMargin, setAMargin] = useState('');
  const [aRate, setARate] = useState('');

  // Form event.
  const [eAkad, setEAkad] = useState('');
  const [eKind, setEKind] = useState('pencairan');
  const [eAmount, setEAmount] = useState('');
  const [eDate, setEDate] = useState('');
  const [eLunas, setELunas] = useState(false);
  const [eHeldPp, setEHeldPp] = useState(false);

  // Simulasi Sek.6.3 (tanpa booking; semua angka input user).
  const [sType, setSType] = useState('murabahah');
  const [sAmount, setSAmount] = useState('');
  const [sMargin, setSMargin] = useState('');
  const [sNisbah, setSNisbah] = useState('');
  const [sProfit, setSProfit] = useState('');
  const [sRate, setSRate] = useState('');
  const [sPeriods, setSPeriods] = useState('');

  const load = useCallback(async () => {
    const r = await api<AkadData>('/api/akad?limit=200');
    if (r.ok && r.data) setData(r.data);
    if (!r.ok) showToast('Gagal memuat data akad', 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Event per akad (nested, utk timeline). */
  const eventsByAkad = useMemo(() => {
    const m: Record<string, AkadEventRow[]> = {};
    for (const ev of data?.events ?? []) {
      (m[ev.akad_id] ??= []).push(ev);
    }
    return m;
  }, [data]);

  /** Simulasi Sek.6.3: hasil = f(input user); 0 preset/prefill. */
  const sim = useMemo(() => {
    if (sType === 'murabahah') {
      const amt = Number(sAmount) || 0;
      const mg = Number(sMargin) || 0;
      const total = Math.round(amt * (1 + mg / 100));
      return {
        lines: [
          { k: 'Pokok (input)', v: rp(amt) },
          { k: 'Margin % (input)', v: mg + '%' },
          { k: 'Total harus dibayar', v: rp(total) },
          { k: 'Pencatatan', v: 'lunas saat pencairan -> C4060; bertahap -> D1010/C2040' },
        ],
      };
    }
    if (sType === 'mudharabah' || sType === 'musyarakah') {
      const t = Number(sProfit) || 0;
      const n = Number(sNisbah) || 0;
      const pp = Math.round((t * n) / 100);
      const pc = t - pp;
      return {
        lines: [
          { k: 'Profit T (input)', v: rp(t) },
          { k: 'Nisbah partner % (input)', v: n + '%' },
          { k: 'Pp (porsi partner) = round(T x n / 100)', v: rp(pp) },
          { k: 'Pc (porsi koperasi) = T - Pp', v: rp(pc) },
          { k: 'Pp dibayar cash -> C1010; ditahan -> C2040 (holdPp)', v: '-' },
        ],
      };
    }
    if (sType === 'ijarah') {
      const r = Number(sRate) || 0;
      const p = Number(sPeriods) || 0;
      return {
        lines: [
          { k: 'Rate per periode (input)', v: rp(r) },
          { k: 'Jumlah periode (input)', v: String(p) },
          { k: 'Total sewa = rate x periode', v: rp(r * p) },
          { k: 'Pencatatan', v: 'setiap penerimaan: D1010 -> C4050' },
        ],
      };
    }
    return {
      lines: [
        { k: 'Wakalah', v: 'bridge W3.4 (konsinyasi; ujrah 4040 + settlement neto 2020/4010)' },
        { k: 'Jurnal', v: 'manual, belum auto-posting' },
      ],
    };
  }, [sType, sAmount, sMargin, sNisbah, sProfit, sRate, sPeriods]);

  /** Export CSV -- pola zis-client (server ?csv=1 + unduh blob). */
  async function exportCsv() {
    setCsvBusy(true);
    try {
      const res = await fetchTimeout('/api/akad?csv=1&limit=500');
      if (!res.ok) {
        showToast('Gagal mengekspor CSV', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `akad-history-${wibToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('CSV riwayat akad diunduh');
    } catch {
      showToast('Gagal mengekspor CSV', 'error');
    } finally {
      setCsvBusy(false);
    }
  }

  /** terms_json sesuai tipe (0 preset: field tak relevan = tak dikirim). */
  function termsFor(type: string, nisbah: string, margin: string, rate: string): string | null {
    const t: Record<string, number> = {};
    if (type === 'mudharabah' || type === 'musyarakah') {
      if (nisbah !== '') t.nisbah = Number(nisbah);
    } else if (type === 'murabahah') {
      if (margin !== '') t.margin = Number(margin);
    } else if (type === 'ijarah') {
      if (rate !== '') t.rate = Number(rate);
    }
    return Object.keys(t).length ? JSON.stringify(t) : null;
  }

  async function submitAkad(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(aAmount);
    if (!Number.isInteger(amt) || amt <= 0) {
      showToast('Jumlah harus rupiah integer > 0');
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = {
      type: aType,
      counterparty: aCounter.trim(),
      amount: amt,
      terms_json: termsFor(aType, aNisbah, aMargin, aRate),
    };
    if (aOpened) body.opened_at = aOpened + 'T00:00:00.000+07:00';
    if (aNote.trim()) body.note = aNote.trim();
    const r = await api<{ ok?: boolean; error?: string; code?: string }>('/api/akad', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      showToast('Akad ' + (TYPE_LABELS[aType] ?? aType) + ' tercatat');
      setACounter('');
      setAAmount('');
      setAOpened('');
      setANote('');
      setANisbah('');
      setAMargin('');
      setARate('');
      await load();
    } else {
      // UNIQUE = pesan NOTE 3 W3.1 persis dari server (AKAD_UNIQUE_ERROR).
      showToast(r.data?.error || 'Gagal mencatat akad', 'error');
    }
    setBusy(false);
  }

  async function submitEvent(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(eAmount);
    if (!Number.isInteger(amt) || amt <= 0) {
      showToast('Jumlah harus rupiah integer > 0');
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { akad_id: eAkad, kind: eKind, amount: amt };
    if (eDate) body.event_date = eDate + 'T00:00:00.000+07:00';
    if (eLunas) body.lunas = true;
    if (eHeldPp) body.heldPp = true;
    const r = await api<{ ok?: boolean; posted?: string | null; error?: string }>('/api/akad', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const posted = r.data?.posted
        ? ' - jurnal ' + String(r.data.posted).slice(0, 8) + '...'
        : data && !data.gl_enabled
          ? ' - GL off (tanpa jurnal)'
          : ' - tanpa jurnal (wakalah W3.4 / denda F3.3 #6)';
      showToast((KIND_LABELS[eKind] ?? eKind) + ' tercatat' + posted);
      setEAmount('');
      setEDate('');
      setELunas(false);
      setEHeldPp(false);
      await load();
    } else {
      showToast(r.data?.error || 'Gagal mencatat event akad', 'error');
    }
    setBusy(false);
  }

  /** Soft status active<->settled (OQ 1: PUT, tanpa DELETE). */
  async function toggleStatus(row: AkadRow) {
    const status = row.status === 'settled' ? 'active' : 'settled';
    setBusy(true);
    const r = await api<{ ok?: boolean; error?: string }>('/api/akad', {
      method: 'PUT',
      body: JSON.stringify({ akad_id: row.id, status }),
    });
    if (r.ok) {
      showToast('Status ' + row.id.slice(0, 8) + ' -> ' + status);
      await load();
    } else {
      showToast(r.data?.error || 'Gagal update status', 'error');
    }
    setBusy(false);
  }

  const d = data;
  const eType = (d?.rows.find((r) => r.id === eAkad)?.type ?? 'murabahah') as string;

  if (!d) {
    return (
      <div className="card p-4 text-sm text-slate-500 dark:text-slate-400">Memuat...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Kartu totals + status GL */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="label">Akad Aktif</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
            {d.totals.reduce((a, t) => a + Number(t.a), 0)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            saldo berjalan {rp(d.totals.reduce((a, t) => a + Number(t.sa), 0))}
          </p>
        </div>
        <div className="card p-4">
          <p className="label">Akad Settled</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            {d.totals.reduce((a, t) => a + Number(t.s), 0)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">selesai (soft status)</p>
        </div>
        <div className="card p-4">
          <p className="label">Jumlah Event</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            {d.events.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">terbaru {Math.min(d.events.length, 200)}</p>
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
            Wakalah: jurnal manual (bridge W3.4); denda: tak di-post (F3.3 #6)
          </p>
        </div>
      </div>

      {!canWrite && (
        <div className="card p-3 text-xs text-slate-500 dark:text-slate-400">
          <Badge tone="amber">Read-only (Q3: pengurus)</Badge>
          <span className="ml-2">
            Data + simulasi + CSV tetap bisa; form akad/event & status hanya admin/manajer.
            Rincian saldo per akad: CALK item 8.
          </span>
        </div>
      )}

      {canWrite && (
        <form onSubmit={submitAkad} className="card p-4">
          <h2 className="mb-3 font-bold">Akad Baru</h2>
          <div className="grid gap-3 md:grid-cols-6">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
              <TermTip
                term="Jenis Akad"
                tip="Lima akad: jual beli margin tetap (murabahah); bagi hasil (mudharabah/musyarakah); sewa (ijarah); kuasa/wakil (wakalah)."
              >
                Jenis
              </TermTip>
              <select className="input mt-1" value={aType} onChange={(e) => setAType(e.target.value)}>
                <option value="murabahah">Murabahah</option>
                <option value="mudharabah">Mudharabah</option>
                <option value="musyarakah">Musyarakah</option>
                <option value="ijarah">Ijarah</option>
                <option value="wakalah">Wakalah (bridge W3.4)</option>
              </select>
              <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500 dark:text-slate-400">
                Margin tetap sejak awal (murabahah); bagi hasil (mudharabah/musyarakah);
                sewa (ijarah); kuasa (wakalah).
              </span>
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-2">
              Counterparty
              <input
                className="input mt-1"
                placeholder="mis. Kp. Al-Ma'un"
                value={aCounter}
                onChange={(e) => setACounter(e.target.value)}
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
              Jumlah (Rp)
              <input
                className="input mt-1"
                inputMode="numeric"
                placeholder="mis. 5000000"
                value={aAmount}
                onChange={(e) => setAAmount(e.target.value)}
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
              Tanggal (WIB)
              <input
                className="input mt-1"
                type="date"
                value={aOpened}
                onChange={(e) => setAOpened(e.target.value)}
              />
            </label>
            {(aType === 'mudharabah' || aType === 'musyarakah') && (
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                <TermTip
                  term="Nisbah"
                  tip="Porsi pembagian laba yang disepakati mitra, mis. 70:30."
                >
                  Nisbah partner
                </TermTip>{' '}
                (%)
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="0-100"
                  value={aNisbah}
                  onChange={(e) => setANisbah(e.target.value)}
                />
              </label>
            )}
            {aType === 'murabahah' && (
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                <TermTip
                  term="Margin"
                  tip="Margin keuntungan yang diketahui dan tetap sejak awal akad (murabahah); tidak berubah walau cicilan lama."
                >
                  Margin
                </TermTip>{' '}
                (%)
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="opsional"
                  value={aMargin}
                  onChange={(e) => setAMargin(e.target.value)}
                />
              </label>
            )}
            {aType === 'ijarah' && (
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                Rate / periode (Rp)
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="opsional"
                  value={aRate}
                  onChange={(e) => setARate(e.target.value)}
                />
              </label>
            )}
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-2">
              Catatan
              <input
                className="input mt-1"
                placeholder="opsional (maks 200)"
                value={aNote}
                onChange={(e) => setANote(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-3">
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? 'Menyimpan...' : 'Simpan Akad'}
            </Button>
          </div>
        </form>
      )}

      {/* Form event (write) + tombol CSV (read-only: CSV saja). */}
      {canWrite ? (
        <form onSubmit={submitEvent} className="card p-4">
          <h2 className="mb-3 font-bold">Event Akad (jurnal auto bila GL aktif)</h2>
          <div className="grid gap-3 md:grid-cols-6">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-2">
              Akad
              <select
                className="input mt-1"
                value={eAkad}
                onChange={(e) => {
                  setEAkad(e.target.value);
                  const ty = d.rows.find((r) => r.id === e.target.value)?.type ?? 'murabahah';
                  setEKind((KINDS_BY_TYPE[ty] ?? ['pencairan'])[0]);
                }}
              >
                <option value="" disabled>
                  pilih akad
                </option>
                {d.rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {(TYPE_LABELS[r.type] ?? r.type) + ': ' + r.counterparty + ' (' + r.id.slice(0, 8) + ')'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
              Kind
              <select
                className="input mt-1"
                value={eKind}
                onChange={(e) => setEKind(e.target.value)}
                disabled={!eAkad}
              >
                {(KINDS_BY_TYPE[eType] ?? []).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k] ?? k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
              Jumlah (Rp)
              <input
                className="input mt-1"
                inputMode="numeric"
                placeholder="mis. 1000000"
                value={eAmount}
                onChange={(e) => setEAmount(e.target.value)}
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
              Tanggal (WIB)
              <input
                className="input mt-1"
                type="date"
                value={eDate}
                onChange={(e) => setEDate(e.target.value)}
              />
            </label>
            <div className="flex flex-col justify-center gap-1 text-xs md:col-span-1">
              {flagFor(eType, eKind) === 'lunas' && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={eLunas}
                    onChange={(e) => setELunas(e.target.checked)}
                  />
                  Lunas saat pencairan (C4060)
                </label>
              )}
              {flagFor(eType, eKind) === 'heldPp' && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={eHeldPp}
                    onChange={(e) => setEHeldPp(e.target.checked)}
                  />
                  Pp ditahan dulu (C2040)
                </label>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" type="submit" disabled={busy || !eAkad}>
              {busy ? 'Menyimpan...' : 'Catat Event'}
            </Button>
            <Button variant="ghost" onClick={exportCsv} disabled={csvBusy}>
              {IconDownload}
              {csvBusy ? 'Mengunduh...' : 'Export CSV'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={exportCsv} disabled={csvBusy}>
            {IconDownload}
            {csvBusy ? 'Mengunduh...' : 'Export CSV'}
          </Button>
        </div>
      )}

      {/* Simulasi Sek.6.3 (tanpa booking; semua angka input user, 0 preset) */}
      <div className="card p-4">
        <h2 className="mb-3 font-bold">
          Simulasi (tanpa{' '}
          <TermTip
            term="Booking"
            tip="Booking = pencatatan ke buku. Simulasi hanya menghitung angka dari input; tidak membuat data akad atau jurnal."
          >
            booking
          </TermTip>{' '}
          - Sek.6.3)
        </h2>
        <div className="grid gap-3 md:grid-cols-6">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
            Jenis
            <select className="input mt-1" value={sType} onChange={(e) => setSType(e.target.value)}>
              <option value="murabahah">Murabahah</option>
              <option value="mudharabah">Mudharabah</option>
              <option value="musyarakah">Musyarakah</option>
              <option value="ijarah">Ijarah</option>
              <option value="wakalah">Wakalah</option>
            </select>
          </label>
          {(sType === 'murabahah') && (
            <>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-2">
                <TermTip
                  term="Pokok"
                  tip="Jumlah pokok akad (harga barang / modal) yang wajib dibayar kembali."
                >
                  Pokok
                </TermTip>{' '}
                (Rp)
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="mis. 5000000"
                  value={sAmount}
                  onChange={(e) => setSAmount(e.target.value)}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                Margin (%)
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="mis. 10"
                  value={sMargin}
                  onChange={(e) => setSMargin(e.target.value)}
                />
              </label>
            </>
          )}
          {(sType === 'mudharabah' || sType === 'musyarakah') && (
            <>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-2">
                <TermTip
                  term="Profit T"
                  tip="Total laba yang diperkirakan, untuk dibagi antar mitra sesuai nisbah."
                >
                  Profit T
                </TermTip>{' '}
                (Rp)
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="mis. 2000000"
                  value={sProfit}
                  onChange={(e) => setSProfit(e.target.value)}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                Nisbah partner (%)
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="mis. 30"
                  value={sNisbah}
                  onChange={(e) => setSNisbah(e.target.value)}
                />
              </label>
            </>
          )}
          {sType === 'ijarah' && (
            <>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-2">
                Rate / periode (Rp)
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="mis. 500000"
                  value={sRate}
                  onChange={(e) => setSRate(e.target.value)}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                Periode
                <input
                  className="input mt-1"
                  inputMode="numeric"
                  placeholder="mis. 12"
                  value={sPeriods}
                  onChange={(e) => setSPeriods(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <div className="mt-3">
          {sim.lines.map((l) => (
            <div key={l.k} className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">{l.k}</span>
              <span className="font-bold tabular-nums">{l.v}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Simulasi hanya -- TIDAK booking. Semua angka dari input user; 0 default/preset.
        </p>
      </div>

      {/* Riwayat + timeline event */}
      <div className="card p-4">
        <h2 className="mb-3 font-bold">Riwayat Akad ({d.rows.length})</h2>
        {d.rows.length === 0 ? (
          <Empty compact text="Belum ada akad. Gunakan form di atas." />
        ) : (
          <Table minW="min-w-[720px]">
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Jenis</Th>
                <Th>Counterparty</Th>
                <Th className="text-right">Jumlah</Th>
                <Th>Status</Th>
                <Th>Event</Th>
                {canWrite && <Th>Aksi</Th>}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => {
                const evs = eventsByAkad[r.id] ?? [];
                return (
                  <Trow key={r.id} hover>
                    <Td>{fmtDateTime(r.opened_at)}</Td>
                    <Td>{TYPE_LABELS[r.type] ?? r.type}</Td>
                    <Td>{r.counterparty}</Td>
                    <Td className="text-right font-bold tabular-nums">{rp(r.amount)}</Td>
                    <Td>
                      {r.status === 'settled' ? (
                        <Badge tone="green">settled</Badge>
                      ) : (
                        <Badge tone="gray">active</Badge>
                      )}
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {evs.length} event
                      </span>
                      {evs.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {evs.map((ev) => (
                            <div key={ev.id} className="flex flex-wrap items-center gap-1 text-xs">
                              <span className="tabular-nums">{fmtDateTime(ev.event_date)}</span>
                              <span>{KIND_LABELS[ev.kind] ?? ev.kind}</span>
                              <span className="font-bold tabular-nums">{rp(ev.amount)}</span>
                              {ev.entry_desc ? (
                                <span className="text-slate-500 dark:text-slate-400">
                                  {ev.entry_desc}
                                </span>
                              ) : null}
                              {eventBadge(ev, d.gl_enabled)}
                            </div>
                          ))}
                        </div>
                      )}
                    </Td>
                    {canWrite && (
                      <Td>
                        <Button variant="ghost" onClick={() => void toggleStatus(r)} disabled={busy}>
                          {r.status === 'settled' ? 'Ulangi (active)' : 'Tutup (settled)'}
                        </Button>
                      </Td>
                    )}
                  </Trow>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>

      {toast ? <Toast msg={toast} tone={toastTone} action={toastAction} onClose={clearToast} /> : null}
    </div>
  );
}

