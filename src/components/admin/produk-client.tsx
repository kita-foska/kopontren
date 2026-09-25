'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageSkeleton, api, Badge, Modal, Toast, useConfirm, useToast } from '@/components/ui';
import { ProductBarcodeLabel } from '@/components/admin/product-label';
import { rp } from '@/lib/format';
import { parseWholesaleJson } from '@/lib/wholesale';
import { Download } from 'lucide-react';

type Product = {
  id: number;
  name: string;
  category: string;
  unit: string;
  base_price: number;
  cost_price: number;
  stock: number;
  active: number;
  barcode?: string;
  /** Grosir v1: tier per produk, JSON string [{min_qty, discount_percent}]
   *  (subquery kolom `wholesale` di /api/products; '[]' bila tak ada). */
  wholesale?: string;
};
type Resp = { products: Product[]; categories?: string[] };
/** Baris tier grosir yang sedang disusun di form (belum disimpan). */
type TierDraft = { min_qty: number; discount_percent: number };

/** Parse kolom `wholesale` produk jadi daftar tier (modul bersama). */
function parseTiers(raw?: string | null): TierDraft[] {
  return parseWholesaleJson(raw) as TierDraft[];
}

const emptyForm = {
  id: 0,
  name: '',
  category: '',
  unit: 'pcs',
  base_price: 0,
  cost_price: 0,
  stock: 0,
  active: 1,
  barcode: '',
};

