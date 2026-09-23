'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageSkeleton, api, Badge, Modal, Toast, useConfirm, useToast } from '@/components/ui';
import { ProductBarcodeLabel } from '@/components/admin/product-label';
import { rp } from '@/lib/format';
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
};
type Resp = { products: Product[]; categories?: string[] };

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
  const [label, setLabel] = useState<Product | null>(null);

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
    if (p) setForm({ ...p, barcode: p.barcode ?? '' });
    else setForm({ ...emptyForm });
    setShow(true);
  }

  async function save() {
    if (!form.name.trim()) {
      showToast('Nama produk wajib diisi');
      return;
    }
    const r = form.id
      ? await api('/api/products/' + form.id, {
          method: 'PUT',
          body: JSON.stringify(form),
        })
      : await api('/api/products', { method: 'POST', body: JSON.stringify(form) });
    if (r.ok) {
      showToast(form.id ? 'Produk diperbarui' : 'Produk ditambahkan');
      setShow(false);
      load();
    } else {
      showToast(r.error || 'Gagal menyimpan');
    }
  }

  async function setStock(p: Product) {
    const v = Number(stockEdits[p.id]);
    if (Number.isNaN(v) || v < 0) return;
    await api('/api/products/' + p.id, {
      method: 'PUT',
      body: JSON.stringify({ id: p.id, stock: v }),
    });
    showToast('Stok ' + p.name + ' diubah ke ' + v);
    load();
  }

  async function toggleActive(p: Product) {
    await api('/api/products/' + p.id, {
      method: 'PUT',
      body: JSON.stringify({ active: p.active ? 0 : 1 }),
    });
    load();
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
          <button className="btn-ghost inline-flex items-center gap-1.5" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => openEdit()}>
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
          <button
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
          <button
            className="btn-ghost px-2.5 py-1 text-xs"
            disabled={bulkBusy || !bulkCat}
            onClick={() => void bulk('category', { value: bulkCat })}
          >
            Terapkan Kategori
          </button>
          <button
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
          <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setSelected(new Set())}>
            Batal
          </button>
        </div>
      )}

      {/* Category Pills */}
      {categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          <button
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
              <button
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

      {/* Product Table */}
      <div className="card overflow-x-auto">
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
                    <span className={'text-xs font-semibold ' + (margin > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
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
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setStock(p)}>
                        Simpan
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
                    <button
                      onClick={() => toggleActive(p)}
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
                      <button
                        className="text-xs font-bold text-accent-500 hover:underline dark:text-accent-300"
                        onClick={() => openLabel(p)}
                        title={p.barcode ? 'Cetak label barcode produk' : 'Isi dulu barcode produk'}
                      >
                        Label
                      </button>
                      <span className="text-slate-300 dark:text-navy-600">|</span>
                      <button
                        className="text-xs font-bold text-accent-500 hover:underline dark:text-accent-300"
                        onClick={() => openEdit(p)}
                      >
                        Ubah
                      </button>
                      <span className="text-slate-300 dark:text-navy-600">|</span>
                      <button
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

      <Modal
        open={show}
        title={form.id ? 'Ubah Produk' : 'Produk Baru'}
        onClose={() => setShow(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShow(false)}>
              Batal
            </button>
            <button className="btn-primary" onClick={save}>
              Simpan
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
        </div>
      </Modal>
      {label && <ProductBarcodeLabel product={label} onClose={() => setLabel(null)} />}
      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
