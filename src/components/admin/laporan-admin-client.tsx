'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, PageSkeleton, Toast, useToast } from '@/components/ui';
import { rp, startOfDayJakarta, todayWibStr } from '@/lib/format';
import { buildLabaRugiWa, shareRekap } from '@/lib/rekap';
import type { KeuanganPayload } from '@/lib/keuangan';
import { ChevronDown, FileDown, MessageCircle } from 'lucide-react';

type Summary = {
  from: string;
  to: string;
  sales_count: number;
  sales_total: number;
  cogs: number;
  profit: number;
  purchases_total: number;
  expenses_total: number;
  cash_net: number;
  by_method: Record<string, number>;
  top: { name: string; qty: number; revenue: number }[];
};

/** Shape respons /api/keuangan (FASE A1): KeuanganPayload + envelope & notes. */
type LabaRugi = KeuanganPayload & {
  ok: boolean;
  from: string;
  to: string;
  notes: string[];
};

/** Preset periode Laba-Rugi; 'custom' ditangani input tanggal user. */
type PlPreset = '1' | '7' | '30' | 'bulan' | 'tahun' | 'custom';

/** Preset → rentang hari kalender WIB (ujung selalu hari ini WIB). */
function plPresetRange(p: Exclude<PlPreset, 'custom'>): { from: string; to: string } {
  const t = todayWibStr();
  switch (p) {
    case '1':
      return { from: t, to: t };
    case '7':
      return { from: startOfDayJakarta(-6).slice(0, 10), to: t };
    case '30':
      return { from: startOfDayJakarta(-29).slice(0, 10), to: t };
    case 'bulan':
      return { from: t.slice(0, 7) + '-01', to: t };
    case 'tahun':
      return { from: t.slice(0, 4) + '-01-01', to: t };
  }
}

/** Label periode ramah (WIB): "1 Sep 2026" / "1 Sep 2026 - 30 Sep 2026". */
function plPeriodLabel(from: string, to: string): string {
  const fmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const f = new Date(from + 'T00:00:00+07:00');
  if (from === to) return fmt.format(f);
  const t2 = new Date(to + 'T00:00:00+07:00');
  return fmt.format(f) + ' - ' + fmt.format(t2);
}

/** Baris statement P&L (konvensi buku: negatif dalam tanda kurung, merah). */
function PlRow({
  label,
  value,
  sub,
  strong,
  neg,
  indent,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  neg?: boolean;
  indent?: boolean;
}) {
  return (
    <div className={'flex items-baseline justify-between gap-3 py-1' + (indent ? ' pl-4' : '')}>
      <span
        className={
          'text-sm ' +
          (strong
            ? 'font-extrabold text-slate-900 dark:text-slate-100'
            : 'text-slate-600 dark:text-slate-300')
        }
      >
        {label}
        {sub ? (
          <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">{sub}</span>
        ) : null}
      </span>
      <span
        className={
          'text-sm ' +
          (strong ? 'font-extrabold ' : 'font-medium ') +
          (neg
            ? 'text-rose-600 dark:text-rose-400'
            : strong
              ? 'text-slate-900 dark:text-slate-100'
              : 'text-slate-700 dark:text-slate-300')
        }
      >
        {value}
      </span>
    </div>
  );
}

