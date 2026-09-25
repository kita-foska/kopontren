'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, Toast, useToast } from '@/components/ui';
import { buildQris } from '@/lib/qris';

type QrisSettings = {
  store_name: string;
  qris_nmid: string;
  qris_nmid2: string;
  qris_mcc: string;
  qris_city: string;
};

/**
 * Admin QRIS (2026-09-25): form konfigurasi NMID/NMID2/MCC/kota + preview
 * QR statis real-time (PNG 1024px, client-side) + download PNG & copy
 * payload. NMID kosong => state OFFLINE (placeholder pralayar).
 * Encoder murni di src/lib/qris.ts (EMVCo/QRIS-BI, CRC16-CCITT).
 */
export function QrisClient() {
  const [toastMsg, showToast, closeToast] = useToast();
  const [s, setS] = useState<QrisSettings | null>(null);
  const [nmid, setNmid] = useState('');
  const [nmid2, setNmid2] = useState('');
  const [mcc, setMcc] = useState('');
  const [city, setCity] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState('');
  const [payload, setPayload] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<QrisSettings>('/api/settings').then((r) => {
      if (!r.ok || !r.data) return showToast(r.error || 'Gagal memuat');
      setS(r.data);
      setNmid(r.data.qris_nmid);
      setNmid2(r.data.qris_nmid2);
      setMcc(r.data.qris_mcc);
      setCity(r.data.qris_city);
    });
  }, []);

  const offline = !nmid.trim();

  useEffect(() => {
    if (offline || !s) {
      setPayload('');
      setQr('');
      return;
    }
    try {
      const p = buildQris({
        nmid,
        nmid2,
        mcc,
        city,
        merchantName: s.store_name,
      });
      setPayload(p);
      QRCode.toDataURL(p, { width: 1024, margin: 2 }).then(setQr).catch(() => setQr(''));
    } catch {
      setPayload('');
      setQr('');
    }
  }, [nmid, nmid2, mcc, city, s]);

  const markDirty = () => setDirty(true);

  async function save() {
    setSaving(true);
    const r = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        qris_nmid: nmid,
        qris_nmid2: nmid2,
        qris_mcc: mcc,
        qris_city: city,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      showToast(r.error || 'Gagal menyimpan');
      return;
    }
    setDirty(false);
    showToast('Konfigurasi QRIS tersimpan');
  }

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Gagal menyalin payload');
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card p-4">
        <h2 className="mb-3 font-bold">Konfigurasi NMID</h2>
        <div className="space-y-3">
          <div>
            <label className="label">NMID (tag 30) *</label>
            <input
              className="input"
              placeholder="mis. ID102003004050"
              value={nmid}
              onChange={(e) => {
                setNmid(e.target.value);
                markDirty();
              }}
            />
            <p className="mt-1 text-xs text-slate-500">
              NMID resmi dari provider QRIS (maks 32). Kosong = fitur offline.
            </p>
          </div>
          <div>
            <label className="label">NMID2 (tag 31) — opsional</label>
            <input
              className="input"
              value={nmid2}
              onChange={(e) => {
                setNmid2(e.target.value);
                markDirty();
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">MCC (tag 52) — opsional</label>
              <input
                className="input"
                placeholder="mis. 5731"
                value={mcc}
                onChange={(e) => {
                  setMcc(e.target.value.replace(/\D/g, '').slice(0, 4));
                  markDirty();
                }}
              />
            </div>
            <div>
              <label className="label">Kota (tag 60) — opsional</label>
              <input
                className="input"
                placeholder="mis. Sleman"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  markDirty();
                }}
              />
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            Nama merchant (tag 59): <strong>{s?.store_name || '…'}</strong> — mengikuti
            pengaturan toko. Perubahan NMID/NMID2/MCC/kota tercatat di audit trail.
          </div>
          <div>
            <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Menyimpan…' : dirty ? 'Simpan' : 'Sudah tersimpan'}
            </button>
          </div>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="mb-3 font-bold">Preview QR Statis</h2>
        {offline ? (
          <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <div>
              <p className="font-bold text-slate-500">QRIS OFFLINE</p>
              <p className="mt-1 text-xs text-slate-500">
                NMID belum diset (placeholder pralayar). Isi NMID resmi di samping untuk
                mengaktifkan QR.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto flex w-64 items-center justify-center rounded-xl border border-slate-300 bg-white p-3 shadow dark:border-slate-700">
              {qr ? (
                <img src={qr} alt="QR QRIS statis" className="h-full w-full" />
              ) : (
                <div className="h-full w-full animate-pulse bg-slate-100" />
              )}
            </div>
            <p className="text-center text-xs text-slate-500">
              QR statis (tanpa nominal) — pembeli input nominal di e-wallet. Dapat discan:
              BCA, Mandiri, BSI, GoPay, OVO, Dana, ShopeePay.
            </p>
            <div className="flex justify-center gap-2">
              <a className="btn-primary" href={qr} download="qris-kopontren.png">
                Download PNG
              </a>
              <button className="btn-ghost" onClick={copyPayload} disabled={!payload}>
                {copied ? 'Tersalin ✓' : 'Copy Payload'}
              </button>
            </div>
            {payload && (
              <pre className="max-h-24 overflow-auto rounded-lg bg-slate-100 p-2 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {payload}
              </pre>
            )}
          </div>
        )}
      </section>
      <Toast msg={toastMsg} onClose={closeToast} />
    </div>
  );
}