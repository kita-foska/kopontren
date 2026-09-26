'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Empty, Toast, useToast } from '@/components/ui';
import { fetchTimeout } from '@/lib/fetch-util';
import { fmtDate, rp } from '@/lib/format';
import { wibToday } from '@/lib/zakat-period';

type ZakatCalc = {
  total_assets: number;
  modal: number;
  laba: number;
  piutang: number;
  hutang: number;
  nishab: number;
  status: 'wajib' | 'belum';
  zakat_amount: number;
  gold_price: number;
  nishab_gram: number;
  zakat_rate: number;
  period_start: string;
  haul_start_date: string;
  last_zakat_date: string;
};

type ZakatSettings = {
  gold_price: number;
  nishab_gram: number;
  zakat_rate: number;
  haul_start_date: string;
  last_zakat_date: string;
};

type ZakatHistoryRow = {
  id: number;
  total_assets: number;
  nishab: number;
  status: string;
  payment_type: string;
  zakat_amount: number;
  paid_at: string;
  note: string;
  created_at: string;
};

/** Label basa-awam utk media pembayaran (nilai DB tetap raw, skema v17). */
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
  other: 'Lainnya',
};

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'neutral';
}) {
  const cls =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-slate-800 dark:text-slate-100';
  return (
    <div className="card p-4">
      <p className="label">{label}</p>
      <p className={`mt-1 text-xl font-extrabold tracking-tight ${cls}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p> : null}
    </div>
  );
}

export function ZakatClient() {
  const [settings, setSettings] = useState<ZakatSettings | null>(null);
  const [calc, setCalc] = useState<ZakatCalc | null>(null);
  const [history, setHistory] = useState<ZakatHistoryRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [toast, showToast, clearToast] = useToast();

  const load = useCallback(async () => {
    const [s, c, h] = await Promise.all([
      api<ZakatSettings>('/api/zakat/settings'),
      api<ZakatCalc>('/api/zakat'),
      api<{ rows: ZakatHistoryRow[] }>('/api/zakat/history'),
    ]);
    if (s.ok && s.data) setSettings(s.data);
    if (c.ok && c.data) setCalc(c.data);
    if (h.ok && h.data) setHistory(h.data.rows);
    if (!s.ok || !c.ok || !h.ok) showToast('Gagal memuat data zakat');
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formState(): Record<string, string> {
    if (!settings) return {};
    return {
      gold_price: String(settings.gold_price),
      nishab_gram: String(settings.nishab_gram),
      zakat_rate: String(settings.zakat_rate),
      haul_start_date: settings.haul_start_date,
    };
  }

  async function saveSettings() {
    if (!settings) return;
    const f = formState();
    const gp = Number(f.gold_price);
    const ng = Number(f.nishab_gram);
    const zr = Number(f.zakat_rate);
    if (!(gp > 0) || !(ng > 0) || !(zr > 0) || zr > 100) {
      showToast('Periksa kembali: harga emas > 0, nishab > 0, kadar 0-100');
      return;
    }
    setBusy(true);
    const r = await api<{ settings: ZakatSettings }>('/api/zakat/settings', {
      method: 'POST',
      body: JSON.stringify(f),
    });
    setBusy(false);
    if (r.ok && r.data?.settings) {
      setSettings(r.data.settings);
      showToast('Pengaturan zakat disimpan');
      load();
    } else {
      showToast(r.error || 'Gagal menyimpan pengaturan');
    }
  }

  async function recordHistory() {
    setBusy(true);
    const r = await api<ZakatCalc & { cycle_advanced?: boolean }>('/api/zakat', {
      method: 'POST',
      body: JSON.stringify({ note: note.trim() || undefined, payment_type: paymentType }),
    });
    setBusy(false);
    if (r.ok) {
      setNote('');
      // Status 'belum' = belum wajib: riwayat tetap tercatat, tetapi
      // siklus zakat TIDAK di-reset (last_zakat_date tidak berubah).
      showToast(
        r.data?.cycle_advanced === false
          ? 'Dicatat "belum wajib" — siklus zakat tetap sejak pembayaran terakhir'
          : 'Zakat dicatat ke riwayat — siklus zakat baru dimulai hari ini'
      );
      load();
    } else {
      showToast(r.error || 'Gagal mencatat riwayat');
    }
  }

  async function exportCsv() {
    try {
      const res = await fetchTimeout('/api/zakat/history?csv=1');
      if (!res.ok) {
        showToast('Gagal mengekspor CSV');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zakat-history-${wibToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('CSV riwayat zakat diunduh');
    } catch {
      showToast('Gagal mengekspor CSV');
    }
  }

  const s = settings;
  const c = calc;
  return (
    <div className="space-y-4">
      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Total harta dagang"
          value={c ? rp(c.total_assets) : '—'}
          sub="modal + laba + piutang − hutang"
        />
        <StatCard
          label="Nishab"
          value={c ? rp(c.nishab) : '—'}
          sub={c ? `${c.nishab_gram} gram × ${rp(c.gold_price)}/gram` : undefined}
        />
        <StatCard
          label="Status"
          value={c ? (c.status === 'wajib' ? 'Wajib' : 'Belum wajib') : '—'}
          tone={c ? (c.status === 'wajib' ? 'ok' : 'warn') : 'neutral'}
          sub={c ? `kadar ${c.zakat_rate}%` : undefined}
        />
        <StatCard
          label={c ? `Zakat ${c.zakat_rate}%` : 'Zakat'}
          value={c ? rp(c.zakat_amount) : '—'}
          tone={c?.status === 'wajib' ? 'ok' : 'neutral'}
          sub={c?.status === 'wajib' ? 'dibayar 1× setahun (haul)' : 'harta di bawah nishab'}
        />
      </div>

      {/* Detail perhitungan */}
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Detail Perhitungan
        </h2>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-navy-800">
          <li className="flex items-center justify-between py-1.5">
            <span>Modal (stok × HPP produk aktif)</span>
            <span className="font-bold">{c ? rp(c.modal) : '—'}</span>
          </li>
          <li className="flex items-center justify-between py-1.5">
            <span>
              Laba kotor (penjualan − COGS)
              {c ? (
                <span className="ml-1 text-xs text-slate-500">sejak {fmtDate(c.period_start)}</span>
              ) : null}
            </span>
            <span className={`font-bold ${c && c.laba < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
              {c ? rp(c.laba) : '—'}
            </span>
          </li>
          <li className="flex items-center justify-between py-1.5">
            <span>Piutang (hutang customer, status open)</span>
            <span className="font-bold">{c ? rp(c.piutang) : '—'}</span>
          </li>
          <li className="flex items-center justify-between py-1.5">
            <span>Hutang (kewajiban dagang)</span>
            <span className="font-bold">{c ? rp(c.hutang) : '—'}</span>
          </li>
          <li className="flex items-center justify-between py-1.5">
            <span className="font-extrabold">Total harta dagang</span>
            <span className="text-base font-extrabold text-accent-600 dark:text-accent-300">
              {c ? rp(c.total_assets) : '—'}
            </span>
          </li>
        </ul>
      </div>

      {/* Aksi */}
      <div className="card flex flex-wrap items-center gap-2 p-4 print:hidden">
        <button type="button" className="btn btn-primary" onClick={() => load()} disabled={busy}>
          Hitung Ulang
        </button>
        <button type="button" className="btn btn-amber" onClick={recordHistory} disabled={busy || !c}>
          Simpan ke Riwayat
        </button>
        <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={history === null}>
          Export CSV
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          Print
        </button>
        <select
          className="input ml-auto w-auto max-w-full"
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value)}
          aria-label="Media pembayaran zakat"
        >
          {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="input w-56 max-w-full"
          placeholder="Catatan (opsional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
        />
      </div>
      {/* Form pengaturan */}
      <div className="card p-4 print:hidden">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Pengaturan
        </h2>
        {s ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Harga emas 24 karat per gram (Rp)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={String(s.gold_price)}
                onChange={(e) => setSettings({ ...s, gold_price: Number(e.target.value) })}
                placeholder="mis. 1100000"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                1 gram emas murni = {rp(s.gold_price)} — pakai harga emas 24 karat (murni); emas 14/18 karat TIDAK boleh jadi dasar nisab (Muktamar NU ke-35, madzhab Syafi'i: nisab = 85 g emas murni)
              </p>
            </div>
            <div>
              <label className="label">Nishab (gram)</label>
              <input
                className="input"
                type="number"
                min={0.0001}
                step="any"
                value={String(s.nishab_gram)}
                onChange={(e) => setSettings({ ...s, nishab_gram: Number(e.target.value) })}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                85 gram = 20% dari 425 gram emas
              </p>
            </div>
            <div>
              <label className="label">Kadar zakat (%)</label>
              <input
                className="input"
                type="number"
                min={0.0001}
                max={100}
                step="any"
                value={String(s.zakat_rate)}
                onChange={(e) => setSettings({ ...s, zakat_rate: Number(e.target.value) })}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Standar 2,5% (1/40)
              </p>
            </div>
            <div>
              <label className="label">Tanggal mulai haul</label>
              <input
                className="input"
                type="date"
                value={s.haul_start_date}
                onChange={(e) => setSettings({ ...s, haul_start_date: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Kosongkan = laba dihitung sejak awal bulan berjalan
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 sm:col-span-2 dark:border-navy-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Zakat terakhir dibayar:{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {s.last_zakat_date ? fmtDate(s.last_zakat_date) : 'belum pernah'}
                </span>
              </p>
              <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={busy}>
                Simpan Pengaturan
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Memuat…</p>
        )}
      </div>

      {/* Riwayat */}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Riwayat Zakat
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {history ? `${history.length} catatan` : 'Memuat…'}
          </p>
        </div>
        {history && history.length === 0 ? (
          <Empty text="Belum ada riwayat zakat. Gunakan tombol “Simpan ke Riwayat”." />
        ) : history && history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-navy-800">
                  <th className="py-2 pr-3">Tanggal</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Pembayaran</th>
                  <th className="py-2 pr-3 text-right">Harta Dagang</th>
                  <th className="py-2 pr-3 text-right">Nishab</th>
                  <th className="py-2 pr-3 text-right">Zakat</th>
                  <th className="py-2">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 dark:border-navy-800"
                  >
                    <td className="py-2 pr-3">{fmtDate(r.paid_at)}</td>
                    <td className="py-2 pr-3">
                      {r.status === 'wajib' ? (
                        <Badge tone="green">Wajib</Badge>
                      ) : (
                        <Badge tone="amber">Belum</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">{PAYMENT_LABELS[r.payment_type] ?? r.payment_type}</td>
                    <td className="py-2 pr-3 text-right">{rp(r.total_assets)}</td>
                    <td className="py-2 pr-3 text-right">{rp(r.nishab)}</td>
                    <td className="py-2 pr-3 text-right font-bold">{rp(r.zakat_amount)}</td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {toast ? <Toast msg={toast} onClose={clearToast} /> : null}
    </div>
  );
}

