'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Empty, Toast, useToast } from '@/components/ui';
import { fetchTimeout } from '@/lib/fetch-util';
import { fmtDate, rp } from '@/lib/format';
import { wibToday } from '@/lib/zakat-period';

type GoldStandardRow = {
  id: number;
  karat: string;
  price_per_gram: number;
  source: string;
  price_date: string;
  decided_by: string;
  created_at: string;
};

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
  // ── P3 Step 2 (PROVISIONAL — menunggu tashih pengasuh): ──
  valuation_mode: string; // 'market' | 'hpp'
  gold_standard: GoldStandardRow | null; // standar terkini (log append-only)
  haul_anchor: {
    anchor: string;
    source: 'haul_start' | 'last_payment' | 'current_month';
    haul_end: string;
    days_elapsed: number;
    days_total: number;
    status: 'belum_haul' | 'haul_jatuh';
  };
  days_elapsed: number;
  accrued: number;
  haul_end: string;
  is_admin?: boolean; // hanya respons GET /api/zakat
};

type ZakatSettings = {
  gold_price: number;
  nishab_gram: number;
  zakat_rate: number;
  haul_start_date: string;
  last_zakat_date: string;
  valuation_mode: string;
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

/** P3 Step 2 (PROVISIONAL — menunggu tashih pengasuh): label mode
 *  penilaian harta dagang. */
const VALUATION_LABELS: Record<string, string> = {
  market: 'Nilai pasar (provisional)',
  hpp: 'HPP (konservatif)',
};

/** Sumber anchor periode (fallback chain, lihat src/lib/zakat-valuation.ts). */
const HAUL_SOURCE_LABELS: Record<string, string> = {
  haul_start: 'anchor (tanggal mulai haul)',
  last_payment: 'fallback: pembayaran terakhir',
  current_month: 'fallback: awal bulan berjalan',
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
  const [goldLog, setGoldLog] = useState<GoldStandardRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [goldForm, setGoldForm] = useState({
    karat: '24K',
    price: '',
    source: '',
    price_date: wibToday(),
    apply: true,
  });
  const [toast, showToast, clearToast] = useToast();

  const load = useCallback(async () => {
    const [s, c, h, g] = await Promise.all([
      api<ZakatSettings>('/api/zakat/settings'),
      api<ZakatCalc>('/api/zakat'),
      api<{ rows: ZakatHistoryRow[] }>('/api/zakat/history'),
      api<{ rows: GoldStandardRow[] }>('/api/zakat/gold-standards').catch(() => null),
    ]);
    if (s.ok && s.data) setSettings(s.data);
    if (c.ok && c.data) setCalc(c.data);
    if (h.ok && h.data) setHistory(h.data.rows);
    if (g && g.ok && g.data) setGoldLog(g.data.rows);
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
      valuation_mode: settings.valuation_mode, // P3 Step 2 (provisional)
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
      // P3 Step 2 (PROVISIONAL — menunggu tashih): status 'belum' = belum
      // wajib: riwayat tercatat, periode tak berubah. Status 'wajib' =
      // pembayaran ta'jil: audit (last_zakat_date) diperbarui, TAPI
      // haul ter-anchor (haul_start_date) tidak di-reset.
      showToast(
        r.data?.cycle_advanced === false
          ? 'Dicatat "belum wajib" — periode zakat tidak berubah'
          : "Zakat dicatat (audit) — haul ter-anchor tidak di-reset (ta'jil, provisional)"
      );
      load();
    } else {
      showToast(r.error || 'Gagal mencatat riwayat');
    }
  }

  /** P3 Step 2 (provisional): catat entri verifikasi harga emas baru
   *  (admin-only di server; log append-only — koreksi = entri baru). */
  async function logGold() {
    const price = Number(goldForm.price);
    if (!(price > 0)) {
      showToast('Harga per gram harus > 0');
      return;
    }
    setBusy(true);
    const r = await api('/api/zakat/gold-standards', {
      method: 'POST',
      body: JSON.stringify({
        karat: goldForm.karat,
        price_per_gram: price,
        source: goldForm.source.trim(),
        price_date: goldForm.price_date,
        apply: goldForm.apply,
      }),
    });
    setBusy(false);
    if (r.ok) {
      showToast(goldForm.apply ? 'Verifikasi dicatat + disinkronkan ke Pengaturan' : 'Verifikasi harga emas dicatat');
      load();
    } else {
      showToast(r.error || 'Gagal mencatat verifikasi');
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
        {/* P3 Step 2 (PROVISIONAL — menunggu tashih): haul + akumulasi */}
        <StatCard
          label="Haul (provisional)"
          value={c ? fmtDate(c.haul_anchor.anchor) : '—'}
          tone={c?.haul_anchor.status === 'haul_jatuh' ? 'warn' : 'neutral'}
          sub={
            c
              ? `${HAUL_SOURCE_LABELS[c.haul_anchor.source] ?? c.haul_anchor.source} · s.d. ${fmtDate(c.haul_end)} · ${c.days_elapsed}/${c.haul_anchor.days_total} hari`
              : undefined
          }
        />
        <StatCard
          label="Akumulasi (provisional)"
          value={c ? rp(c.accrued) : '—'}
          tone={c && c.accrued > 0 ? 'ok' : 'neutral'}
          sub={c ? `sejak ${fmtDate(c.haul_anchor.anchor)} · ${c.days_elapsed} hari` : undefined}
        />
      </div>

      {/* Detail perhitungan */}
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Detail Perhitungan
        </h2>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-navy-800">
          <li className="flex items-center justify-between py-1.5">
            <span>
              Modal (stok × {c?.valuation_mode === 'hpp' ? 'HPP (fallback)' : 'harga jual — proxy pasar, provisional'})
            </span>
            <span className="font-bold">{c ? rp(c.modal) : '—'}</span>
          </li>
          <li className="flex items-center justify-between py-1.5">
            <span>
              Laba kotor (penjualan − COGS)
              {c ? (
                <span className="ml-1 text-xs text-slate-500">
                  sejak {fmtDate(c.period_start)} ({HAUL_SOURCE_LABELS[c.haul_anchor.source] ?? ''})
                </span>
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
          {/* P3 Step 2 (PROVISIONAL — menunggu tashih): mode penilaian
              + standar emas terkini (log append-only) */}
          <li className="flex items-center justify-between py-1.5">
            <span>Penilaian modal (mode)</span>
            <span className="font-bold">{c ? (VALUATION_LABELS[c.valuation_mode] ?? c.valuation_mode) : '—'}</span>
          </li>
          <li className="flex items-center justify-between py-1.5">
            <span>Standar emas terkini (log)</span>
            <span className="font-bold">
              {c?.gold_standard
                ? `${rp(c.gold_standard.price_per_gram)}/g · ${fmtDate(c.gold_standard.price_date)} · ${c.gold_standard.karat} (oleh ${c.gold_standard.decided_by})`
                : c
                  ? `Pengaturan: ${rp(c.gold_price)}/g — belum ada log verifikasi`
                  : '—'}
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
              <label className="label">Standar emas (provisional 24K — menunggu tashih)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={String(s.gold_price)}
                onChange={(e) => setSettings({ ...s, gold_price: Number(e.target.value) })}
                placeholder="harga per gram (Rp), mis. 1100000"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                1 gram = {rp(s.gold_price)} — riset 24 Sep: standar 24 karat (murni), emas
                14/18K tak layak (Muktamar NU ke-35). Posisi 24K PROVISIONAL, menunggu
                tashih pengasuh. Bila log verifikasi ada, entri terbaru yang dipakai.
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
              <label className="label">Penilaian harta dagang (provisional)</label>
              <select
                className="input"
                value={s.valuation_mode}
                onChange={(e) => setSettings({ ...s, valuation_mode: e.target.value })}
              >
                <option value="market">Nilai pasar (provisional)</option>
                <option value="hpp">HPP (konservatif)</option>
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                V1: “nilai pasar” memakai harga jual produk (proxy); ledger harga pasar
                menyusul (P4).
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
                Anchor periode laba (provisional): haul tetap 1 tahun. Kosong = fallback
                sejak pembayaran terakhir / awal bulan. Pembayaran zakat = ta'jil
                (tidak me-reset).
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 sm:col-span-2 dark:border-navy-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Zakat terakhir dibayar (audit — tidak me-reset periode):{' '}
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

      {/* Verifikasi harga emas — log append-only (P3 Step 2, PROVISIONAL
          — menunggu tashih pengasuh). Form hanya admin (POST admin-only). */}
      <div className="card p-4 print:hidden">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Verifikasi Harga Emas (log append-only — provisional)
        </h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Standar 24K = posisi PROVISIONAL, menunggu tashih pengasuh. Setiap entri baru
          menjadi standar terkini (price_date terbaru); koreksi = entri baru, baris lama
          tak dihapus (jejak audit).
        </p>
        {c?.is_admin ? (
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Karat</label>
              <input
                className="input"
                value={goldForm.karat}
                maxLength={20}
                onChange={(e) => setGoldForm({ ...goldForm, karat: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Harga per gram (Rp)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={goldForm.price}
                onChange={(e) => setGoldForm({ ...goldForm, price: e.target.value })}
                placeholder="mis. 1100000"
              />
            </div>
            <div>
              <label className="label">Tanggal harga</label>
              <input
                className="input"
                type="date"
                value={goldForm.price_date}
                onChange={(e) => setGoldForm({ ...goldForm, price_date: e.target.value })}
              />
            </div>
            <div className="sm:col-span-3">
              <label className="label">Sumber (opsional)</label>
              <input
                className="input"
                value={goldForm.source}
                maxLength={200}
                onChange={(e) => setGoldForm({ ...goldForm, source: e.target.value })}
                placeholder="mis. Antam 24k, spot dunia, eMTQ"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={goldForm.apply}
                  onChange={(e) => setGoldForm({ ...goldForm, apply: e.target.checked })}
                />
                Juga simpan ke Pengaturan (nilai fallback)
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={logGold}
                disabled={busy}
              >
                Catat Verifikasi
              </button>
            </div>
          </div>
        ) : null}
        {goldLog && goldLog.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-navy-800">
                  <th className="py-2 pr-3">Tgl. Harga</th>
                  <th className="py-2 pr-3">Karat</th>
                  <th className="py-2 pr-3 text-right">Rp/gram</th>
                  <th className="py-2 pr-3">Sumber</th>
                  <th className="py-2">Oleh</th>
                </tr>
              </thead>
              <tbody>
                {goldLog.slice(0, 20).map((r, i) => (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 last:border-0 dark:border-navy-800 ${
                      i === 0 ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : ''
                    }`}
                  >
                    <td className="py-2 pr-3">
                      {fmtDate(r.price_date)}
                      {i === 0 ? (
                        <Badge tone="green"> terkini</Badge>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{r.karat}</td>
                    <td className="py-2 pr-3 text-right font-bold">{rp(r.price_per_gram)}</td>
                    <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                      {r.source || '—'}
                    </td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{r.decided_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : goldLog ? (
          <Empty text="Belum ada log verifikasi harga emas." />
        ) : null}
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

