'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageSkeleton, api, Badge, Modal, Toast, useToast } from '@/components/ui';
import { fmtDate } from '@/lib/format';

type User = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  active: number;
  pw_default: number;
  created_at: string;
};
type Resp = { users: User[]; self: User };

export function PenggunaClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [self, setSelf] = useState<User | null>(null);
  const [form, setForm] = useState({
    username: '',
    display_name: '',
    role: 'kasir',
    password: '',
  });
  const [pwModal, setPwModal] = useState<User | null>(null);
  const [pw, setPw] = useState('');
  const [ownPw, setOwnPw] = useState({ old: '', next: '' });
  const [pinModal, setPinModal] = useState<User | null>(null);
  const [pinNew, setPinNew] = useState({ new: '', confirm: '' });
  const [ownPin, setOwnPin] = useState({ old: '', next: '', confirm: '' });
  const [timeout, setTimeoutSec] = useState('');
  const [timeoutBusy, setTimeoutBusy] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<Resp>('/api/users');
    if (r.ok && r.data) {
      setUsers(r.data.users || []);
      setSelf(r.data.self || null);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
    api<{ session_timeout?: number }>('/api/settings')
      .then((r) => {
        if (r.ok && r.data && typeof r.data.session_timeout === 'number') {
          setTimeoutSec(String(r.data.session_timeout));
        }
      })
      .catch(() => undefined);
  }, [load]);

  async function createUser() {
    if (!form.username.trim() || form.password.length < 6) {
      showToast('Username wajib, password min 6 karakter');
      return;
    }
    const r = await api('/api/users', { method: 'POST', body: JSON.stringify(form) });
    if (r.ok) {
      showToast('Akun ' + form.username + ' dibuat');
      setForm({ username: '', display_name: '', role: 'kasir', password: '' });
      load();
    } else showToast(r.error || 'Gagal membuat akun');
  }

  async function resetPw() {
    if (!pwModal || pw.length < 6) {
      showToast('Password min 6 karakter');
      return;
    }
    const r = await api('/api/users', {
      method: 'PUT',
      body: JSON.stringify({ id: pwModal.id, password: pw }),
    });
    if (r.ok) {
      showToast('Password ' + pwModal.username + ' direset');
      setPwModal(null);
      setPw('');
      load();
    } else showToast(r.error || 'Gagal');
  }

  async function toggleActive(u: User) {
    await api('/api/users', {
      method: 'PUT',
      body: JSON.stringify({ id: u.id, active: u.active ? 0 : 1 }),
    });
    load();
  }

  async function changeOwnPw() {
    if (ownPw.next.length < 6) {
      showToast('Password baru min 6 karakter');
      return;
    }
    const r = await api('/api/users', {
      method: 'PUT',
      body: JSON.stringify({ id: self?.id, password: ownPw.next, old_password: ownPw.old }),
    });
    if (r.ok) {
      showToast('Password Anda diubah. Login berikutnya pakai yang baru.');
      setOwnPw({ old: '', next: '' });
      load();
    } else showToast(r.error || 'Password lama salah');
  }

  async function resetPin() {
    if (!pinModal || pinNew.new.length < 4 || pinNew.new.length > 6 || pinNew.new !== pinNew.confirm) {
      showToast('PIN baru 4-6 digit & konfirmasi harus sama');
      return;
    }
    const r = await api('/api/auth/pin/reset', {
      method: 'POST',
      body: JSON.stringify({ newPin: pinNew.new, confirm: pinNew.confirm, user_id: pinModal.id }),
    });
    if (r.ok) {
      showToast('PIN ' + pinModal.username + ' direset');
      setPinModal(null);
      setPinNew({ new: '', confirm: '' });
    } else showToast(r.error || 'Gagal reset PIN');
  }

  async function changeOwnPin() {
    if (ownPin.next.length < 4 || ownPin.next.length > 6 || ownPin.next !== ownPin.confirm) {
      showToast('PIN baru 4-6 digit & konfirmasi harus sama');
      return;
    }
    const r = await api('/api/auth/pin/change', {
      method: 'POST',
      body: JSON.stringify({ oldPin: ownPin.old, newPin: ownPin.next, confirm: ownPin.confirm }),
    });
    if (r.ok) {
      showToast('PIN Anda diubah');
      setOwnPin({ old: '', next: '', confirm: '' });
    } else showToast(r.error || 'PIN lama salah');
  }

  async function saveTimeout() {
    const n = Number(timeout);
    if (!Number.isFinite(n) || n < 60 || n > 604800) {
      showToast('Timeout harus 60–604800 detik');
      return;
    }
    setTimeoutBusy(true);
    const r = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ session_timeout: n }),
    });
    setTimeoutBusy(false);
    if (r.ok) showToast('Session timeout disimpan (berlaku utk sesi berikutnya).');
    else showToast(r.error || 'Gagal menyimpan');
  }

  if (loading && users.length === 0) return <PageSkeleton />;

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 font-bold">Akun kasir / pengurus</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="Username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <input
                className="input"
                placeholder="Nama tampil (opsional)"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="kasir">Kasir</option>
                <option value="pengurus">Pengurus</option>
                <option value="manajer">Manajer</option>
                <option value="gudang">Gudang</option>
                <option value="pembelian">Pembelian</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <input
                className="input"
                type="password"
                placeholder="Password awal"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <button className="btn-primary w-full" onClick={createUser}>
              + Buat Akun
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kasir: POS & rekap. Pengurus: operasional + pembukuan (tanpa Pengguna &amp; Data).
              Admin: akses penuh.
            </p>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-bold">
            Ganti password saya <Badge tone="blue">{self?.username}</Badge>
          </h2>
          <div className="space-y-2">
            <input
              className="input"
              type="password"
              placeholder="Password lama"
              value={ownPw.old}
              onChange={(e) => setOwnPw({ ...ownPw, old: e.target.value })}
            />
            <input
              className="input"
              type="password"
              placeholder="Password baru (min 6)"
              value={ownPw.next}
              onChange={(e) => setOwnPw({ ...ownPw, next: e.target.value })}
            />
            <button className="btn-ghost w-full" onClick={changeOwnPw}>
              Simpan Password Baru
            </button>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-1 font-bold">Ganti PIN Anda</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            PIN 4-6 digit, dipakai untuk masuk cepat setelah sesi entek (idle timeout).
          </p>
          <div className="space-y-2">
            <input
              className="input"
              type="password"
              inputMode="numeric"
              placeholder="PIN lama"
              value={ownPin.old}
              onChange={(e) => setOwnPin({ ...ownPin, old: e.target.value.replace(/\D/g, '') })}
            />
            <input
              className="input"
              type="password"
              inputMode="numeric"
              placeholder="PIN baru (4-6 digit)"
              value={ownPin.next}
              onChange={(e) => setOwnPin({ ...ownPin, next: e.target.value.replace(/\D/g, '') })}
            />
            <input
              className="input"
              type="password"
              inputMode="numeric"
              placeholder="Ulangi PIN baru"
              value={ownPin.confirm}
              onChange={(e) =>
                setOwnPin({ ...ownPin, confirm: e.target.value.replace(/\D/g, '') })
              }
            />
            <button className="btn-ghost w-full" onClick={changeOwnPin}>
              Ganti PIN
            </button>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-1 font-bold">Keamanan sesi</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Auto-logout bila tidak ada aktivitas selama N detik (default 3600 = 1 jam).
            Berlaku utk sesi berikutnya.
          </p>
          <div className="flex items-center gap-2">
            <input
              className="input"
              inputMode="numeric"
              placeholder="detik"
              value={timeout}
              onChange={(e) => setTimeoutSec(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn-primary" disabled={timeoutBusy || !timeout} onClick={saveTimeout}>
              {timeoutBusy ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <th className="th">User</th>
              <th className="th">Peran</th>
              <th className="th">Status</th>
              <th className="th">Dibuat</th>
              <th className="th text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="table-row">
                <td className="td">
                  <p className="font-bold">{u.username}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{u.display_name || '—'}</p>
                </td>
                <td className="td">
                  <Badge tone={u.role === 'kasir' ? 'gray' : 'blue'}>
                    {u.role.toUpperCase()}
                  </Badge>
                </td>
                <td className="td">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={u.active ? 'green' : 'red'}>
                      {u.active ? 'AKTIF' : 'NONAKTIF'}
                    </Badge>
                    {u.pw_default === 1 && <Badge tone="amber">PW DEFAULT</Badge>}
                  </div>
                </td>
                <td className="td text-xs text-slate-500 dark:text-slate-400">
                  {fmtDate(u.created_at)}
                </td>
                <td className="td text-right text-xs">
                  <button
                    onClick={() => {
                      setPwModal(u);
                      setPw('');
                    }}
                    className="font-bold text-accent-500 dark:text-accent-300"
                  >
                    Reset PW
                  </button>
                  <button
                    onClick={() => {
                      setPinModal(u);
                      setPinNew({ new: '', confirm: '' });
                    }}
                    className="ml-2 font-bold text-accent-500 dark:text-accent-300"
                  >
                    Reset PIN
                  </button>
                  {u.id !== self?.id && (
                    <button
                      onClick={() => toggleActive(u)}
                      className="ml-2 font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td className="td py-8 text-center text-sm text-slate-500 dark:text-slate-400" colSpan={5}>
                  Belum ada pengguna.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!pwModal}
        title={'Reset password: ' + (pwModal?.username || '')}
        onClose={() => setPwModal(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPwModal(null)}>
              Batal
            </button>
            <button className="btn-primary" onClick={resetPw}>
              Reset
            </button>
          </>
        }
      >
        <input
          className="input"
          type="password"
          placeholder="Password baru (min 6 karakter)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
      </Modal>
      <Modal
        open={!!pinModal}
        title={'Reset PIN: ' + (pinModal?.username || '')}
        onClose={() => setPinModal(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPinModal(null)}>
              Batal
            </button>
            <button className="btn-primary" onClick={resetPin}>
              Reset
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <input
            className="input"
            type="password"
            inputMode="numeric"
            placeholder="PIN baru (4-6 digit)"
            value={pinNew.new}
            onChange={(e) => setPinNew({ ...pinNew, new: e.target.value.replace(/\D/g, '') })}
            autoFocus
          />
          <input
            className="input"
            type="password"
            inputMode="numeric"
            placeholder="Ulangi PIN baru"
            value={pinNew.confirm}
            onChange={(e) =>
              setPinNew({ ...pinNew, confirm: e.target.value.replace(/\D/g, '') })
            }
          />
        </div>
      </Modal>
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
