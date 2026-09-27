'use client';

import { useState } from 'react';
import { Button, Empty, StatusBadge } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';
import { pointReasonLabel, isPointUnit, type PointEntry } from '@/lib/points';
import { payMethodLabel } from '@/lib/pay-methods';
import { MemberQrBadge, type MemberQrMember } from '@/components/admin/member-qr-badge';

type MySaleRow = {
  id: number;
  total: number;
  pay_method: string;
  status: string;
  member_points: number;
  created_at: string;
};

/**
 * UX-5 H3: tampilan dashboard member (prop murni dari halaman server
 * /member). Read-only: saldo + tier, riwayat poin & reward (ledger),
 * transaksi saya, dan CTA modal kartu QR (reuse MemberQrBadge) / kembali ke
 * POS bila role user punya akses (admin/manajer/kasir) - member murni
 * tidak memiliki akses POS sehingga CTA itu disembunyikan, bukan dead-end.
 */
export function MemberDashboardClient({
  member,
  history,
  sales,
  showPosCta,
}: {
  member: (MemberQrMember & { tier: string; cashback_balance: number; total_spent: number }) | null;
  history: PointEntry[];
  sales: MySaleRow[];
  showPosCta: boolean;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  // Salinan token QR utk sinkron setelah auto-generate (badge admin) -
  // baris server tidak berubah tanpa reload.
  const [memberQr, setMemberQr] = useState(member?.qr_code ?? '');

  if (!member) {
    return (
      <div className="card fade-up p-4">
        <Empty
          text="Kartu keanggotaan belum terhubung ke akun ini."
          ctaLabel={showPosCta ? 'Ke POS (Buat Transaksi)' : 'Ke Ringkasan'}
          ctaHref={showPosCta ? '/kasir' : '/'}
          ctaVariant="primary"
        />
      </div>
    );
  }

  const tier = (member.tier || '').toLowerCase();

  return (
    <div className="space-y-4">
      {/* ── Ringkasan kartu ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card fade-up p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Poin
          </p>
          <p className="tabular-nums mt-1 text-2xl font-extrabold">{member.points}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tier === 'gold' ? 'Tier Gold' : tier === 'silver' ? 'Tier Silver' : 'Tanpa tier'}
          </p>
        </div>
        <div className="card fade-up p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Saldo Reward
          </p>
          <p className="tabular-nums mt-1 text-2xl font-extrabold">
            {rp(member.cashback_balance)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">uang kembali</p>
        </div>
        <div className="card fade-up p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total Belanja
          </p>
          <p className="tabular-nums mt-1 text-2xl font-extrabold">
            {rp(member.total_spent)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {member.created_at ? 'sejak ' + fmtDateTime(member.created_at) : ''}
          </p>
        </div>
        <div className="card fade-up p-4">
          <h2 className="mb-2 font-bold">Kartu &amp; Aksi</h2>
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={() => setQrOpen(true)}>
              Lihat &amp; Cetak Kartu
            </Button>
            {showPosCta && (
              <Button variant="ghost" as="a" href="/kasir">
                Kembali ke Belanja (POS)
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* ── Riwayat poin & reward (ledger, 20 terakhir) ── */}
      <div className="card fade-up p-4">
        <h2 className="mb-2 font-bold">Riwayat Poin &amp; Reward</h2>
        {history.length === 0 ? (
          <Empty
            compact
            text="Belum ada aktivitas poin atau reward."
            ctaLabel={showPosCta ? 'Mulai Belanja (POS)' : undefined}
            ctaHref={showPosCta ? '/kasir' : undefined}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((h) => {
              const plus = h.delta > 0;
              const unit = isPointUnit(h.reason) ? ' poin' : ' rupiah';
              return (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {pointReasonLabel(h.reason)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {fmtDateTime(h.created_at)}
                      {h.amount > 0 ? ' · ' + rp(h.amount) : ''}
                    </p>
                  </div>
                  <span
                    className={
                      'tabular-nums shrink-0 font-bold ' +
                      (plus
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400')
                    }
                  >
                    {plus ? '+' : ''}
                    {h.delta}
                    {unit}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Transaksi saya (20 terakhir) ── */}
      <div className="card fade-up p-4">
        <h2 className="mb-2 font-bold">Transaksi Saya</h2>
        {sales.length === 0 ? (
          // I-4 UX-6: empty state CTA POS kondisional (pola H3: showPosCta
          // hanya bila role punya akses /kasir — member murni tanpa CTA,
          // bukan link mati). Mirip CTA "Riwayat Poin & Reward" di atas.
          <Empty
            compact
            text="Belum ada transaksi atas nama Anda."
            ctaLabel={showPosCta ? 'Mulai Belanja (POS)' : undefined}
            ctaHref={showPosCta ? '/kasir' : undefined}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {sales.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">{rp(s.total)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {fmtDateTime(s.created_at)} · {payMethodLabel(s.pay_method)}
                    {s.member_points > 0 ? ' · +' + s.member_points + ' poin' : ''}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal kartu membership (reuse admin; auto-generate QR khusus admin -
          role lain melihat hint bila token belum dibuat). */}
      {qrOpen && (
        <MemberQrBadge
          member={{ ...member, qr_code: memberQr }}
          onClose={() => setQrOpen(false)}
          onQrChanged={(token) => setMemberQr(token)}
        />
      )}
    </div>
  );
}