export function LaporanAdminClient() {
  const [tab, setTab] = useState<'ringkasan' | 'laba'>('ringkasan');
  const [period, setPeriod] = useState('30');
  const [s, setS] = useState<Summary | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const r = await api<Summary>('/api/reports?days=' + period);
    if (r.ok && r.data) setS(r.data);
  }, [period]);
  useEffect(() => {
    load();
  }, [load]);

  async function csv() {
    const from = startOfDayJakarta(Number(period) === 0 ? -3650 : -Number(period) + 1);
    // Blob download: tanpa tab baru/flicker (window.open dulu buka tab kosong).
    try {
      const r = await fetch('/api/reports/csv?from=' + encodeURIComponent(from));
      if (!r.ok) {
        showToast('Gagal unduh CSV (HTTP ' + r.status + ')');
        return;
      }
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = 'penjualan-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    } catch {
      showToast('Gagal unduh CSV (jaringan)');
    }
  }

  if (!s) return <p className="text-sm text-slate-500">Memuat…</p>;

  const cards = [
    { label: 'Penjualan', value: rp(s.sales_total), sub: s.sales_count + ' transaksi', cls: 'text-accent-500 dark:text-accent-300' },
    { label: 'HPP (biaya produk)', value: rp(s.cogs), sub: 'basis harga beli', cls: 'text-amber-600 dark:text-amber-400' },
    { label: 'Laba kotor', value: rp(s.profit), sub: 'penjualan − HPP', cls: s.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' },
    { label: 'Kas keluar (belanja)', value: rp(s.purchases_total), sub: 'stok masuk', cls: 'text-rose-600 dark:text-rose-400' },
    { label: 'Pengeluaran', value: rp(s.expenses_total), sub: 'listrik, operasional', cls: 'text-rose-600 dark:text-rose-400' },
    { label: 'Arus kas neto', value: rp(s.cash_net), sub: 'masuk − keluar', cls: s.cash_net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' },
  ];

  return (
    <div>
      {/* Tab A1: "Ringkasan" = konten & perilaku lama (intinya tak diubah);
          "Laba-Rugi" = statement P&L V1 (/api/keuangan). */}
      <div className="mb-3 flex gap-1 border-b border-slate-200 dark:border-navy-700">
        {(
          [
            ['ringkasan', 'Ringkasan'],
            ['laba', 'Laba-Rugi'],
          ] as ['ringkasan' | 'laba', string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={
              'rounded-t-lg px-4 py-2 text-sm font-bold ' +
              (tab === k
                ? 'border-b-2 border-accent-500 text-accent-600 dark:text-accent-300'
                : 'text-slate-500 dark:text-slate-400')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ringkasan' ? (
        <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[
          [1, 'Hari ini'],
          [7, '7 hari'],
          [30, '30 hari'],
          [365, '1 tahun'],
        ].map(([v, label]) => (
          <button type="button"
            key={v}
            onClick={() => setPeriod(String(v))}
            className={
              'rounded-full px-3 py-1 text-xs font-bold ' +
              (period === String(v)
                ? 'bg-accent-500 text-white'
                : 'border border-slate-300 text-slate-600 dark:border-navy-600 dark:text-slate-300')
            }
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={csv} className="btn-ghost ml-auto">
          Unduh CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {c.label}
            </p>
            <p className={'mt-1 text-xl font-extrabold ' + c.cls}>{c.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Top produk</h2>
          {s.top.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada penjualan di periode ini.</p>
          ) : (
            <ul className="space-y-1.5">
              {s.top.map((t) => (
                <li key={t.name} className="flex items-center justify-between text-sm">
                  <span>{t.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {t.qty} terjual · <b className="text-slate-800 dark:text-slate-200">{rp(t.revenue)}</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <h2 className="mb-2 font-bold">Metode pembayaran</h2>
          <ul className="space-y-1.5 text-sm">
            {Object.keys(s.by_method || {}).length === 0 && (
              <li className="text-slate-500">Belum ada data.</li>
            )}
            {Object.entries(s.by_method || {}).map(([m, v]) => (
              <li key={m} className="flex items-center justify-between">
                <span className="capitalize">{m}</span>
                <b>{rp(v)}</b>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Catatan: laba kotor menggunakan HPP historis saat penjualan (snapshot harga beli). Jika HPP item tidak tercatat, menggunakan harga beli produk saat ini.
          </p>
        </div>
      </div>
      </>
      ) : (
        <LabaRugiTab />
      )}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}

/**
 * FASE A1 — tab "Laba-Rugi": P&L Operasional V1 via /api/keuangan.
 * "Berdasarkan transaksi yang tercatat" — BUKAN akuntansi final (batas
 * tampil di kotak "Catatan V1", sumber: KEUANGAN_NOTES @ lib/keuangan.ts).
 */
export function LabaRugiTab() {
  const [preset, setPreset] = useState<PlPreset>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<LabaRugi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [catOpen, setCatOpen] = useState(false);

  const load = useCallback(async () => {
    let from: string;
    let to: string;
    if (preset === 'custom') {
      from = customFrom;
      to = customTo;
      if (!from || !to) {
        // Rentang belum lengkap: hapus data periode lama agar tidak
        // misleading (user belum memilih tanggal).
        setData(null);
        setErr('');
        setLoading(false);
        return;
      }
    } else {
      const r = plPresetRange(preset);
      from = r.from;
      to = r.to;
    }
    setLoading(true);
    setErr('');
    setCatOpen(false);
    const r = await api<LabaRugi>(
      '/api/keuangan?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to)
    );
    if (r.ok && r.data) setData(r.data);
    else setErr(r.error || 'Gagal memuat laporan laba-rugi');
    setLoading(false);
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    void load();
  }, [load]);

  async function shareWa() {
    if (data) await shareRekap(buildLabaRugiWa(data, data.from, data.to));
  }

  const btnPreset = (active: boolean) =>
    'rounded-full px-3 py-1 text-xs font-bold ' +
    (active
      ? 'bg-accent-500 text-white'
      : 'border border-slate-300 text-slate-600 dark:border-navy-600 dark:text-slate-300');

  const presets: [PlPreset, string][] = [
    ['1', 'Hari ini'],
    ['7', '7 hari'],
    ['30', '30 hari'],
    ['bulan', 'Bulan ini'],
    ['tahun', 'Tahun ini'],
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {presets.map(([v, label]) => (
          <button key={v} type="button" onClick={() => setPreset(v)} className={btnPreset(preset === v)}>
            {label}
          </button>
        ))}
        <button type="button" onClick={() => setPreset('custom')} className={btnPreset(preset === 'custom')}>
          Rentang…
        </button>
        {preset === 'custom' && (
          <span className="flex items-center gap-1 text-xs">
            <input type="date" className="input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            –
            <input type="date" className="input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </span>
        )}
        <button type="button" onClick={shareWa} className="btn-ghost ml-auto" title="Bagikan via WhatsApp">
          <MessageCircle size={14} /> Bagikan
        </button>
      </div>

      {loading && !data ? (
        <p className="text-sm text-slate-500">Memuat…</p>
      ) : err && !data ? (
        <div className="card p-4 text-sm text-rose-600 dark:text-rose-400">{err}</div>
      ) : data ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-bold">Laba-Rugi Operasional (V1)</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {plPeriodLabel(data.from, data.to)} · {data.sales_count} transaksi
              </span>
            </div>
            <PlRow label="Penjualan Bruto" value={rp(data.pendapatan.bruto)} sub="neto + potongan + redeem" />
            <PlRow indent label="Diskon manual" value={'−' + rp(data.pendapatan.diskonManual)} neg />
            <PlRow indent label="Diskon member" value={'−' + rp(data.pendapatan.diskonMember)} neg />
            <PlRow indent label="Redeem poin/saldo" value={'−' + rp(data.pendapatan.redeem)} neg />
            <PlRow indent label="Retur tercatat" value={'−' + rp(data.pendapatan.retur)} neg />
            <PlRow label="Pendapatan Bersih" value={rp(data.pendapatan.bersih)} strong />
            <PlRow label="HPP (COGS)" value={'−' + rp(data.hpp)} neg sub="snapshot saat penjualan" />
            <PlRow label="Laba Kotor" value={rp(data.labaKotor)} strong />
            <PlRow
              label="Beban Operasional"
              value={'−' + rp(data.beban.total)}
              neg
              sub={data.beban.count + ' jurnal'}
            />
            {data.beban.byCategory.length > 0 && (
              <div className="mb-1 pl-4">
                <button
                  type="button"
                  onClick={() => setCatOpen((o) => !o)}
                  className="flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400"
                >
                  <ChevronDown size={12} className={'transition ' + (catOpen ? 'rotate-180' : '')} />
                  Detail beban ({data.beban.byCategory.length} kategori)
                </button>
                {catOpen &&
                  data.beban.byCategory.map((k) => (
                    <PlRow
                      key={k.kategori}
                      indent
                      label={k.kategori}
                      value={'−' + rp(k.total)}
                      sub={k.count + ' jurnal'}
                      neg
                    />
                  ))}
              </div>
            )}
            <PlRow
              label="Laba Bersih"
              value={data.labaBersih < 0 ? '−' + rp(-data.labaBersih) : rp(data.labaBersih)}
              strong
              neg={data.labaBersih < 0}
            />
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-navy-700">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Memo (di luar laba bersih)
              </h3>
              <PlRow
                indent
                label="Saldo Reward Diberikan"
                value={rp(data.memo.cashback.total)}
                sub="kewajiban member"
              />
              <PlRow
                indent
                label="Zakat Tercatat"
                value={rp(data.memo.zakat.total)}
                sub={data.memo.zakat.count + ' jurnal'}
              />
              <PlRow
                indent
                label="Settlement Konsinyasi"
                value={rp(data.memo.konsinyasi.total)}
                sub="pembayaran ke pemilik barang"
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Memo tidak dijumlahkan ke laba bersih.
              </p>
            </div>
          </div>
          <div className="card p-4">
            <h2 className="mb-2 font-bold">Catatan V1</h2>
            <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              {data.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Pilih rentang tanggal untuk menampilkan laporan.</p>
      )}
    </div>
  );
}
