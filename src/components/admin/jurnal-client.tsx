'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiRetry, Button, Table, Td, Th, Trow } from '@/components/ui';
import { fmtDate, rp, todayWibStr } from '@/lib/format';

/** Bentuk respons GET /api/gl (route W1.4). */
type CoaRow = { code: string; name: string; group: string; kind: string };
type Entry = {
  id: string;
  entry_date: string;
  type: string;
  desc: string;
  created_by: string | null;
  reversed_by: string | null;
  lines: { account_code: string; debit: number; credit: number }[];
};
type Resp = {
  ok?: boolean;
  period?: { from: string; to: string };
  coa?: CoaRow[];
  entries?: Entry[];
  notes?: string[];
  error?: string;
};

/** 'YYYY-MM' + n bulan -> 'YYYY-MM' (UTC-safe). */
function addMonths(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return String(d.getUTCFullYear()) + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function currentMonth(): string {
  return todayWibStr().slice(0, 7);
}

/** Baris form jurnal manual (input masih string; server memvalidasi). */
type ManualLine = { account_code: string; debit: string; credit: string };

const TYPE_PILL: Record<string, string> = {
  auto: 'bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300',
  manual: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  reversal: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  opening: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  closing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

/**
 * /admin/jurnal (admin-only): form jurnal manual + daftar jurnal periode
 * + jurnal pembalik (koreksi immutable, Sek.3.2.2). Tulis via
 * POST /api/jurnal; setelah sukses data dimuat ulang (cache 'gl:' sudah
 * di-invalidate di server).
 */
export function JurnalClient() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Form jurnal manual
  const [mDate, setMDate] = useState(todayWibStr());
  const [mDesc, setMDesc] = useState('');
  const [mLines, setMLines] = useState<ManualLine[]>([
    { account_code: '', debit: '', credit: '' },
  ]);
  const [busy, setBusy] = useState(false);

  // Jurnal pembalik (entry id + alasan)
  const [revFor, setRevFor] = useState<string | null>(null);
  const [revReason, setRevReason] = useState('');

  const load = useCallback(async (m: string) => {
    const r = await apiRetry<Resp>(
      '/api/gl?from=' + m + '-01&to=' + addMonths(m, 1) + '-01'
    );
    if (r.ok && r.data) {
      setData(r.data);
      setErr(r.data.error ?? '');
    } else {
      setData(null);
      setErr(r.error || 'Gagal memuat data jurnal.');
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [load, month]);

  const coaName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data?.coa ?? []) map.set(c.code, c.name);
    return map;
  }, [data]);

  // Baris valid (punya akun + jumlah) utk indikator keseimbangan.
  const validLines = mLines.filter(
    (l) => l.account_code && (l.debit !== '' || l.credit !== '')
  );
  const sumD = validLines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
  const sumK = validLines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
  const balanced = validLines.length > 0 && sumD === sumK && sumD > 0;

  async function submitManual() {
    if (busy || !balanced || !mDesc.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await api<{ ok?: boolean; entry_id?: string; error?: string }>('/api/jurnal', {
      method: 'POST',
      body: JSON.stringify({
        action: 'manual',
        date: mDate,
        desc: mDesc.trim(),
        lines: validLines.map((l) => ({
          account_code: l.account_code,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      }),
    });
    setBusy(false);
    if (r.ok && r.data?.ok) {
      setMsg({ ok: true, text: 'Jurnal manual tersimpan: ' + String(r.data.entry_id ?? '') });
      setMDesc('');
      setMLines([{ account_code: '', debit: '', credit: '' }]);
      load(month);
    } else {
      setMsg({ ok: false, text: r.data?.error || r.error || 'Gagal menyimpan jurnal.' });
    }
  }

  async function submitReverse() {
    if (busy || !revFor || !revReason.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await api<{ ok?: boolean; entry_id?: string; pending?: boolean; error?: string }>(
      '/api/jurnal',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'reverse', entry_id: revFor, reason: revReason.trim() }),
      }
    );
    setBusy(false);
    if (r.ok && r.data?.ok) {
      // P2/Q62: jurnal pembalik lewat approval flow (dua orang).
      setMsg({
        ok: true,
        text: r.data.pending
          ? 'Jurnal pembalik #' + revFor + ' menunggu persetujuan (lihat /admin/persetujuan).'
          : 'Jurnal pembalik dibuat: ' + String(r.data.entry_id ?? '') + ' (asli: ' + revFor + ')',
      });
      setRevFor(null);
      setRevReason('');
      load(month);
    } else {
      setMsg({
        ok: false,
        text: r.data?.error || r.error || 'Gagal membuat jurnal pembalik.',
      });
    }
  }

  const setLine = (i: number, patch: Partial<ManualLine>) => {
    setMLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  if (err)
    return (
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>
          <Button variant="ghost" onClick={() => load(month)}>
            Muat ulang
          </Button>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="card p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Memuat...</p>
      </div>
    );

  return (
    <div className="space-y-3">
      {/* Pesan aksi (berhasil / gagal) */}
      {msg && (
        <div
          className={
            'card p-4 text-sm font-bold ' +
            (msg.ok
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-rose-700 dark:text-rose-300')
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-normal">{msg.text}</span>
            <Button variant="ghost" onClick={() => setMsg(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      {/* Form jurnal manual */}
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold">Jurnal Manual</p>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            Periode tampilkan
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-normal dark:border-navy-600 dark:bg-navy-800"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
            Tanggal
            <input
              type="date"
              value={mDate}
              onChange={(e) => e.target.value && setMDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal dark:border-navy-600 dark:bg-navy-800"
            />
          </label>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
            Keterangan (wajib)
            <input
              type="text"
              value={mDesc}
              onChange={(e) => setMDesc(e.target.value)}
              placeholder="mis. Pembetulan kas entri #123"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal dark:border-navy-600 dark:bg-navy-800"
            />
          </label>
        </div>


        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Baris jurnal
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setMLines((prev) => [...prev, { account_code: '', debit: '', credit: '' }])
              }
            >
              Tambah baris
            </Button>
          </div>
          <div className="space-y-2">
            {mLines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  value={l.account_code}
                  onChange={(e) => setLine(i, { account_code: e.target.value })}
                  className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
                >
                  <option value="">Pilih akun...</option>
                  {(data.coa ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={l.debit}
                  onChange={(e) => setLine(i, { debit: e.target.value })}
                  placeholder="Debit"
                  className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={l.credit}
                  onChange={(e) => setLine(i, { credit: e.target.value })}
                  placeholder="Kredit"
                  className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
                />
                {mLines.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMLines((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Hapus
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span
              className={
                'rounded-full px-2 py-0.5 font-bold ' +
                (balanced
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-navy-700 dark:text-slate-400')
              }
            >
              {balanced
                ? 'Seimbang: ' + rp(sumD)
                : 'D: ' + rp(sumD) + ' | K: ' + rp(sumK) + (sumD === sumK ? ' (kosong)' : ' (belum seimbang)')}
            </span>
            <Button onClick={() => void submitManual()} disabled={busy || !balanced || !mDesc.trim()}>
              {busy ? 'Menyimpan...' : 'Simpan Jurnal'}
            </Button>
          </div>
        </div>
      </div>

      {/* Daftar jurnal periode */}
      {/* Daftar jurnal periode */}
      <div className="card p-4">
        <p className="mb-2 text-sm font-bold">
          Jurnal Periode ({(data.entries?.length ?? 0)} entry)
        </p>
        {(data.entries ?? []).length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Belum ada jurnal di periode ini.
          </p>
        ) : (
          <div className="space-y-3">
            {(data.entries ?? []).map((e) => {
              const totalE = e.lines.reduce((a, l) => a + l.debit, 0);
              const canReverse = !e.reversed_by && e.type !== 'reversal';
              return (
                <div
                  key={e.id}
                  className={'rounded-lg border p-3 ' + (e.reversed_by ? 'border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-navy-700')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={
                          'rounded-full px-2 py-0.5 font-bold ' +
                          (TYPE_PILL[e.type] ?? TYPE_PILL.auto)
                        }
                      >
                        {e.type}
                      </span>
                      <span className="font-mono">{fmtDate(e.entry_date)}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {e.created_by ? 'oleh ' + e.created_by : ''}
                      </span>
                    </div>
                    <span className="text-xs font-bold">Debit/Kredit: {rp(totalE)}</span>
                  </div>
                  {e.desc && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{e.desc}</p>
                  )}
                  <div className="mt-2 overflow-x-auto">
                    <Table minW="min-w-[32rem]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-navy-700">
                          <Th>Akun</Th>
                          <Th>Debit</Th>
                          <Th>Kredit</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.lines.map((l, i) => (
                          <Trow key={i}>
                            <Td className="text-xs">
                              <span className="font-mono">{l.account_code}</span>{' '}
                              {coaName.get(l.account_code) ?? ''}
                            </Td>
                            <Td>{l.debit > 0 ? rp(l.debit) : ''}</Td>
                            <Td>{l.credit > 0 ? rp(l.credit) : ''}</Td>
                          </Trow>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                  {e.reversed_by && (
                    <p className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                      Dibalik oleh {e.reversed_by}
                    </p>
                  )}
                  {canReverse &&
                    (revFor === e.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={revReason}
                          onChange={(ev) => setRevReason(ev.target.value)}
                          placeholder="Alasan pembalikan (wajib)"
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
                        />
                        <Button onClick={() => void submitReverse()} disabled={busy || !revReason.trim()}>
                          {busy ? 'Memproses...' : 'Balikan'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setRevFor(null);
                            setRevReason('');
                          }}
                        >
                          Batal
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRevFor(e.id);
                            setRevReason('');
                          }}
                        >
                          Balik Jurnal Ini
                        </Button>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Catatan */}
      {data.notes && data.notes.length > 0 && (
        <div className="card p-4">
          <p className="mb-2 text-sm font-bold">Catatan</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-slate-500 dark:text-slate-400">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


