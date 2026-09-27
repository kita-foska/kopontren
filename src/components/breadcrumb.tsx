import Link from 'next/link';

/**
 * UX-5 H4 — breadcrumb visual untuk rute nested (/admin/*, /pengurus/*).
 * VISUAL ONLY, tanpa logika data: item pertama "Kopontren" = link ke '/';
 * item tengah = label (inert, tanpa href — /admin/ & /pengurus/ tidak
 * punya index page, jadi tak ada keputusan routing di sini); item akhir
 * = halaman saat ini (aria-current="page"). Deep-link SPA = milik H5.
 */
// Kamus label rute (peta terpusat, gaya H2); fallback = kapital + spasi.
const LABELS: Record<string, string> = {
  admin: 'Admin',
  pengurus: 'Pengurus',
  dashboard: 'Dashboard',
  produk: 'Produk',
  belanja: 'Belanja',
  laporan: 'Laporan',
  kas: 'Kas',
  qris: 'QRIS',
  konsinyasi: 'Konsinyasi',
  shift: 'Shift',
  zakat: 'Zakat',
  hutang: 'Hutang',
  member: 'Member',
  'pengaturan-member': 'Pengaturan Member',
  pengguna: 'Pengguna',
  notifications: 'Notifikasi',
  settings: 'Pengaturan',
  data: 'Data & Backup',
  migrate: 'Migrasi',
  audit: 'Audit',
};

const labelOf = (seg: string) => LABELS[seg] ?? seg.toUpperCase().replace(/-/g, ' ');

export function Breadcrumb({ path }: { path: string }) {
  const segs = path.split('/').filter(Boolean); // [area, ..., halaman]
  if (segs[0] !== 'admin' && segs[0] !== 'pengurus') return null;
  const items = segs.slice(1).map(labelOf);
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400"
    >
      <Link href="/" className="font-semibold hover:underline">
        Kopontren
      </Link>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span aria-hidden className="text-slate-400 dark:text-slate-500">
            /
          </span>
          {i === items.length - 1 ? (
            <span
              aria-current="page"
              className="font-semibold text-slate-800 dark:text-slate-100"
            >
              {it}
            </span>
          ) : (
            <span>{it}</span>
          )}
        </span>
      ))}
    </nav>
  );
}