'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Save, Loader2 } from 'lucide-react';
import { api, Badge, Toast, useToast } from '@/components/ui';

type Setting = { key: string; label: string; priority: number; in_app: boolean; push: boolean };

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const isSecure =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'https:' ||
    ['localhost', '127.0.0.1'].includes(window.location.hostname));

function bufferToB64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function NotificationSettingsClient() {
  const [toast, setToast, clearToast] = useToast();
  const [items, setItems] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<'unknown' | 'granted' | 'denied' | 'unavailable'>('unknown');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ settings: Setting[] }>('/api/notification-settings');
    if (res.ok) setItems(res.data.settings || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(clearToast, 2500);
  };

  const update = async (key: string, patch: { in_app?: boolean; push?: boolean }) => {
    const cur = items.find((i) => i.key === key);
    if (!cur) return;
    const next: Setting = { ...cur, ...patch };
    setItems((prev) => prev.map((i) => (i.key === key ? next : i)));
    const res = await api('/api/notification-settings', {
      method: 'POST',
      body: JSON.stringify({
        settings: [{ type: key, in_app: next.in_app, push: next.push }],
      }),
    });
    if (res.ok) flash('Pengaturan disimpan');
    else setItems((prev) => prev.map((i) => (i.key === key ? cur : i)));
  };

  const refreshPushState = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unavailable');
      return;
    }
    let perm: NotificationPermission = 'denied';
    if (typeof Notification !== 'undefined') {
      perm = await Notification.requestPermission().catch(() => 'denied');
    }
    try {
      const reg = await (navigator.serviceWorker.ready.catch(() =>
        navigator.serviceWorker.getRegistration('/')
      )) as ServiceWorkerRegistration | undefined;
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setPushState('granted');
          return;
        }
      }
    } catch {
      /* abaikan */
    }
    setPushState(perm === 'granted' ? 'granted' : 'denied');
  }, []);

  useEffect(() => {
    refreshPushState();
  }, [refreshPushState]);

  const enablePush = async () => {
    if (!isSecure || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      flash('Push butuh HTTPS + browser yang mendukung');
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        flash('Izin notifikasi ditolak browser');
        setPushState('denied');
        setBusy(false);
        return;
      }
      const keyRes = await api<{ publicKey: string }>('/api/push/vapid-key');
      if (!keyRes.ok || !keyRes.data.publicKey) throw new Error('Gagal mengambil kunci VAPID');
      const reg = await (navigator.serviceWorker.ready.catch(() =>
        navigator.serviceWorker.getRegistration('/')
      )) as ServiceWorkerRegistration;
      // applicationServerKey menerima string base64url (format kunci VAPID publik).
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyRes.data.publicKey,
      });
      const p256dhBuf = sub.getKey('p256dh');
      const authBuf = sub.getKey('auth');
      if (!p256dhBuf || !authBuf) throw new Error('Gagal membaca kunci subscription');
      const p256dh = bufferToB64Url(p256dhBuf);
      const auth = bufferToB64Url(authBuf);
      const post = await api('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh, auth } }),
      });
      if (post.ok) flash('Push notification aktif');
      else flash('Gagal mendaftarkan push');
      setPushState('granted');
    } catch (e) {
      console.warn('[push] subscribe gagal:', e);
      flash('Gagal mengaktifkan push');
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const reg = await (navigator.serviceWorker.ready.catch(() =>
        navigator.serviceWorker.getRegistration('/')
      )) as ServiceWorkerRegistration | undefined;
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api('/api/push/unsubscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }
      flash('Push notification dinonaktifkan');
    } catch (e) {
      console.warn('[push] unsubscribe gagal:', e);
      flash('Gagal menonaktifkan push');
    } finally {
      setBusy(false);
      refreshPushState();
    }
  };

  const groups: { priority: number; title: string; list: Setting[] }[] = [
    { priority: 1, title: 'Prioritas 1 · Real-time', list: items.filter((i) => i.priority === 1) },
    { priority: 2, title: 'Prioritas 2 · Harian', list: items.filter((i) => i.priority === 2) },
    { priority: 3, title: 'Prioritas 3 · Mingguan/Bulanan', list: items.filter((i) => i.priority === 3) },
  ];
  return (
    <div className="space-y-4">
      {/* Push PWA */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent-500" />
            <div>
              <p className="text-sm font-bold">Push Notification (PWA)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pushState === 'granted'
                  ? 'Aktif — notifikasi muncul di perangkat (bahkan app tertutup).'
                  : pushState === 'denied'
                  ? 'Izin ditolak browser — izinkan notifikasi di pengaturan browser.'
                  : pushState === 'unavailable'
                  ? 'Browser/perangkat ini tidak mendukung Web Push.'
                  : 'Klik untuk mengaktifkan notifikasi push di perangkat ini.'}
              </p>
            </div>
          </div>
          {pushState === 'granted' ? (
            <button type="button"
              onClick={disablePush}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Nonaktifkan Push
            </button>
          ) : (
            <button type="button"
              onClick={enablePush}
              disabled={busy || pushState === 'unavailable' || pushState === 'denied'}
              className="flex items-center gap-1 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Aktifkan Push
            </button>
          )}
        </div>
      </div>

      {/* Toggle jenis */}
      {loading ? (
        <div className="card p-8 text-center text-sm text-slate-400">Memuat…</div>
      ) : (
        groups.map((g) =>
          g.list.length ? (
            <div key={g.priority} className="card overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-navy-700 dark:bg-navy-800/60">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {g.title}
                </p>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-navy-700">
                {g.list.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{s.label}</p>
                      <div className="mt-1 flex items-center gap-3">
                        <Toggle on={s.in_app} onChange={() => update(s.key, { in_app: !s.in_app })} label="In-app" />
                        <Toggle on={s.push} onChange={() => update(s.key, { push: !s.push })} label="Push" />
                      </div>
                    </div>
                    <Badge tone={s.in_app || s.push ? 'green' : 'gray'}>
                      {s.in_app && s.push ? 'In-app + Push' : s.in_app ? 'In-app' : s.push ? 'Push' : 'Off'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        )
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Perubahan diterapkan saat tombol di-toggle (otomati tersimpan).
        </p>
        <button type="button"
          onClick={load}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700"
        >
          <Save className="h-3.5 w-3.5" /> Muat ulang
        </button>
      </div>
      {toast && <Toast msg={toast} onClose={clearToast} />}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
      <button
        type="button"
        onClick={onChange}
        className={
          'relative h-4 w-7 rounded-full transition ' +
          (on ? 'bg-accent-500' : 'bg-slate-300 dark:bg-navy-600')
        }
        aria-pressed={on}
      >
        <span
          className={
            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition ' +
            (on ? 'left-3.5' : 'left-0.5')
          }
        />
      </button>
      {label}
    </label>
  );
}