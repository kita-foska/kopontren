/**
 * T2: data tutorial /tutorial — salinan statis docs/*.html (public/tutorial/).
 * Slug WAJIB sama dengan nama file tujuan di scripts/sync-tutorial.mjs
 * (public/tutorial/<slug>.html). Konten sumber kebenaran: docs/;
 * ubah docs/ lalu `npm run sync:tutorial` — jangan edit public/tutorial/ manual.
 * Modul pure (tanpa dependensi server) -> boleh diimpor server & client.
 */
export interface Tutorial {
  slug: string;
  title: string;
  desc: string;
}

export const TUTORIALS: Tutorial[] = [
  {
    slug: 'dokumentasi-aplikasi',
    title: 'Dokumentasi Aplikasi',
    desc: 'Panduan lengkap fitur aplikasi Kopontren dari awal sampai akhir.',
  },
  {
    slug: 'sop-admin',
    title: 'SOP Admin',
    desc: 'Prosedur kerja harian role admin: kas, produk, member, laporan, backup.',
  },
  {
    slug: 'sop-gudang',
    title: 'SOP Gudang',
    desc: 'Prosedur gudang: opname stok, masuk/keluar barang, penanganan selisih.',
  },
  {
    slug: 'sop-kasir',
    title: 'SOP Kasir',
    desc: 'Prosedur POS: transaksi penjualan, scan poin, retur, tutup shift.',
  },
  {
    slug: 'sop-manajer',
    title: 'SOP Manajer',
    desc: 'Prosedur operasional & pengawasan: produk, belanja, kas, shift, konsinyasi.',
  },
  {
    slug: 'sop-member',
    title: 'SOP Member',
    desc: 'Panduan kartu member: scan poin, riwayat transaksi, keuntungan member.',
  },
  {
    slug: 'sop-pembelian',
    title: 'SOP Pembelian',
    desc: 'Prosedur supplier: belanja, verifikasi tagihan, bayar hutang supplier.',
  },
  {
    slug: 'sop-pengurus',
    title: 'SOP Pengurus',
    desc: 'Panduan dashboard global: laporan, audit, zakat (read-only pengurus).',
  },
];

/** Validasi slug (guard route /tutorial/[slug] — mirror MENU_ITEMS). */
export function slugOk(slug: string): boolean {
  return TUTORIALS.some((t) => t.slug === slug);
}

export function tutorialBySlug(slug: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.slug === slug);
}
