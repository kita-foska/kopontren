'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Badge, Modal, Toast, useConfirm, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';
import { isPointUnit, pointReasonLabel, type PointEntry } from '@/lib/points';
import { MemberQrBadge } from './member-qr-badge';

type Member = {
  id: number;
  name: string;
  phone: string;
  address: string;
  points: number;
  total_spent: number;
  created_at: string;
  cashback_balance?: number;
  tier?: string; // '' | 'silver' | 'gold' (dihitung server)
  qr_code?: string; // token QR membership (additive; auto-generate di kartu)
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

// Riwayat ledger poin & reward (GET /api/members/[id]/points) — tabel
// point_history yang ditulis POST /api/sales (earn/redeem/cashback/
// cashback_use) & DELETE /api/sales/[id] (void/refund/refund_cash).
type PointsResp = {
  entries: PointEntry[];
  total: number;
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
  const { ask, host: confirmHost } = useConfirm();
  const [loadingMore, setLoadingMore] = useState(false);
  // Guard busy: cegah double-submit saat request dalam perjalanan.
  const [busy, setBusy] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const hasMoreRef = useRef(false);
  const lastOffsetRef = useRef(0);
  const lastLimitRef = useRef(50);

  // ── Modal Riwayat Poin & Reward (ledger point_history, baca-saja) ──
  // Guard busy per aksi (pola Batch A): satu request terbuka; ref "aktif"
  // mencegah respons basi setelah modal pindah ke member lain.
  const POINTS_LIMIT = 20;
  const [pointsMember, setPointsMember] = useState<Member | null>(null);
  const pointsActiveRef = useRef(0);
  const [pointsRows, setPointsRows] = useState<PointEntry[]>([]);
  const [pointsTotal, setPointsTotal] = useState(0);
  const [pointsOffset, setPointsOffset] = useState(0);
  const [pointsBusy, setPointsBusy] = useState(false);
  const [pointsErr, setPointsErr] = useState('');

  // ── Modal Kartu Membership (identitas + tier + QR + cetak) ──
  const [cardMember, setCardMember] = useState<Member | null>(null);

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
    // Pencarian & daftar normal: 50 baris/halaman (cap server) + tombol
    // "Muat lebih banyak" untuk melanjutkan tanpa membebani Rows Read.
    await fetchPage(0, 50, s, false);
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

  // ── Riwayat poin & reward (ledger point_history) ──
  async function fetchPoints(mid: number, offset: number, append: boolean) {
    const r = await api<PointsResp>(
      `/api/members/${mid}/points?limit=${POINTS_LIMIT}&offset=${offset}`
    );
    // Modal bisa pindah ke member lain selama fetch — abaikan respons basi.
    if (pointsActiveRef.current !== mid) return;
    if (r.ok && r.data) {
      setPointsRows((prev) => (append ? [...prev, ...(r.data!.entries || [])] : r.data!.entries || []));
      setPointsTotal(r.data.total || 0);
      setPointsOffset(offset);
    } else {
      setPointsErr(r.error || 'Gagal memuat riwayat poin.');
    }
  }

  function openPoints(m: Member) {
    if (pointsBusy) return;
    pointsActiveRef.current = m.id;
    setPointsMember(m);
    setPointsRows([]);
    setPointsTotal(0);
    setPointsOffset(0);
    setPointsErr('');
    setPointsBusy(true);
    fetchPoints(m.id, 0, false).finally(() => setPointsBusy(false));
  }

  function loadMorePoints() {
    const m = pointsMember;
    if (!m || pointsBusy || pointsOffset + POINTS_LIMIT >= pointsTotal) return;
    setPointsBusy(true);
    fetchPoints(m.id, pointsOffset + POINTS_LIMIT, true).finally(() => setPointsBusy(false));
  }

  function closePoints() {
    if (pointsBusy) return;
    pointsActiveRef.current = 0;
    setPointsMember(null);
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
    if (busy) return;
    if (!form.name.trim()) {
      showToast('Nama santri / member wajib diisi');
      return;
    }
    setBusy(true);
    try {
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
    } finally {
      setBusy(false);
    }
  }

  function remove(m: Member) {
    ask({
      title: 'Hapus member',
      message: `Hapus member "${m.name}"? Poin dan riwayat belanja akan diarsipkan.`,
      confirmLabel: 'Hapus',
      proceed: async () => {
        const r = await api('/api/members?id=' + m.id, { method: 'DELETE' });
        if (r.ok) {
          showToast('Member dihapus');
          await load(qDeb);
        } else {
          showToast(r.error || 'Gagal menghapus');
        }
      },
    });
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
          <p className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
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
            <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setQ('')}>
              Reset
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {total} ditemukan
            {!qDeb.trim() && (
              <span className="ml-1 text-slate-600 dark:text-slate-400">
                ({members.length} dimuat)
              </span>
            )}
          </span>
          <button type="button" className="btn-primary" onClick={() => openEdit()}>
            + Tambah Member
          </button>
        </div>
      </div>

      {/* Member Table */}
      <div className="card overflow-hidden">
        <div ref={listRef} onScroll={onScroll} className="max-h-[640px] overflow-auto">
        <div className="hidden sm:block">
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
                    <button type="button"
                      className="text-xs font-bold text-accent-500 hover:underline dark:text-accent-300"
                      onClick={() => openEdit(m)}
                    >
                      Ubah
                    </button>
                    <span className="text-slate-300 dark:text-navy-600">|</span>
                    <button type="button"
                      className="text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                      onClick={() => openPoints(m)}
                    >
                      Riwayat
                    </button>
                    <span className="text-slate-300 dark:text-navy-600">|</span>
                    <button type="button"
                      className="text-xs font-bold text-slate-600 hover:underline dark:text-slate-300"
                      onClick={() => setCardMember(m)}
                    >
                      Kartu
                    </button>
                    <span className="text-slate-300 dark:text-navy-600">|</span>
                    <button type="button"
                      className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline"
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

        {/* Mobile: kartu member (<sm) — data sama (jendela virtual) dengan tabel.
            Spacer atas/bawah mengikuti padTop/padBottom agar scroll container tetap akurat. */}
        <div className="sm:hidden">
          {padTop > 0 && <div aria-hidden="true" style={{ height: padTop }} />}
          {shown.map((m) => (
            <div key={m.id} className="border-b border-slate-200 p-3 last:border-0 dark:border-navy-700">
              <div className="flex min-h-[44px] items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{m.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{m.phone || 'Tanpa no. HP'}</p>
                </div>
                <Badge tone={m.points > 50 ? 'green' : m.points > 0 ? 'blue' : 'gray'}>★ {m.points} poin</Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{m.address || '—'}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{rp(m.total_spent)}</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  Terdaftar {fmtDateTime(m.created_at)}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button"
                  className="h-11 flex-1 rounded-lg border border-accent-200 bg-accent-100/50 px-2 text-xs font-bold text-accent-600 transition hover:bg-accent-100 dark:border-navy-600 dark:bg-navy-900/40 dark:text-accent-300"
                  onClick={() => openEdit(m)}
                >
                  Ubah
                </button>
                <button type="button"
                  className="h-11 flex-1 rounded-lg border border-emerald-200 bg-emerald-50/50 px-2 text-xs font-bold text-emerald-600 transition hover:bg-emerald-100 dark:border-navy-600 dark:bg-navy-900/40 dark:text-emerald-400"
                  onClick={() => openPoints(m)}
                >
                  Riwayat
                </button>
                <button type="button"
                  className="h-11 flex-1 rounded-lg border border-slate-200 bg-slate-50/50 px-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-navy-600 dark:bg-navy-900/40 dark:text-slate-300"
                  onClick={() => setCardMember(m)}
                >
                  Kartu
                </button>
                <button type="button"
                  className="h-11 flex-1 rounded-lg border border-rose-200 bg-rose-50/50 px-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100 dark:border-navy-600 dark:bg-navy-900/40 dark:text-rose-400"
                  onClick={() => remove(m)}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
          {padBottom > 0 && <div aria-hidden="true" style={{ height: padBottom }} />}
          {members.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              {qDeb ? 'Tidak ada member yang cocok.' : 'Belum ada member terdaftar.'}
            </div>
          )}
        </div>
        </div>
        {!qDeb.trim() && hasMoreRef.current && (
          <div className="border-t border-slate-200 p-3 text-center dark:border-navy-700">
            <button type="button" className="btn-ghost text-xs" onClick={loadMore} disabled={loadingMore}>
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
            <button type="button" className="btn-ghost" onClick={() => setShow(false)}>
              Batal
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={save}>
              {busy ? 'Menyimpan…' : 'Simpan'}
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

      {/* Modal Riwayat Poin & Reward (ledger point_history) — baca-saja.
          Unit delta berjenis campur: poin (earn/redeem/void/refund) vs
          rupiah/reward (cashback/cashback_use/refund_cash) — lib/points. */}
      <Modal
        open={pointsMember !== null}
        title={pointsMember ? `Riwayat Poin & Reward — ${pointsMember.name}` : ''}
        onClose={closePoints}
        footer={
          <button type="button" className="btn-ghost" onClick={closePoints}>
            Tutup
          </button>
        }
      >
        {pointsMember && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-100 p-2.5 text-xs dark:bg-navy-900/50">
                <p className="font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Poin
                </p>
                <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                  ★ {pointsMember.points}
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2.5 text-xs dark:bg-navy-900/50">
                <p className="font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Saldo Reward
                </p>
                <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  {rp(pointsMember.cashback_balance ?? 0)}
                </p>
              </div>
            </div>
            {pointsErr && (
              <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-600 dark:bg-navy-900/40 dark:text-rose-300">
                {pointsErr}{' '}
                <button type="button" className="font-bold underline" onClick={() => openPoints(pointsMember)}>
                  Muat ulang
                </button>
              </div>
            )}
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {pointsRows.length === 0 && !pointsErr && (
                <p className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                  Belum ada aktivitas poin/reward untuk member ini.
                </p>
              )}
              {pointsRows.map((e) => {
                const up = e.delta > 0;
                const value = isPointUnit(e.reason)
                  ? (up ? '+' : '−') + Math.abs(e.delta).toLocaleString('id-ID') + ' poin'
                  : (up ? '+' : '−') + rp(Math.abs(e.delta));
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-navy-700"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {pointReasonLabel(e.reason)}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {fmtDateTime(e.created_at)}
                        {e.sale_id ? ` · Tx #${e.sale_id}` : ''}
                      </p>
                    </div>
                    <span
                      className={
                        'whitespace-nowrap text-sm font-extrabold ' +
                        (up
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : e.delta < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-500 dark:text-slate-400')
                      }
                    >
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
            {pointsOffset + POINTS_LIMIT < pointsTotal && !pointsErr && (
              <div className="text-center">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={pointsBusy}
                  onClick={loadMorePoints}
                >
                  {pointsBusy ? 'Memuat…' : 'Muat lebih banyak'}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Kartu Membership — identitas + tier + QR + cetak.
          Token kosong di-generate otomatis (peran admin; 403 → hint). */}
      {cardMember && (
        <MemberQrBadge
          member={cardMember}
          onClose={() => setCardMember(null)}
          onQrChanged={(token) =>
            setMembers((prev) =>
              prev.map((x) => (x.id === cardMember.id ? { ...x, qr_code: token } : x))
            )
          }
        />
      )}

      {confirmHost}
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
