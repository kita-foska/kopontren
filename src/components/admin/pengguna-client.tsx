'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Modal, Toast, useToast } from '@/components/ui';
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
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const r = await api<Resp>('/api/users');
    if (r.ok && r.data) {
      setUsers(r.data.users || []);
      setSelf(r.data.self || null);
    }
  }, []);
  useEffect(() => {
    load();
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
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