export function ProdukClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [show, setShow] = useState(false);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();
  const [stockEdits, setStockEdits] = useState<Record<number, string>>({});
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  // Kelola massal: pilih baris -> stok/kategori/hapus massal via /api/products/bulk
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStock, setBulkStock] = useState('');
  const [bulkCat, setBulkCat] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  // Busy guards (per-file useState): cegah double-submit per operasi.
  const [saveBusy, setSaveBusy] = useState(false);
  const [stockBusy, setStockBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [label, setLabel] = useState<Product | null>(null);
  // Grosir v1: daftar tier yang sedang disusun di form modal. Isinya draft
  // (bisa duplikat/invalid); sinkronisasi ke DB (replace-all) dilakukan di
  // save() HANYA setalah produk tersimpan (produk baru perlu id dulu).
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [tiersBusy, setTiersBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<Resp>('/api/products');
    if (r.ok && r.data) setProducts(r.data.products || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => {
      if (p.category) s.add(p.category);
    });
    return Array.from(s).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (statusFilter === 'active' && !p.active) return false;
      if (statusFilter === 'inactive' && p.active) return false;
      if (cat && p.category !== cat) return false;
      if (q.trim()) {
        const query = q.trim().toLowerCase();
        const matchName = p.name.toLowerCase().includes(query);
        const matchBarcode = (p.barcode || '').toLowerCase().includes(query);
        const matchCat = (p.category || '').toLowerCase().includes(query);
        return matchName || matchBarcode || matchCat;
      }
      return true;
    });
  }, [products, q, cat, statusFilter]);

  if (loading && products.length === 0) return <PageSkeleton />;

  function openEdit(p?: Product) {
    if (p) {
      setForm({ ...p, barcode: p.barcode ?? '' });
      // Muat tier grosir dari kolom `wholesale` produk (diisi subquery
      // /api/products) — bila field tidak ada (klien/cache lama), fetch
      // langsung dari endpoint prices supaya form tetap utuh.
      if (p.wholesale !== undefined) setTiers(parseTiers(p.wholesale));
      else if (p.id) {
        setTiers([]);
        void (async () => {
          const r = await api<{ tiers?: TierDraft[] }>('/api/products/' + p.id + '/prices');
          if (r.ok && r.data?.tiers) setTiers(r.data.tiers);
        })();
      } else setTiers([]);
    } else {
      setForm({ ...emptyForm });
      setTiers([]);
    }
    setShow(true);
  }

  async function save() {
    if (saveBusy) return;
    if (!form.name.trim()) {
      showToast('Nama produk wajib diisi');
      return;
    }
    setSaveBusy(true);
    try {
      const r = form.id
        ? await api<{ ok?: boolean; id?: number }>('/api/products/' + form.id, {
            method: 'PUT',
            body: JSON.stringify(form),
          })
        : await api<{ ok?: boolean; id?: number }>('/api/products', {
            method: 'POST',
            body: JSON.stringify(form),
          });
      if (r.ok) {
        const productId = form.id || Number(r.data?.id);
        // Simpan tier grosir HANYA bila form ini memang menampilkan seksi
        // grosir (tiersBusy true = modal pernah membuka form dgn konteks
        // tier: produk edit, atau user menambah baris tier). replace-all:
        // array kosong = hapus semua tier produk ini.
        if (tiersBusy && productId > 0) {
          const tr = await api<{ ok?: boolean }>('/api/products/' + productId + '/prices', {
            method: 'POST',
            body: JSON.stringify({ tiers }),
          });
          if (!tr.ok) showToast('Produk tersimpan, namun tier grosir gagal: ' + (tr.error || ''));
        }
        showToast(form.id ? 'Produk diperbarui' : 'Produk ditambahkan');
        setShow(false);
        load();
      } else {
        showToast(r.error || 'Gagal menyimpan');
      }
    } finally {
      setSaveBusy(false);
      setTiersBusy(false);
    }
  }

  // ── Grosir v1: kelola tier (min_qty → discount%) per form ─────────────
  function addTier() {
    setTiersBusy(true);
    setTiers((t) => [...t, { min_qty: 2, discount_percent: 0 }]);
  }
  function setTier(i: number, patch: Partial<TierDraft>) {
    setTiersBusy(true);
    setTiers((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function removeTier(i: number) {
    setTiersBusy(true);
    setTiers((t) => t.filter((_, j) => j !== i));
  }
  /** Harga efektif (Rp) bila diskon tier ini diterapkan ke base_price —
   *  rumus sama dgn modul murni lib/wholesale (dipakai POS + test). */
  function tierEffPrice(t: TierDraft): number {
    const base = Number(form.base_price) || 0;
    const pct = Math.max(0, Math.min(100, Number(t.discount_percent) || 0));
    return Math.round((base * (100 - pct)) / 100);
  }

  async function setStock(p: Product) {
    if (stockBusy) return;
    const v = Number(stockEdits[p.id]);
    if (Number.isNaN(v) || v < 0) return;
    setStockBusy(true);
    try {
      await api('/api/products/' + p.id, {
        method: 'PUT',
        body: JSON.stringify({ id: p.id, stock: v }),
      });
      showToast('Stok ' + p.name + ' diubah ke ' + v);
      load();
    } finally {
      setStockBusy(false);
    }
  }

  async function toggleActive(p: Product) {
    if (toggleBusy) return;
    setToggleBusy(true);
    try {
      await api('/api/products/' + p.id, {
        method: 'PUT',
        body: JSON.stringify({ active: p.active ? 0 : 1 }),
      });
      load();
    } finally {
      setToggleBusy(false);
    }
  }

  function deleteProduct(p: Product) {
    ask({
      title: 'Hapus produk',
      message: `Hapus produk "${p.name}"? Jika ada riwayat transaksi, produk akan dinonaktifkan secara aman.`,
      confirmLabel: 'Hapus',
      proceed: async () => {
        const r = await api<{ ok: boolean; message?: string; archived?: boolean }>('/api/products/' + p.id, {
          method: 'DELETE',
        });
        if (r.ok) {
          showToast(r.data?.message || 'Produk berhasil diproses');
          load();
        } else {
          showToast(r.error || 'Gagal menghapus produk');
        }
      },
    });
  }

  /** Buka overlay cetak label barcode produk (QR berisi nilai barcode). */
  function openLabel(p: Product) {
    if (!p.barcode) {
      showToast('Isi dulu field Barcode / Kode SKU produk ini (tombol Ubah), lalu cetak label.');
      return;
    }
    setLabel(p);
  }

  // ── Kelola massal ────────────────────────────────────────────────
  function toggleSel(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelected((s) => {
      const ids = filtered.map((p) => p.id);
      const all = ids.every((id) => s.has(id));
      return all ? new Set<number>() : new Set(ids);
    });
  }
  async function bulk(action: 'stock' | 'category' | 'delete', extra?: Record<string, unknown>) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const r = await api<{ ok: boolean; affected?: number }>('/api/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ action, ids: [...selected], ...extra }),
    });
    setBulkBusy(false);
    if (r.ok) {
      showToast(r.data?.affected + ' produk diproses');
      setSelected(new Set());
      setBulkStock('');
      setBulkCat('');
      load();
    } else {
      showToast(r.error || 'Gagal operasi massal');
    }
  }
  function exportCsv() {
    const head = ['id', 'name', 'category', 'unit', 'base_price', 'cost_price', 'stock', 'active', 'barcode'];
    const rows = products.map((p) => [
      p.id,
      p.name,
      p.category,
      p.unit,
      p.base_price,
      p.cost_price,
      p.stock,
      p.active,
      p.barcode ?? '',
    ]);
    const csv = [head, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? '');
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'produk-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast(products.length + ' produk diekspor ke CSV');
  }

  const F = (k: keyof typeof form, o?: { numeric?: boolean; label?: string; ph?: string }) => (
    <div>
      <label className="label">{o?.label || k}</label>
      <input
        className="input"
        type={o?.numeric ? 'number' : 'text'}
        value={form[k] as string | number}
        placeholder={o?.ph}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [k]: o?.numeric ? Number(e.target.value) || 0 : e.target.value,
          }))
        }
      />
    </div>
  );

  return (
    <div>
      {/* Header controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-64 max-w-full"
            placeholder="Cari nama, barcode, kategori…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input w-auto text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          >
            <option value="all">Semua status</option>
            <option value="active">Aktif saja</option>
            <option value="inactive">Nonaktif saja</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {filtered.length} dari {products.length} produk
          </span>
          <button type="button" className="btn-ghost inline-flex items-center gap-1.5" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button type="button" className="btn-primary" onClick={() => openEdit()}>
            + Tambah Produk
          </button>
        </div>
      </div>

      {/* Bar kelola massal (muncul saat ada baris terpilih) */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs font-semibold">
          <span className="text-accent-600 dark:text-accent-300">
            {selected.size} produk dipilih
          </span>
          <input
            className="input w-24 py-1"
            type="number"
            placeholder="Stok ±"
            value={bulkStock}
            onChange={(e) => setBulkStock(e.target.value)}
          />
          <button type="button"
            className="btn-ghost px-2.5 py-1 text-xs"
            disabled={bulkBusy || bulkStock === ''}
            onClick={() => void bulk('stock', { delta: Number(bulkStock) })}
          >
            Terapkan Stok
          </button>
          <select
            className="input w-auto py-1"
            value={bulkCat}
            onChange={(e) => setBulkCat(e.target.value)}
          >
            <option value="">Kategori…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="button"
            className="btn-ghost px-2.5 py-1 text-xs"
            disabled={bulkBusy || !bulkCat}
            onClick={() => void bulk('category', { value: bulkCat })}
          >
            Terapkan Kategori
          </button>
          <button type="button"
            className="btn-danger px-2.5 py-1 text-xs"
            disabled={bulkBusy}
            onClick={() =>
              ask({
                title: 'Hapus massal produk',
                message: 'Hapus massal: ' + selected.size + ' produk akan DINONAKTIFKAN (aman utk riwayat).',
                confirmLabel: 'Hapus Massal',
                proceed: () => bulk('delete'),
              })
            }
          >
            Hapus Massal
          </button>
          <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setSelected(new Set())}>
            Batal
          </button>
        </div>
      )}

      {/* Category Pills */}
      {categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          <button type="button"
            onClick={() => setCat('')}
            className={
              'rounded-full px-3 py-1 text-xs font-bold transition ' +
              (!cat
                ? 'bg-accent-500 text-white shadow-sm'
                : 'border border-slate-300 text-slate-600 hover:border-slate-400 dark:border-navy-600 dark:text-slate-300')
            }
          >
            Semua ({products.length})
          </button>
          {categories.map((c) => {
            const count = products.filter((p) => p.category === c).length;
            return (
              <button type="button"
                key={c}
                onClick={() => setCat(c)}
                className={
                  'rounded-full px-3 py-1 text-xs font-bold transition ' +
                  (cat === c
                    ? 'bg-accent-500 text-white shadow-sm'
                    : 'border border-slate-300 text-slate-600 hover:border-slate-400 dark:border-navy-600 dark:text-slate-300')
                }
              >
                {c} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Product Table (desktop ≥sm) */}
      <div className="card hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[44rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <th className="th w-8">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent-500"
                  title="Pilih semua yang terlihat"
                  checked={filtered.length > 0 && filtered.every((p) => selected.has(p.id))}
                  onChange={selectAllFiltered}
                />
              </th>
              <th className="th">Produk & Barcode</th>
              <th className="th">Harga Jual</th>
              <th className="th">HPP / Beli</th>
              <th className="th">Margin</th>
              <th className="th">Stok</th>
              <th className="th">Status</th>
              <th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const margin = p.base_price - p.cost_price;
              const marginPct = p.cost_price > 0 ? Math.round((margin / p.cost_price) * 100) : 0;
              return (
                <tr key={p.id} className="table-row hover:bg-slate-50/50 dark:hover:bg-navy-800/50">
                  <td className="td">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent-500"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSel(p.id)}
                    />
                  </td>
                  <td className="td">
                    <p className="font-bold text-slate-900 dark:text-slate-100">{p.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{p.category || 'Tanpa kategori'}</span>
                      <span>·</span>
                      <span>{p.unit}</span>
                      {p.barcode && (
                        <>
                          <span>·</span>
                          <span className="font-mono rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-navy-700 dark:text-slate-300">
                            {p.barcode}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="td font-bold text-slate-900 dark:text-slate-100">{rp(p.base_price)}</td>
                  <td className="td text-slate-500 dark:text-slate-400">{rp(p.cost_price)}</td>
                  <td className="td">
                    <span className={'text-xs font-semibold ' + (margin > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500')}>
                      +{rp(margin)} ({marginPct}%)
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-1.5">
                      <input
                        className="input w-20 px-2 py-1 text-center font-bold"
                        type="number"
                        min={0}
                        value={stockEdits[p.id] ?? p.stock}
                        onChange={(e) => setStockEdits((s) => ({ ...s, [p.id]: e.target.value }))}
                      />
                      <button type="button"
                        className="btn-ghost px-2 py-1 text-xs"
                        disabled={stockBusy}
                        onClick={() => setStock(p)}
                      >
                        {stockBusy ? '…' : 'Simpan'}
                      </button>
                      {p.stock <= 0 ? (
                        <Badge tone="red">Habis</Badge>
                      ) : p.stock < 5 ? (
                        <Badge tone="amber">Tipis</Badge>
                      ) : (
                        <Badge tone="green">Aman</Badge>
                      )}
                    </div>
                  </td>
                  <td className="td">
                    <button type="button"
                      onClick={() => toggleActive(p)}
                      disabled={toggleBusy}
                      className={
                        'rounded-full px-2.5 py-0.5 text-xs font-bold transition ' +
                        (p.active
                          ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400'
                          : 'bg-slate-500/15 text-slate-500 hover:bg-slate-500/25')
                      }
                    >
                      {p.active ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                  <td className="td text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button"
                        className="text-xs font-bold text-accent-500 hover:underline dark:text-accent-300"
                        onClick={() => openLabel(p)}
                        title={p.barcode ? 'Cetak label barcode produk' : 'Isi dulu barcode produk'}
                      >
                        Label
                      </button>
                      <span className="text-slate-300 dark:text-navy-600">|</span>
                      <button type="button"
                        className="text-xs font-bold text-accent-500 hover:underline dark:text-accent-300"
                        onClick={() => openEdit(p)}
                      >
                        Ubah
                      </button>
                      <span className="text-slate-300 dark:text-navy-600">|</span>
                      <button type="button"
                        className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline"
                        onClick={() => deleteProduct(p)}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td className="td py-8 text-center text-sm text-slate-500" colSpan={8}>
                  {q || cat ? 'Tidak ada produk yang cocok dengan pencarian.' : 'Belum ada produk.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: kartu produk (<sm) — data sama dengan tabel; toggle status,
          input stok & tombol aksi pakai hit-area 44px. */}
      <div className="card sm:hidden">
        {filtered.map((p) => {
          const margin = p.base_price - p.cost_price;
          const marginPct = p.cost_price > 0 ? Math.round((margin / p.cost_price) * 100) : 0;
          return (
            <div key={p.id} className="border-b border-slate-200 p-3 last:border-0 dark:border-navy-700">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{p.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.category || 'Tanpa kategori'} · {p.unit}
                    {p.barcode ? ' · ' + p.barcode : ''}
                  </p>
                </div>
                <button type="button"
                  onClick={() => toggleActive(p)}
                  disabled={toggleBusy}
                  className={
                    'min-h-[44px] shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ' +
                    (p.active
                      ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400'
                      : 'bg-slate-500/15 text-slate-500 hover:bg-slate-500/25')
                  }
                >
                  {p.active ? 'Aktif' : 'Nonaktif'}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{rp(p.base_price)}</p>
                  HPP {rp(p.cost_price)} · Margin +{rp(margin)} ({marginPct}%)
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    className="input w-16 px-2 py-1 text-center text-sm font-bold"
                    type="number"
                    min={0}
                    value={stockEdits[p.id] ?? p.stock}
                    onChange={(e) => setStockEdits((s) => ({ ...s, [p.id]: e.target.value }))}
                    aria-label={'Stok ' + p.name}
                  />
                  <button type="button"
                    className="btn-ghost h-11 px-2 text-xs sm:h-9"
                    disabled={stockBusy}
                    onClick={() => setStock(p)}
                  >
                    {stockBusy ? '…' : 'Simpan'}
                  </button>
                </div>
                {p.stock <= 0 ? (
                  <Badge tone="red">Habis</Badge>
                ) : p.stock < 5 ? (
                  <Badge tone="amber">Tipis</Badge>
                ) : (
                  <Badge tone="green">Aman</Badge>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button"
                  className="h-11 flex-1 rounded-lg border border-accent-200 bg-accent-100/50 px-2 text-xs font-bold text-accent-600 transition hover:bg-accent-100 dark:border-navy-600 dark:bg-navy-900/40 dark:text-accent-300"
                  onClick={() => openLabel(p)}
                >
                  Label
                </button>
                <button type="button"
                  className="h-11 flex-1 rounded-lg border border-accent-200 bg-accent-100/50 px-2 text-xs font-bold text-accent-600 transition hover:bg-accent-100 dark:border-navy-600 dark:bg-navy-900/40 dark:text-accent-300"
                  onClick={() => openEdit(p)}
                >
                  Ubah
                </button>
                <button type="button"
                  className="h-11 flex-1 rounded-lg border border-rose-200 bg-rose-50/50 px-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100 dark:border-navy-600 dark:bg-navy-900/40 dark:text-rose-400"
                  onClick={() => deleteProduct(p)}
                >
                  Hapus
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-slate-500">
            {q || cat ? 'Tidak ada produk yang cocok dengan pencarian.' : 'Belum ada produk.'}
          </div>
        )}
      </div>

      <Modal
        open={show}
        title={form.id ? 'Ubah Produk' : 'Produk Baru'}
        onClose={() => setShow(false)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setShow(false)}>
              Batal
            </button>
            <button type="button" className="btn-primary" disabled={saveBusy} onClick={save}>
              {saveBusy ? 'Menyimpan…' : 'Simpan'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">{F('name', { label: 'Nama produk *', ph: 'Contoh: Madu Murni Al Ittihad 500ml' })}</div>
          {F('category', { label: 'Kategori', ph: 'Madu / Minuman / Camilan / Sembako' })}
          {F('unit', { label: 'Satuan', ph: 'pcs / botol / box / kg' })}
          {F('base_price', { numeric: true, label: 'Harga jual (Rp) *' })}
          {F('cost_price', { numeric: true, label: 'HPP / harga beli modal (Rp)' })}
          <div className="col-span-2">
            {F('barcode', { label: 'Barcode / Kode SKU (opsional)', ph: 'Scan barcode atau ketik kode unik' })}
          </div>
          {form.id === 0 && (
            <div className="col-span-2">
              {F('stock', { numeric: true, label: 'Stok awal' })}
            </div>
          )}
          {/* ── Grosir v1: tier harga per produk (min_qty → discount%) ── */}
          <div className="col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Harga grosir (opsional)
              </span>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                onClick={addTier}
              >
                + Tambah tier
              </button>
            </div>
            <p className="mb-2 text-[11px] leading-snug text-slate-500 dark:text-slate-500">
              Beli ≥ jumlah minimum dapat diskon dari harga jual. Diskon dihitung dari harga
              satuan dasar; tier dengan jumlah minimum terkecil yang terpenuhi berlaku,
              dan bila ada pengaturan grosir global yang lebih besar, yang lebih besar dipakai.
            </p>
            {tiers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 py-2 text-center text-xs text-slate-500 dark:border-navy-600">
                Belum ada tier grosir.
              </p>
            ) : (
              <div className="space-y-2">
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="label">Jumlah min</label>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={t.min_qty}
                        onChange={(e) => setTier(i, { min_qty: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="label">Diskon (%)</label>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={100}
                        value={t.discount_percent}
                        onChange={(e) =>
                          setTier(i, { discount_percent: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="w-28 shrink-0 pb-1 text-right text-[11px] text-slate-500 dark:text-slate-500">
                      {t.discount_percent > 0 ? '≈ ' + rp(tierEffPrice(t)) : '—'}
                    </div>
                    <button
                      type="button"
                      className="btn-ghost px-2 py-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      onClick={() => removeTier(i)}
                      aria-label={`Hapus tier ${i + 1}`}
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
      {label && <ProductBarcodeLabel product={label} onClose={() => setLabel(null)} />}
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
