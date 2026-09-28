'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageSkeleton, api, Badge, Button, Modal, ROLE_LABEL, Table, Td, Th, TEmpty, Trow, Toast, useToast } from '@/components/ui';
import { ROLES } from '@/lib/features';
import { fmtDate } from '@/lib/format';

type User = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  roles: string[];
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
  // Busy guards (per-file useState): cegah double-submit per operasi.
  const [createBusy, setCreateBusy] = useState(false);
  const [resetPwBusy, setResetPwBusy] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<number | null>(null);
  const [ownPwBusy, setOwnPwBusy] = useState(false);
  const [ownPinBusy, setOwnPinBusy] = useState(false);
  const [resetPinBusy, setResetPinBusy] = useState(false);
  // M1-4: modal edit peran (primary + role tambahan).
  const [roleModal, setRoleModal] = useState<User | null>(null);
  const [rolePrimary, setRolePrimary] = useState('kasir');
  const [roleExtra, setRoleExtra] = useState<string[]>([]);
  const [roleBusy, setRoleBusy] = useState(false);
  const [toast, showToast, , toastTone] = useToast();

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
    if (createBusy) return;
    if (!form.username.trim() || form.password.length < 6) {
      showToast('Username wajib, password min 6 karakter');
      return;
    }
    setCreateBusy(true);
    try {
      const r = await api('/api/users', { method: 'POST', body: JSON.stringify(form) });
      if (r.ok) {
        showToast('Akun ' + form.username + ' dibuat');
        setForm({ username: '', display_name: '', role: 'kasir', password: '' });
        load();
      } else showToast(r.error || 'Gagal membuat akun', 'error');
    } finally {
      setCreateBusy(false);
    }
  }

  async function resetPw() {
    if (resetPwBusy) return;
    if (!pwModal || pw.length < 6) {
      showToast('Password min 6 karakter');
      return;
    }
    setResetPwBusy(true);
    try {
      const r = await api('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ id: pwModal.id, password: pw }),
      });
      if (r.ok) {
        showToast('Password ' + pwModal.username + ' direset');
        setPwModal(null);
        setPw('');
        load();
      } else showToast(r.error || 'Gagal', 'error');
    } finally {
      setResetPwBusy(false);
    }
  }

  async function toggleActive(u: User) {
    if (toggleBusyId !== null) return;
    setToggleBusyId(u.id);
    try {
      const r = await api('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ id: u.id, active: u.active ? 0 : 1 }),
      });
      showToast(
        r.ok
          ? 'Akun ' + u.username + (u.active ? ' dinonaktifkan' : ' diaktifkan')
          : r.error || 'Gagal mengubah status'
      );
      load();
    } finally {
      setToggleBusyId(null);
    }
  }

  async function changeOwnPw() {
    if (ownPwBusy) return;
    if (ownPw.next.length < 6) {
      showToast('Password baru min 6 karakter');
      return;
    }
    setOwnPwBusy(true);
    try {
      const r = await api('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ id: self?.id, password: ownPw.next, old_password: ownPw.old }),
      });
      if (r.ok) {
        showToast('Password Anda diubah. Login berikutnya pakai yang baru.');
        setOwnPw({ old: '', next: '' });
        load();
      } else showToast(r.error || 'Password lama salah', 'error');
    } finally {
      setOwnPwBusy(false);
    }
  }

  async function resetPin() {
    if (resetPinBusy) return;
    if (!pinModal || pinNew.new.length < 4 || pinNew.new.length > 6 || pinNew.new !== pinNew.confirm) {
      showToast('PIN baru 4-6 digit & konfirmasi harus sama', 'error');
      return;
    }
    setResetPinBusy(true);
    try {
      const r = await api('/api/auth/pin/reset', {
        method: 'POST',
        body: JSON.stringify({ newPin: pinNew.new, confirm: pinNew.confirm, user_id: pinModal.id }),
      });
      if (r.ok) {
        showToast('PIN ' + pinModal.username + ' direset', 'error');
        setPinModal(null);
        setPinNew({ new: '', confirm: '' });
      } else showToast(r.error || 'Gagal reset PIN', 'error');
    } finally {
      setResetPinBusy(false);
    }
  }

  async function changeOwnPin() {
    if (ownPinBusy) return;
    if (ownPin.next.length < 4 || ownPin.next.length > 6 || ownPin.next !== ownPin.confirm) {
      showToast('PIN baru 4-6 digit & konfirmasi harus sama', 'error');
      return;
    }
    setOwnPinBusy(true);
    try {
      const r = await api('/api/auth/pin/change', {
        method: 'POST',
        body: JSON.stringify({ oldPin: ownPin.old, newPin: ownPin.next, confirm: ownPin.confirm }),
      });
      if (r.ok) {
        showToast('PIN Anda diubah', 'error');
        setOwnPin({ old: '', next: '', confirm: '' });
      } else showToast(r.error || 'PIN lama salah', 'error');
    } finally {
      setOwnPinBusy(false);
    }
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
    else showToast(r.error || 'Gagal menyimpan', 'error');
  }

  // M1-4: edit peran (primary + tambahan) via PUT /api/users.
  // Guard server: admin-only, primary sendiri tak bisa diubah, demote admin terakhir tak boleh.
  function openRoleModal(u: User) {
    setRoleModal(u);
    setRolePrimary(u.role);
    setRoleExtra((u.roles || []).filter((r) => r !== u.role));
  }
  async function saveRoles() {
    if (roleBusy || !roleModal) return;
    const isSelf = roleModal.id === self?.id;
    if (isSelf && rolePrimary !== roleModal.role) {
      showToast('Primary role sendiri tidak bisa diubah', 'error');
      return;
    }
    setRoleBusy(true);
    try {
      const r = await api<{ ok: boolean }>('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ id: roleModal.id, role: rolePrimary, roles: [rolePrimary, ...roleExtra] }),
      });
      if (r.ok) {
        showToast('Peran ' + roleModal.username + ' diperbarui');
        setRoleModal(null);
        load();
      } else showToast(r.error || 'Gagal memperbarui peran', 'error');
    } finally {
      setRoleBusy(false);
    }
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
            <Button variant="primary" full disabled={createBusy} onClick={createUser}>
              {createBusy ? 'Membuat…' : '+ Buat Akun'}
            </Button>
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
            <Button variant="ghost" full disabled={ownPwBusy} onClick={changeOwnPw}>
              {ownPwBusy ? 'Menyimpan…' : 'Simpan Password Baru'}
            </Button>
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
            <Button variant="ghost" full disabled={ownPinBusy} onClick={changeOwnPin}>
              {ownPinBusy ? 'Menyimpan…' : 'Ganti PIN'}
            </Button>
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
            <Button variant="primary" disabled={timeoutBusy || !timeout} onClick={saveTimeout}>
              {timeoutBusy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </div>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <Table minW="min-w-[36rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <Th>User</Th>
              <Th>Peran</Th>
              <Th>Status</Th>
              <Th>Dibuat</Th>
              <Th className="text-right">Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Trow key={u.id}>
                <Td>
                  <p className="font-bold">{u.username}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{u.display_name || '—'}</p>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={u.role === 'kasir' ? 'gray' : 'blue'}>
                      {u.role.toUpperCase()}
                    </Badge>
                    {(u.roles || []).filter((x) => x !== u.role).map((x) => (
                      <Badge key={x} tone="gray">
                        {ROLE_LABEL[x] ?? x.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={u.active ? 'green' : 'red'}>
                      {u.active ? 'AKTIF' : 'NONAKTIF'}
                    </Badge>
                    {u.pw_default === 1 && <Badge tone="amber">PW DEFAULT</Badge>}
                  </div>
                </Td>
                <Td className="text-xs text-slate-500 dark:text-slate-400">
                  {fmtDate(u.created_at)}
                </Td>
                <Td className="text-right text-xs">
                  <button type="button"
                    onClick={() => openRoleModal(u)}
                    className="font-bold text-accent-500 dark:text-accent-300"
                  >
                    Peran
                  </button>
                  <button type="button"
                    onClick={() => {
                      setPwModal(u);
                      setPw('');
                    }}
                    className="ml-2 font-bold text-accent-500 dark:text-accent-300"
                  >
                    Reset PW
                  </button>
                  <button type="button"
                    onClick={() => {
                      setPinModal(u);
                      setPinNew({ new: '', confirm: '' });
                    }}
                    className="ml-2 font-bold text-accent-500 dark:text-accent-300"
                  >
                    Reset PIN
                  </button>
                  {u.id !== self?.id && (
                    <button type="button"
                      onClick={() => toggleActive(u)}
                      disabled={toggleBusyId === u.id}
                      className="ml-2 font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  )}
                </Td>
              </Trow>
            ))}
            {users.length === 0 && (
              <TEmpty colSpan={5} className="py-8">
                Belum ada pengguna.
              </TEmpty>
            )}
          </tbody>
        </Table>
      </div>

      <Modal
        open={!!pwModal}
        title={'Reset password: ' + (pwModal?.username || '')}
        onClose={() => setPwModal(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwModal(null)}>
              Batal
            </Button>
            <Button variant="primary" disabled={resetPwBusy} onClick={resetPw}>
              {resetPwBusy ? 'Menyimpan…' : 'Reset'}
            </Button>
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
            <Button variant="ghost" onClick={() => setPinModal(null)}>
              Batal
            </Button>
            <Button variant="primary" disabled={resetPinBusy} onClick={resetPin}>
              {resetPinBusy ? 'Menyimpan…' : 'Reset'}
            </Button>
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
      <Modal
        open={!!roleModal}
        title={'Peran: ' + (roleModal?.username || '')}
        onClose={() => setRoleModal(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleModal(null)}>
              Batal
            </Button>
            <Button variant="primary" disabled={roleBusy} onClick={saveRoles}>
              {roleBusy ? 'Menyimpan…' : 'Simpan Peran'}
            </Button>
          </>
        }
      >
        {roleModal && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">
                Peran utama
              </label>
              <select
                className="input"
                value={rolePrimary}
                disabled={roleModal.id === self?.id}
                onChange={(e) => {
                  const next = e.target.value;
                  setRolePrimary(next);
                  setRoleExtra((prev) => prev.filter((x) => x !== next));
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r] ?? r.toUpperCase()}
                  </option>
                ))}
              </select>
              {roleModal.id === self?.id && (
                <p className="mt-1 text-xs text-slate-400">
                  Peran utama sendiri tidak bisa diubah.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">
                Peran tambahan
              </label>
              <div className="grid grid-cols-2 gap-1">
                {ROLES.filter((r) => r !== rolePrimary).map((r) => (
                  <label
                    key={r}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-[#7A1835]"
                      checked={roleExtra.includes(r)}
                      onChange={(e) =>
                        setRoleExtra((prev) =>
                          e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)
                        )
                      }
                    />
                    <span>{ROLE_LABEL[r] ?? r.toUpperCase()}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Peran utama otomatis termasuk di dalam set peran.
              </p>
            </div>
          </div>
        )}
      </Modal>
      <Toast msg={toast} tone={toastTone} onClose={() => showToast('')} />
    </div>
  );
}
