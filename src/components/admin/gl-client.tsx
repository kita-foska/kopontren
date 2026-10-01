'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Button, Table, Td, Th, Trow } from '@/components/ui';
import { rp, todayWibStr } from '@/lib/format';

/** Bentuk respons GET /api/gl (route W1.4). */
type CoaRow = { code: string; name: string; group: string; kind: string };
type TrialRow = {
  code: string;
  name: string;
  group: string;
  debit: number;
  credit: number;
  diff: number;
};
type Resp = {
  ok?: boolean;
  period?: { from: string; to: string };
  coa?: CoaRow[];
  trial?: TrialRow[];
  totals?: { debit: number; credit: number };
  balanced?: boolean;
  entries?: { id: string }[];
  notes?: string[];
  error?: string;
};

/** 'YYYY-MM' + n bulan -> 'YYYY-MM' (UTC-safe, tanpa TZ local). */
function addMonths(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return String(d.getUTCFullYear()) + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

/** Bulan WIB saat ini ('YYYY-MM') - default periode tampilan. */
function currentMonth(): string {
  return todayWibStr().slice(0, 7);
}

/**
 * /admin/gl: neraca saldo per bulan. Read-only (tulis hanya via
 * /admin/jurnal). Periode = bulan yang dipilih; to eksklusif (awal bulan
 * berikutnya), selaras semantik GET /api/gl.
 */
export function GLClient() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async (m: string) => {
    const from = m + '-01';
    const to = addMonths(m, 1) + '-01';
    const r = await api<Resp>('/api/gl?from=' + from + '&to=' + to);
    if (r.ok && r.data) {
      setData(r.data);
      setErr(r.data.error ?? '');
    } else {
      setData(null);
      setErr(r.error || 'Gagal memuat GL.');
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [load, month]);

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

  const trial = data.trial ?? [];
  const tot = data.totals ?? { debit: 0, credit: 0 };
  const balanced = data.balanced ?? tot.debit === tot.credit;

  return (
    <div className="space-y-3">
      {/* Periode + status keseimbangan */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Periode
          </label>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
          />
          <Button variant="ghost" onClick={() => load(month)}>
            Muat ulang
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={
              'rounded-full px-3 py-1 text-xs font-bold ' +
              (balanced
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300')
            }
          >
            {balanced ? 'Seimbang' : 'Tidak seimbang'}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {trial.length} akun bermutasi | {(data.entries?.length ?? 0)} jurnal di periode
          </span>
        </div>
      </div>

      {/* Neraca saldo */}
      <div className="card p-4">
        <p className="mb-2 text-sm font-bold">Neraca Saldo (kumulatif s.d. akhir periode)</p>
        {trial.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Belum ada mutasi jurnal. Auto-posting aktif bila setting gl_enabled=1.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table minW="min-w-[40rem]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-700">
                  <Th>Kode</Th>
                  <Th>Akun</Th>
                  <Th>Grup</Th>
                  <Th>Debit</Th>
                  <Th>Kredit</Th>
                  <Th>Selisih</Th>
                </tr>
              </thead>
              <tbody>
                {trial.map((r) => (
                  <Trow key={r.code}>
                    <Td className="font-mono text-xs">{r.code}</Td>
                    <Td>{r.name}</Td>
                    <Td className="text-xs text-slate-500 dark:text-slate-400">{r.group}</Td>
                    <Td>{r.debit > 0 ? rp(r.debit) : ''}</Td>
                    <Td>{r.credit > 0 ? rp(r.credit) : ''}</Td>
                    <Td
                      className={
                        'text-xs font-bold ' +
                        (r.diff === 0
                          ? 'text-slate-400 dark:text-slate-500'
                          : 'text-rose-600 dark:text-rose-400')
                      }
                    >
                      {r.diff === 0 ? '0' : rp(r.diff)}
                    </Td>
                  </Trow>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-4 border-t border-slate-200 pt-2 text-xs font-bold dark:border-navy-700">
          <span>Total Debit: {rp(tot.debit)}</span>
          <span>Total Kredit: {rp(tot.credit)}</span>
          {!balanced && (
            <span className="text-rose-600 dark:text-rose-400">
              Selisih: {rp(tot.debit - tot.credit)}
            </span>
          )}
        </div>
      </div>

      {/* Catatan V1 */}
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

