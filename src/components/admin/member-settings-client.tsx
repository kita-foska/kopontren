'use client';

import { useEffect, useState } from 'react';
import { api, Toast, useToast } from '@/components/ui';

type Settings = Record<string, string>;

const FIELDS: { key: string; label: string; hint: string; type: 'number' | 'toggle' }[] = [
  {
    key: 'points_every',
    label: 'Poin: setiap Rp…',
    hint: '1 poin loyalti per nominal ini dibelanjakan (mis. 10000 = 1 poin per Rp 10.000).',
    type: 'number',
  },
  {
    key: 'point_value',
    label: 'Nilai 1 poin (Rp)',
    hint: 'Nilai tukar poin saat member menebus poin.',
    type: 'number',
  },
  {
    key: 'member_discount',
    label: 'Diskon member (%)',
    hint: 'Potongan otomatis untuk transaksi bernama member.',
    type: 'number',
  },
  {
    key: 'cashback',
    label: 'Saldo Reward (%)',
    hint: 'Dikreditkan ke saldo reward member setelah transaksi.',
    type: 'number',
  },
  {
    key: 'birthday_active',
    label: 'Promo ulang tahun',
    hint: 'ON: member yang berulang tahun hari ini dapat potongan khusus.',
    type: 'toggle',
  },
  {
    key: 'birthday_discount',
    label: 'Diskon ulang tahun (%)',
    hint: 'Persentase saat promo ulang tahun aktif.',
    type: 'number',
  },
  {
    key: 'wholesale_min',
    label: 'Grosir: min. jumlah',
    hint: 'Ambang jumlah untuk diskon grosir (0 = nonaktif).',
    type: 'number',
  },
  {
    key: 'wholesale_discount',
    label: 'Diskon grosir (%)',
    hint: 'Persentase potongan saat ambang grosir tercapai.',
    type: 'number',
  },
  {
    key: 'tier_silver',
    label: 'Ambang tier Silver (Rp)',
    hint: 'Total belanja kumulatif untuk menjadi member Silver.',
    type: 'number',
  },
  {
    key: 'tier_gold',
    label: 'Ambang tier Gold (Rp)',
    hint: 'Total belanja kumulatif untuk menjadi member Gold.',
    type: 'number',
  },
];

export function MemberSettingsClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    (async () => {
      const r = await api<{ settings: Settings }>('/api/member-settings');
      if (r.ok && r.data) setSettings(r.data.settings);
      else showToast('Gagal memuat pengaturan');
    })();
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    const r = await api('/api/member-settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
    setBusy(false);
    if (r.ok) showToast('Pengaturan member disimpan');
    else showToast(r.error || 'Gagal menyimpan');
  }

  if (!settings) return <p className="text-sm text-slate-500">Memuat…</p>;

  return (
    <div className="card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            {f.type === 'toggle' ? (
              <label className="flex items-center justify-between gap-2">
                <span>
                  <span className="label block">{f.label}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{f.hint}</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings[f.key] === '1'}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.checked ? '1' : '0' })}
                />
              </label>
            ) : (
              <>
                <label className="label">{f.label}</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={settings[f.key]}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{f.hint}</p>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan Pengaturan'}
        </button>
      </div>
      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}
