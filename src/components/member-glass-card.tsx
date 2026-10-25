'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui';
import { T } from '@/lib/tokens';
import { rp } from '@/lib/format';
import {
  glassCardCopyValue,
  glassTierBadge,
  glassTiltDeg,
  glassTiltTransform,
} from '@/lib/member-card';
import type { MemberQrMember } from '@/components/admin/member-qr-badge';

/**
 * W14-2 -- Kartu member glassmorphic 300x100 (premium):
 * - Gradasi wine-700/800/900 + lapisan refleksi kaca (glass).
 * - Tilt 3D halus HANYA pointer mouse (desktop); mobile/touch +
 *   prefers-reduced-motion = statis (tanpa tilt).
 * - Badge tier GOLD/SILVER (kelas sama dgn MemberQrBadge), chip,
 *   nama, telepon, poin + saldo reward.
 * - QR thumbnail (reuse dependency qrcode -- pola MemberQrBadge,
 *   tanpa dependensi anyar).
 * - "Salin Nomor" menyalin token QR (utk dipindai kasir); bila QR
 *   belum ada -> nomor member (id).
 * - CTA "Lihat Detail" membuka modal kartu QR existing
 *   (MemberQrBadge) -- tanpa duplikasi fungsi cetak/perbarui.
 * - Cetak: @page portrait (khusus cetakan kartu di dashboard).
 * Helper pure ada di lib/member-card.ts (suite #43).
 */

type GlassMember = MemberQrMember & {
  tier: string;
  cashback_balance: number;
  total_spent: number;
};

/** Chip kartu (inline SVG, tanpa pustaka ikon). */
function ChipIcon() {
  return (
    <svg width="24" height="18" viewBox="0 0 24 18" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="22" height="16" rx="3" className="fill-amber-300" />
      <rect
        x="7"
        y="5"
        width="10"
        height="8"
        rx="1.5"
        fill="none"
        strokeWidth="1.5"
        className="stroke-wine-900/60"
      />
    </svg>
  );
}

export function MemberGlassCard({
  member,
  qr,
  onDetail,
}: {
  member: GlassMember;
  /** Token QR (dashboard mensinkronkan bila auto-generate di modal). */
  qr?: string;
  /** CTA "Lihat Detail" -> buka modal MemberQrBadge. */
  onDetail?: () => void;
}) {
  const qrToken = qr ?? member.qr_code ?? '';
  const [qrData, setQrData] = useState('');
  const [tilt, setTilt] = useState('none');
  const [tiltEnabled, setTiltEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // QR thumbnail (data URL, tanpa dependensi runtime anyar).
  useEffect(() => {
    if (!qrToken) {
      setQrData('');
      return;
    }
    let mounted = true;
    QRCode.toDataURL(qrToken, {
      width: 160,
      margin: 1,
      color: { dark: T.slate900, light: T.white },
    })
      .then((u) => {
        if (mounted) setQrData(u);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [qrToken]);

  // Tilt hanya utk pointer "fine" (mouse) + hormati reduced-motion;
  // mobile/touch = kartu statis (tidak getar-getar di layar sentuh).
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTiltEnabled(fine && !reduce);
  }, []);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!tiltEnabled || e.pointerType !== 'mouse') return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const d = glassTiltDeg({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      w: r.width,
      h: r.height,
      maxDeg: 6,
    });
    setTilt(glassTiltTransform(d.rx, d.ry));
  }

  function onPointerLeave() {
    setTilt('none');
  }

  async function salin() {
    try {
      await navigator.clipboard?.writeText(
        glassCardCopyValue({ id: member.id, qr_code: qrToken }),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard tak tersedia (mis. non-https) -- tanpa crash */
    }
  }

  const badge = glassTierBadge(member.tier);

  return (
    <div className="glass-card-print w-[300px] max-w-full">
      {/* Kartu (300x100) -- glassmorphic wine */}
      <div
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{ transform: tilt }}
        className="relative h-[100px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-wine-700 via-wine-800 to-wine-900 shadow-lg ring-1 ring-white/20 transition-transform duration-150 ease-out"
      >
        {/* Refleksi kaca (lapisan atas) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 via-white/5 to-transparent"
        />
        {badge && (
          <span
            className={`absolute right-2 top-2 z-10 rounded-md px-1.5 py-0.5 text-2xs font-extrabold tracking-wider ${badge.cls}`}
          >
            {badge.label}
          </span>
        )}
        <div className="relative flex h-full items-center gap-3 px-3">
          <div className="min-w-0 flex-1">
            <ChipIcon />
            <p className="mt-1 truncate text-sm font-bold text-white">{member.name}</p>
            <p className="truncate text-2xs text-rose-100/80">{member.phone || '-'}</p>
            <p className="tabular-nums mt-0.5 text-2xs text-white/80">
              Poin {member.points} &middot; Reward {rp(member.cashback_balance)}
            </p>
          </div>
          {qrData ? (
            <img
              src={qrData}
              alt={'QR ' + member.name}
              className="h-12 w-12 shrink-0 rounded-md bg-white p-0.5"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/10 text-center text-2xs text-rose-100/70">
              {qrToken ? 'QR' : 'Belum'}
            </div>
          )}
        </div>
      </div>

      {/* Aksi kartu */}
      <div className="mt-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={salin}>
          {copied ? 'Disalin' : 'Salin Nomor'}
        </Button>
        {onDetail && (
          <Button variant="ghost" size="sm" onClick={onDetail}>
            Lihat Detail
          </Button>
        )}
        {member.created_at && (
          <p className="text-2xs text-slate-500 dark:text-slate-400">
            Terdaftar {member.created_at.slice(0, 10)}
          </p>
        )}
      </div>

      {/* Cetak: kartu tampil rapi di kertas portrait (halaman A4). */}
      <style>{`@media print {
        @page { size: A4 portrait; margin: 10mm; }
        .glass-card-print { box-shadow: none !important; }
      }`}</style>
    </div>
  );
}

