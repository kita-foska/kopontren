import { Button, TermTip } from '@/components/ui';

/** I-8 UX-6: satu baris feed "Apa yang berubah" (5 audit log terbaru). */
export type FeedItem = {
  id: number;
  username: string;
  user_name: string | null;
  user_role: string | null;
  action: string;
  record_id: string | null;
  created_at: string;
};

/** KPI mover utk feed: label + teks delta (dari kpiDelta) + tone. */
export type KpiMover = { label: string; text: string; tone: 'up' | 'down' | 'flat' };

/**
 * Audit action -> human-readable (I-8 V1: aksi yang dikenal di codebase;
 * yang tak dikenal tampil mentah via fallback, mis. `cash:create`).
 */
const ACTION_LABEL: Record<string, string> = {
  'sales:create': 'Jual',
  'sales:status': 'Ubah status penjualan',
  'sales:delete': 'Hapus penjualan',
  'retur:create': 'Retur',
  'shift:open': 'Buka shift',
  'shift:close': 'Tutup shift',
  'product:create': 'Produk baru',
  'product:update': 'Ubah produk',
  'product:stock': 'Ubah stok',
  'product:toggle': 'Aktif/nonaktif produk',
  'product:archive': 'Arsipkan produk',
  'product:delete': 'Hapus produk',
  'product:import': 'Impor produk',
  'product:wholesale': 'Ubah harga grosir',
  'products:bulk-price': 'Update harga massal',
  'products:bulk-archive': 'Arsipkan massal',
  'member:create': 'Member baru',
  'member:update': 'Ubah member',
  'member:delete': 'Hapus member',
  'member:qr-reset': 'Reset QR member',
  'member:settings': 'Ubah pengaturan member',
  'payable:create': 'Hutang supplier baru',
  'payable:update': 'Ubah hutang supplier',
  'debt:create': 'Piutang baru',
  'user:create': 'User baru',
  'user:active': 'Aktif/nonaktif user',
  'user:password': 'Ganti password',
  'user:reset-password': 'Reset password user',
  'settings:update': 'Ubah pengaturan',
  'zakat:settings': 'Ubah pengaturan zakat',
  'zakat:record': 'Catat zakat',
  'backup:export': 'Export backup',
  'backup:import': 'Import backup',
  'backup:restore': 'Restore backup',
  'backup:delete': 'Hapus backup',
};

/** Relatif: "baru saja" / "Xm lalu" / "Xj lalu" / "HH.mm" (WIB utk >24j).
 *  Selisih waktu tak bergantung zona; hanya tampilan HH.mm yang diset Asia/Jakarta. */
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'baru saja';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm lalu';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'j lalu';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(new Date(t));
}

/**
 * I-8 UX-6: kartu "Apa yang berubah" utk dashboard.
 * - `logs`: 5 audit log terbaru (diambil server-side oleh page, philosophy I-3).
 * - `movers`: KPI delta non-flat (maks. 3, urutan page = penjualan -> kas -> member).
 * - `ctaHref`: tombol ke Audit Log; hanya dirender bila user punya tier `audit`.
 * Komponen presentational tanpa state -> aman di server component.
 */
export function ActivityFeed({
  logs,
  movers,
  ctaHref,
  canViewAudit = true,
}: {
  logs: FeedItem[];
  movers?: KpiMover[];
  ctaHref: string;
  canViewAudit?: boolean;
}) {
  const moved = (movers ?? []).filter((m) => m.tone !== 'flat').slice(0, 3);
  return (
    <div className="card fade-up p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Apa yang berubah</h2>
        {canViewAudit && (
          <Button variant="ghost" className="h-7 px-2 text-xs" as="a" href={ctaHref}>
            Lihat audit log
          </Button>
        )}
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Belum ada aktivitas tercatat.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {logs.map((l) => (
            <li key={l.id} className="flex items-baseline gap-1 text-sm">
              <span className="font-semibold">{ACTION_LABEL[l.action] ?? l.action}</span>
              {l.record_id ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  #{l.record_id}
                </span>
              ) : null}
              <span className="ml-auto shrink-0 text-xs text-slate-500 dark:text-slate-400">
                {l.user_name || l.username}
                {l.user_role ? ' · ' + l.user_role : ''} · {timeAgo(l.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {moved.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-navy-700">
          {moved.map((m) => (
            <TermTip key={m.label} tip="Periode berjalan vs periode sebelumnya">
              <span
                className={
                  'badge font-semibold tabular-nums ' +
                  (m.tone === 'down'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400')
                }
              >
                {m.label}: {m.text}
              </span>
            </TermTip>
          ))}
        </div>
      )}
    </div>
  );
}
