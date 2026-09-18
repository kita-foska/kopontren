'use client';

import { useRef, useState } from 'react';
import { parseImport, importWarnings, type ImportRow, type RowError } from '@/lib/product-import';

type BatchResult = {
  inserted: number;
  updated: number;
  failed: RowError[];
  errors: RowError[];
  total_products?: number;
  warn_cost_zero?: { count: number; items: string[] };
  warn_low_margin?: {
    count: number;
    items: { name: string; base_price: number; cost_price: number; margin_pct: number }[];
  };
};

const BATCH_SIZE = 50;
const rp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

type Phase = 'idle' | 'preview' | 'running' | 'done' | 'error';

export function MigrateClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<BatchResult | null>(null);
  const [fatal, setFatal] = useState('');

  async function onFile(f: File) {
    setFileName(f.name);
    setParseError('');
    const text = await f.text();
    try {
      const parsed = parseImport(text);
      setRows(parsed.rows);
      setRowErrors(parsed.errors);
      setPhase('preview');
    } catch (e) {
      setRows([]);
      setRowErrors([]);
      setParseError(String((e as { message?: string })?.message || e));
      setPhase('preview');
    }
  }

  async function startImport() {
    setPhase('running');
    setSummary(null);
    setFatal('');
    const total = rows.length;
    setProgress({ done: 0, total });
    let inserted = 0;
    let updated = 0;
    const failed: RowError[] = [];
    const preErrors: RowError[] = [...rowErrors];
    let last: BatchResult | null = null;
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch('/api/migrate/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch, total }),
        });
        const j = (await res.json().catch(() => ({}))) as BatchResult & { error?: string };
        if (!res.ok) {
          setFatal(j.error || `HTTP ${res.status}`);
          setPhase('error');
          return;
        }
        inserted += j.inserted;
        updated += j.updated;
        failed.push(...(j.failed || []));
        last = j;
      } catch (e) {
        setFatal(`Koneksi terputus: ${String((e as { message?: string })?.message || e)}`);
        setPhase('error');
        return;
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, total), total });
    }
    setSummary({
      inserted,
      updated,
      failed,
      errors: preErrors,
      total_products: last?.total_products,
      warn_cost_zero: last?.warn_cost_zero,
      warn_low_margin: last?.warn_low_margin,
    });
    setPhase('done');
  }

  function downloadReport() {
    const report = {
      generated_at: new Date().toISOString(),
      file: fileName,
      total_rows: rows.length,
      inserted: summary?.inserted ?? 0,
      updated: summary?.updated ?? 0,
      failed: summary?.failed ?? [],
      pre_validation_errors: summary?.errors ?? [],
      total_products: summary?.total_products ?? null,
      warn_cost_zero: summary?.warn_cost_zero ?? null,
      warn_low_margin: summary?.warn_low_margin ?? null,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-laporan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const w = rows.length ? importWarnings(rows) : { costZero: [], lowMargin: [] };
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          File CSV produk
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {fileName && <span className="text-sm text-slate-500 dark:text-slate-400">{fileName}</span>}
          {phase === 'preview' && rows.length > 0 && (
            <button className="btn-primary" onClick={() => void startImport()}>
              Import {rows.length} baris
            </button>
          )}
          {phase === 'done' && summary && (
            <button className="btn-ghost" onClick={downloadReport}>
              Unduh Laporan (JSON)
            </button>
          )}
        </div>
        {parseError && <p className="mt-2 text-sm text-red-500">{parseError}</p>}
      </div>

      {phase === 'preview' && (
        <div className="card p-4">
          <h2 className="mb-2 font-bold">
            Pratinjau ({rows.length} baris valid, {rowErrors.length} bermasalah)
          </h2>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {w.costZero.length > 0 && (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 font-semibold text-amber-600 dark:text-amber-300">
                {w.costZero.length} harga modal = 0
              </span>
            )}
            {w.lowMargin.length > 0 && (
              <span className="rounded-full bg-rose-500/15 px-3 py-1 font-semibold text-rose-600 dark:text-rose-300">
                {w.lowMargin.length} margin &lt; 5%
              </span>
            )}
          </div>
          {rows.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-navy-600">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500 dark:bg-navy-800 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2">Kategori</th>
                    <th className="px-3 py-2">HSL</th>
                    <th className="px-3 py-2">HPP</th>
                    <th className="px-3 py-2">Stok</th>
                    <th className="px-3 py-2">Barcode</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r) => (
                    <tr key={`${r.line}-${r.barcode}`} className="border-t border-slate-100 dark:border-navy-700">
                      <td className="px-3 py-1.5 text-slate-400">{r.line}</td>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5">{r.category || '-'}</td>
                      <td className="px-3 py-1.5">{rp(r.base_price)}</td>
                      <td className="px-3 py-1.5">{rp(r.cost_price)}</td>
                      <td className="px-3 py-1.5">{r.stock}</td>
                      <td className="px-3 py-1.5">{r.barcode || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 && (
                <p className="px-3 py-2 text-xs text-slate-400">
                  + {rows.length - 200} baris lain tidak ditampilkan.
                </p>
              )}
            </div>
          )}
          {rowErrors.length > 0 && (
            <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              <b>{rowErrors.length} baris dilewati:</b>
              <ul className="mt-1 list-disc pl-4">
                {rowErrors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
                {rowErrors.length > 20 && <li>… dan {rowErrors.length - 20} lagi</li>}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Upsert: barcode sama = <b>update</b>; tanpa barcode, nama sama (case-insensitive) = <b>update</b>;
            selain itu = baris baru.
          </p>
        </div>
      )}

      {phase === 'running' && (
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Sedang import… {pct}%</h2>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-navy-700">
            <div
              className="h-full rounded-full bg-accent-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {progress.done} / {progress.total} baris diproses
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="card border-red-500/40 p-4 text-sm text-red-600 dark:text-red-300">
          <p>Gagal: {fatal}</p>
          <button
            className="btn-ghost mt-3"
            onClick={() => {
              setPhase('preview');
              setFatal('');
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      {phase === 'done' && summary && (
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Selesai</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Baru</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {summary.inserted}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Di-update</p>
              <p className="text-2xl font-extrabold text-sky-600 dark:text-sky-400">{summary.updated}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Gagal</p>
              <p className="text-2xl font-extrabold text-red-600 dark:text-red-400">
                {summary.failed.length}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Total produk</p>
              <p className="text-2xl font-extrabold">{summary.total_products}</p>
            </div>
          </div>
          {summary.warn_cost_zero && summary.warn_cost_zero.count > 0 && (
            <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <b>{summary.warn_cost_zero.count} produk harga modal = 0</b> (contoh):{' '}
              {summary.warn_cost_zero.items.slice(0, 8).join(', ')}
            </div>
          )}
          {summary.warn_low_margin && summary.warn_low_margin.count > 0 && (
            <div className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <b>{summary.warn_low_margin.count} produk margin &lt; 5%:</b>
              <ul className="mt-1 list-disc pl-4">
                {summary.warn_low_margin.items.slice(0, 10).map((p, i) => (
                  <li key={i}>
                    {p.name} — HSL {rp(p.base_price)} / HPP {rp(p.cost_price)} (margin {p.margin_pct}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.failed.length > 0 && (
            <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              <b>{summary.failed.length} baris gagal di database:</b>
              <ul className="mt-1 list-disc pl-4">
                {summary.failed.slice(0, 10).map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
