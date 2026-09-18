'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Badge, Modal, Toast, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';

type Member = {
  id: number;
  name: string;
  phone: string;
  address: string;
  points: number;
  total_spent: number;
  created_at: string;
};
// API sekarang paginasi (limit 50) + agregat global untuk kartu ringkasan.
type Resp = {
  members: Member[];
  total: number;
  total_points: number;
  total_spent: number;
  limit: number;
  offset: number;
};

// Virtual list: hanya baris terlihat (+overscan) yang dirender, supaya
// daftar panjang tidak membebani DOM.
const ROW_H = 64;
const OVERSCAN = 6;

const emptyForm = {
  id: 0,
  name: '',
  phone: '',
  address: '',
};

export function MemberClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [q, setQ] = useState('');
  // Search debounce 300ms (query dikirim ke server setelah 300ms).
  const [qDeb, setQDeb] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [show, setShow] = useState(false);
  const [toast, showToast] = useToast();
  const [loadingMore, setLoadingMore] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const hasMoreRef = useRef(false);
  const lastOffsetRef = useRef(0);
  const lastLimitRef = useRef(50);

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function fetchPage(offset: number, limit: number, search: string, append: boolean) {
    const url =
      '/api/members?' +
      (search ? 'q=' + encodeURIComponent(search) : 'offset=' + offset) +
      '&limit=' + limit;
    const r = await api<Resp>(url);
    if (r.ok && r.data) {
      setMembers((prev) => (append ? [...prev, ...(r.data!.members || [])] : r.data!.members || []));
      setTotal(r.data.total || 0);
      setTotalPoints(r.data.total_points || 0);
      setTotalSpent(r.data.total_spent || 0);
      lastOffsetRef.current = offset;
      lastLimitRef.current = limit;
      hasMoreRef.current =
        limit === 50 && (r.data.members?.length || 0) >= limit && (r.data.total || 0) > 0;
    }
  }

  const load = useCallback(async (search: string) => {
    const s = search.trim();
    // Pencarian: satu request dgn limit 500 (server-side q).
    // Normal: pagination 50 baris/halaman + tombol "Muat lebih banyak".
    await fetchPage(0, s ? 500 : 50, s, false);
  }, []);

  useEffect(() => {
    load(qDeb);
  }, [qDeb, load]);

  async function loadMore() {
    if (loadingMore || qDeb.trim() || !hasMoreRef.current) return;
    setLoadingMore(true);
    await fetchPage(lastOffsetRef.current + lastLimitRef.current, lastLimitRef.current, '', true);
    setLoadingMore(false);
  }

  function onScroll() {
    setScrollTop(listRef.current?.scrollTop || 0);
  }

  // Hitungan jendela virtual: indeks awal/akhir baris yang dirender.
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const sliceEnd = Math.min(members.length, first + Math.ceil(560 / ROW_H) + OVERSCAN * 2);
  const shown = members.slice(first, sliceEnd);
  const padTop = first * ROW_H;
  const padBottom = Math.max(0, (members.length - sliceEnd) * ROW_H);

  function openEdit(m?: Member) {
    if (m) setForm({ id: m.id, name: m.name, phone: m.phone, address: m.address });
    else setForm({ ...emptyForm });
    setShow(true);
  }

  async function save() {
    if (!form.name.trim()) {
      showToast('Nama santri / member wajib diisi');
      return;
    }
    const r = form.id
      ? await api('/api/members', {
          method: 'PUT',
          body: JSON.stringify(form),
        })
      : await api('/api/members', {
          method: 'POST',
          body: JSON.stringify(form),
        });
    if (r.ok) {
      showToast(form.id ? 'Data member diperbarui' : 'Member baru berhasil didaftarkan');
      setShow(false);
      await load(qDeb);
    } else {
      showToast(r.error || 'Gagal menyimpan');
    }
  }

  async function remove(m: Member) {
    if (!confirm(`Hapus member "${m.name}"? Poin dan riwayat belanja akan diarsipkan.`)) return;
    const r = await api('/api/members?id=' + m.id, { method: 'DELETE' });
    if (r.ok) {
      showToast('Member dihapus');
      await load(qDeb);
    } else {
      showToast(r.error || 'Gagal menghapus');
    }
  }


  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total Member
          </p>
          <p className="mt-1 text-2xl font-extrabold text-accent-500 dark:text-accent-300">
            {total.toLocaleString('id-ID')}
          </p>
          <p className="text-xs text-slate-500">Santri & Pelanggan Terdaftar</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total Poin Beredar
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-500">
            {totalPoints.toLocaleString('id-ID')}
          </p>
          <p className="text-xs text-slate-500">Loyalty Poin Belanja</p>
        </div>
        <div className="card col-span-2 p-4 sm:col-span-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Akumulasi Belanja
          </p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            {rp(totalSpent)}
          </p>
          <p className="text-xs text-slate-500">Omset Member</p>
        </div>
      </div>

      {/* Header filter & actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <input
            className="input w-64 max-w-full"
            placeholder="Cari nama, No. HP, alamat…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setQ('')}>
              Reset
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {total} ditemukan
            {!qDeb.trim() && (
              <span className="ml-1 text-slate-400 dark:text-slate-500">
                ({members.length} dimuat)
              </span>
            )}
          </span>
          <button className="btn-primary" onClick={() => openEdit()}>
            + Tambah Member
          </button>
        </div>
      </div>

      {/* Member Table */}
      <div className="card overflow-hidden">
        <div ref={listRef} onScroll={onScroll} className="max-h-[640px] overflow-auto">
        <table className="w-full min-w-[36rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <th className="th">Nama & Kontak</th>
              <th className="th">Alamat / Asrama</th>
              <th className="th">Poin Loyalitas</th>
              <th className="th">Total Belanja</th>
              <th className="th">Terdaftar Sejak</th>
              <th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden="true" style={{ height: padTop }}>
                <td colSpan={6} />
              </tr>
            )}
            {shown.map((m) => (
              <tr key={m.id} className="table-row hover:bg-slate-50/50 dark:hover:bg-navy-800/50">
                <td className="td">
                  <p className="font-bold text-slate-900 dark:text-slate-100">{m.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {m.phone || 'Tanpa no. HP'}
                  </p>
                </td>
                <td className="td text-slate-600 dark:text-slate-300">
                  {m.address || '—'}
                </td>
                <td className="td">
                  <Badge tone={m.points > 50 ? 'green' : m.points > 0 ? 'blue' : 'gray'}>
                    ★ {m.points} poin
                  </Badge>
                </td>
                <td className="td font-bold text-slate-800 dark:text-slate-200">
                  {rp(m.total_spent)}
                </td>
                <td className="td text-xs text-slate-500 dark:text-slate-400">
                  {fmtDateTime(m.created_at)}
                </td>
                <td className="td text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="text-xs font-bold text-accent-500 hover:underline dark:text-accent-300"
                      onClick={() => openEdit(m)}
                    >
                      Ubah
                    </button>
                    <span className="text-slate-300 dark:text-navy-600">|</span>
                    <button
                      className="text-xs font-bold text-rose-500 hover:underline"
                      onClick={() => remove(m)}
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {padBottom > 0 && (
              <tr aria-hidden="true" style={{ height: padBottom }}>
                <td colSpan={6} />
              </tr>
            )}
            {members.length === 0 && (
              <tr>
                <td className="td py-8 text-center text-sm text-slate-500" colSpan={6}>
                  {qDeb ? 'Tidak ada member yang cocok.' : 'Belum ada member terdaftar.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        {!qDeb.trim() && hasMoreRef.current && (
          <div className="border-t border-slate-200 p-3 text-center dark:border-navy-700">
            <button className="btn-ghost text-xs" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
            </button>
          </div>
        )}
      </div>

      {/* Modal Add/Edit Member */}
      <Modal
        open={show}
        title={form.id ? 'Ubah Data Member' : 'Daftar Member / Santri Baru'}
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
        <div className="space-y-3">
          <div>
            <label className="label">Nama Lengkap *</label>
            <input
              className="input"
              placeholder="Contoh: Muhammad Ilham / Santri Kamar 3"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Nomor WhatsApp / HP</label>
            <input
              className="input"
              placeholder="08123456789 (opsional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Alamat / Asrama / Komplek Santri</label>
            <input
              className="input"
              placeholder="Contoh: Asrama Putra Lt. 2 / Warga Sekitar"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <p className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500 dark:bg-navy-900/50 dark:text-slate-400">
            ℹ️ Setiap transaksi belanja Rp 10.000 di kasir akan otomatis menambahkan 1 poin loyalitas untuk member ini.
          </p>
        </div>
      </Modal>

      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
