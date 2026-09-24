'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  Badge,
  Toast,
  useConfirm,
  useToast,
  useTablistNav,
} from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';

type Kons = {
  id: number;
  owner: string;
  owner_phone: string;
  item_name: string;
  unit: string;
  qty_received: number;
  agree_price: number;
  commission_rate: number;
  qty_sold: number;
  qty_returned: number;
  amount_paid: number;
  status: string;
  note: string;
  created_at: string;
  settled_at: string | null;
  remaining: number;
  payable: number;
  commission: number;
  unpaid: number;
};
type Resp = {
  consignments: Kons[];
  totals: { active: number; unpaid: number; remaining: number };
  commission_rate_default?: number;
  owner_rates?: Record<string, number>;
  limit?: number;
  offset?: number;
};

const EMPTY_FORM = {
  owner: '',
  owner_phone: '',
  item_name: '',
  unit: 'pcs',
  qty: 1,
  agree_price: 0,
  commission_rate: '' as string | number,
  note: '',
};

export function KonsinyasiClient() {
  const [tab, setTab] = useState<'active' | 'done'>('active');
  // Keyboard nav tablist: ArrowRight/Left (wrap) + Home/End, aktivasi
  // otomatis (WCAG 16.20 / APG tabs).
  const { onTabKeyDown } = useTablistNav<'active' | 'done'>(
    (i) => (i === 0 ? 'active' : 'done'),
    setTab
  );
  const [data, setData] = useState<Resp | null>(null);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();
  const [f, setF] = useState(EMPTY_FORM);
  const [acts, setActs] = useState<Record<number, { qty: number; pay: number }>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [canMore, setCanMore] = useState(false);
  // Kegagalan muat awal (401/403/500): simpan pesan error + tombol retry,
  // supaya PWA tidak stuck "Memuat…" selamanya (mis. DB produksi belum
  // migrasi v16 saat pertama deploy).
  const [loadErr, setLoadErr] = useState('');
  // Guard busy: cegah double-tap pada aksi jual/kembalikan/bayar/tutup.
  const [busy, setBusy] = useState(false);
  // P4-B: flag field komisi sudah disentuh user (pre-fill per-pemilik
  // tidak boleh menimpa nilai yang sedang dipilih).
  const [rateTouched, setRateTouched] = useState(false);
  const [orOwner, setOrOwner] = useState('');
  const [orRate, setOrRate] = useState('');

  const load = useCallback(async (offset = 0, append = false) => {
    // Server cap 50 baris/halaman; offset melanjutkan riwayat konsinyasi.
    const r = await api<Resp>('/api/konsinyasi?limit=50&offset=' + offset);
    if (r.ok && r.data) {
      setData((prev) => {
        const d = r.data!;
        if (!prev || !append) return d;
        const seen = new Set(prev.consignments.map((k) => k.id));
        return {
          ...d,
          consignments: [
            ...prev.consignments,
            ...d.consignments.filter((k) => !seen.has(k.id)),
          ],
        };
      });
      setCanMore((r.data!.consignments?.length || 0) >= 50);
      setLoadErr('');
    } else if (!append) {
      setLoadErr(r.error || 'Gagal memuat data konsinyasi');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (loadingMore || !canMore || !data) return;
    setLoadingMore(true);
    await load(data.consignments.length, true);
    setLoadingMore(false);
  }

  async function post(body: object, okMsg: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ ok?: boolean }>('/api/konsinyasi', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (r.ok) {
        showToast(okMsg);
        load();
      } else showToast(r.error || 'Gagal memproses');
    } finally {
      setBusy(false);
    }
  }

  function act(id: number, patch: Partial<{ qty: number; pay: number }>) {
    setActs((a) => {
      const cur = a[id] ?? { qty: 1, pay: 0 };
      return { ...a, [id]: { ...cur, ...patch } };
    });
  }

  async function create() {
    if (!f.owner.trim() || !f.item_name.trim() || f.qty <= 0) {
      showToast('Pemilik, barang & jumlah wajib diisi');
      return;
    }
    // P4-B: rate disepakati (antardhin) — null = server resolve
    // (default per-pemilik → global). 0 = tanpa komisi, valid.
    const rateVal =
      f.commission_rate === '' || f.commission_rate === null
        ? null
        : Number(f.commission_rate);
    await post(
      {
        ...f,
        commission_rate:
          rateVal !== null && Number.isFinite(rateVal) ? rateVal : undefined,
      },
      'Konsinyasi diterima & tercatat'
    );
    setF(EMPTY_FORM);
    setRateTouched(false);
  }

  // P4-B: kelola default komisi per-pemilik (setting
  // konsinyasi_owner_rates). Hanya utk pre-fill titipan BARU.
  function saveOwnerRate() {
    if (!orOwner.trim()) {
      showToast('Nama pemilik wajib diisi');
      return;
    }
    const r = Math.floor(Number(orRate));
    if (!Number.isFinite(r) || r < 0 || r > 100) {
      showToast('Komisi per-pemilik harus 0-100');
      return;
    }
    post({ action: 'save_owner_rate', owner: orOwner.trim(), commission_rate: r }, 'Rate per-pemilik tersimpan');
    setOrOwner('');
    setOrRate('');
  }
  function delOwnerRate(o: string) {
    post({ action: 'delete_owner_rate', owner: o }, 'Rate per-pemilik dihapus');
  }

  function jual(k: Kons) {
    post({ action: 'sell', id: k.id, qty: acts[k.id]?.qty || 1 }, 'Penjualan tercatat');
  }
  function kembalikan(k: Kons) {
    post({ action: 'return', id: k.id, qty: acts[k.id]?.qty || 1 }, 'Pengembalian tercatat');
  }
  function bayar(k: Kons) {
    post(
      { action: 'pay', id: k.id, amount: acts[k.id]?.pay || 0 },
      'Pembayaran tercatat & masuk pembukuan kas'
    );
  }
  function tutup(k: Kons) {
    ask({
      title: 'Tutup konsinyasi',
      message: 'Tutup konsinyasi ' + k.item_name + ' milik ' + k.owner + '?',
      confirmLabel: 'Tutup',
      proceed: () => post({ action: 'close', id: k.id }, 'Konsinyasi ditutup'),
    });
  }
  function bukaLagi(k: Kons) {
    post({ action: 'reopen', id: k.id }, 'Dibuka kembali');
  }

  const active = data?.consignments.filter((k) => k.status === 'active') || [];
  const done = data?.consignments.filter((k) => k.status === 'settled') || [];
  if (!data) {
    if (loadErr)
      return (
        <div className="text-sm text-slate-500">
          <p>{loadErr}</p>
          <button
            type="button"
            className="btn-ghost mt-2"
            onClick={() => {
              setLoadErr('');
              load();
            }}
          >
            Coba lagi
          </button>
        </div>
      );
    return <p className="text-sm text-slate-500">Memuat…</p>;
  }

  function KonsCard({ k, doneMode, busy }: { k: Kons; doneMode: boolean; busy?: boolean }) {
    return (
      <div className="card mb-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold">
              {k.item_name} <Badge tone="gray">{k.unit}</Badge>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pemilik: {k.owner}
              {k.owner_phone ? ' · ' + k.owner_phone : ''}
            </p>
          </div>
          <Badge tone={doneMode ? 'gray' : 'green'}>{doneMode ? 'Selesai' : 'Aktif'}</Badge>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Diterima {k.qty_received} {k.unit} @ {rp(k.agree_price)}
          {k.note ? ' · ' + k.note : ''}
          {!doneMode ? ' · dicatat ' + fmtDateTime(k.created_at) : ''}
          {doneMode && k.settled_at ? ' · ditutup ' + fmtDateTime(k.settled_at) : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="blue">Terjual {k.qty_sold}</Badge>
          <Badge tone="gray">Dikembalikan {k.qty_returned}</Badge>
          <Badge tone="amber">Sisa {k.remaining}</Badge>
          <Badge tone="blue">Komisi toko {k.commission_rate}% · Ujrah {rp(k.commission)}</Badge>
          <Badge tone="red">Tagihan pemilik {rp(k.payable)}</Badge>
          <Badge tone="green">Terbayar {rp(k.amount_paid)}</Badge>
          {k.unpaid > 0 && <Badge tone="red">Kurang {rp(k.unpaid)}</Badge>}
        </div>
        {doneMode ? (
          <div className="mt-3 flex justify-end">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => bukaLagi(k)}>
              Buka lagi
            </button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
            <div>
              <label className="label">Jumlah (jual / kembalikan)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={acts[k.id]?.qty ?? 1}
                onChange={(e) => act(k.id, { qty: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Nominal bayar (Rp)</label>
              <input
                type="number"
                min={0}
                className="input"
                value={acts[k.id]?.pay ?? 0}
                onChange={(e) => act(k.id, { pay: Number(e.target.value) })}
              />
            </div>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => jual(k)}>
              Jual
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => kembalikan(k)}>
              Kembalikan
            </button>
            <button type="button" className="btn-amber" disabled={busy} onClick={() => bayar(k)}>
              Bayar
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={() => tutup(k)}>
              Tutup
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Konsinyasi aktif
          </p>
          <p className="mt-1 text-2xl font-extrabold text-accent-500 dark:text-accent-300">
            {data.totals.active}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">barang titipan berjalan</p>
        </div>
        <div className="card p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Tagihan belum dibayar
          </p>
          <p className="mt-1 text-2xl font-extrabold text-rose-600 dark:text-rose-400">{rp(data.totals.unpaid)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">kepada pemilik</p>
        </div>
        <div className="card p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Sisa barang
          </p>
          <p className="mt-1 text-2xl font-extrabold">{data.totals.remaining}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            belum terjual / dikembalikan
          </p>
        </div>
      </div>

      <div className="card mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <div>
          <label className="label">Pemilik *</label>
          <input
            className="input"
            value={f.owner}
            placeholder="Nama pemilik / pemilik kebun…"
            onChange={(e) => {
              const v = e.target.value;
              setF((prev) => ({
                ...prev,
                owner: v,
                // P4-B: pre-fill rate dari default pemilik (bila ada);
                // nilai yang sudah user pilih tidak di-overwrite.
                commission_rate: rateTouched
                  ? prev.commission_rate
                  : (data?.owner_rates?.[v.trim()] ??
                    data?.commission_rate_default ??
                    20),
              }));
            }}
          />
        </div>
        <div>
          <label className="label">HP pemilik</label>
          <input
            className="input"
            value={f.owner_phone}
            placeholder="Opsional"
            onChange={(e) => setF({ ...f, owner_phone: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Barang titipan *</label>
          <input
            className="input"
            value={f.item_name}
            placeholder="Madu, walet, dll."
            onChange={(e) => setF({ ...f, item_name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Satuan</label>
          <input
            className="input"
            value={f.unit}
            placeholder="pcs, liter, gr…"
            onChange={(e) => setF({ ...f, unit: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Jumlah diterima *</label>
          <input
            type="number"
            min={1}
            className="input"
            value={f.qty}
            onChange={(e) => setF({ ...f, qty: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Rp / unit (harga perjanjian)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={f.agree_price}
            onChange={(e) => setF({ ...f, agree_price: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Komisi toko (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            className="input"
            value={f.commission_rate}
            placeholder={String(data?.commission_rate_default ?? 20)}
            onChange={(e) => {
              setRateTouched(true);
              setF({ ...f, commission_rate: e.target.value });
            }}
          />
        </div>
        <div>
          <label className="label">Catatan</label>
          <input
            className="input"
            value={f.note}
            placeholder="Opsional"
            onChange={(e) => setF({ ...f, note: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={create}>
            {busy ? 'Menyimpan…' : 'Terima Konsinyasi'}
          </button>
        </div>
      </div>
      <div className="card mb-3 p-3">
        <p className="text-sm font-bold">Rate per-pemilik (default komisi)</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pre-fill form titipan baru per nama pemilik (antardhin — hasil
          musyawarah). Pemilik tanpa rate → default global{' '}
          {data.commission_rate_default ?? 20}%. Titipan aktif tidak pernah
          terpengaruh.
        </p>
        {(data.owner_rates ? Object.keys(data.owner_rates).length : 0) > 0 ? (
          <div className="mt-2 flex flex-col gap-1">
            {Object.entries(data.owner_rates || {}).map(([o, r]) => (
              <div key={o} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold">{o} — {r}%</span>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => delOwnerRate(o)}
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Belum ada rate per-pemilik.</p>
        )}
        <div className="mt-2 grid grid-cols-[1fr_88px_auto] items-end gap-2">
          <div>
            <label className="label">Nama pemilik</label>
            <input
              className="input"
              value={orOwner}
              placeholder="cth. Muhamad"
              onChange={(e) => setOrOwner(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Komisi %</label>
            <input
              type="number"
              min={0}
              max={100}
              className="input"
              value={orRate}
              placeholder="cth. 15"
              onChange={(e) => setOrRate(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary" disabled={busy} onClick={saveOwnerRate}>
            Simpan
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Komisi FLEKSIBEL (antardhin, akad wakalah bil ujrah): field "Komisi toko (%)" di atas =
        kesepakatan utk titipan ini (pre-fill dari rate per-pemilik bila ada,
        selain itu global {data.commission_rate_default ?? 20}%), bisa diubah
        per barang; 0 = tanpa komisi. Komisi terhitung OTOMATIS saat barang
        terjual (bukan di muka) & tercatat sebagai pendapatan jasa (ujrah);
        bagian pemilik = harga − komisi. Barang yang dikembalikan karena tidak
        terjual tidak menghasilkan komisi. Titipan berjalan TIDAK BISA
        diubah rate-nya (tanpa perubahan sepihak).
      </p>

      <div className="mb-3 flex gap-2" role="tablist" onKeyDown={onTabKeyDown}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          onClick={() => setTab('active')}
          className={tab === 'active' ? 'btn-primary' : 'btn-ghost'}
        >
          Aktif ({active.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'done'}
          onClick={() => setTab('done')}
          className={tab === 'done' ? 'btn-primary' : 'btn-ghost'}
        >
          Selesai ({done.length})
        </button>
      </div>

      {tab === 'active' ? (
        active.length === 0 ? (
          <p className="text-sm text-slate-500">
            Belum ada konsinyasi aktif. Terima barang titipan melalui form di atas.
          </p>
        ) : (
          <div>
            {active.map((k) => (
              <KonsCard key={k.id} k={k} doneMode={false} busy={busy} />
            ))}
          </div>
        )
      ) : done.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada konsinyasi yang ditutup.</p>
      ) : (
        <div>
          {done.map((k) => (
            <KonsCard key={k.id} k={k} doneMode={true} busy={busy} />
          ))}
        </div>
      )}
      {canMore && (
        <div className="p-1 text-center">
          <button type="button" className="btn-ghost text-xs" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Memuat…' : 'Muat riwayat lebih lama'}
          </button>
        </div>
      )}
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}