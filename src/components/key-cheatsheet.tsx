'use client';
// UX-7C: Cheatsheet pintasan keyboard GLOBAL (tekan ? di halaman shell mana
// pun, KECUALI /kasir — POS punya panduan "Panduan Kasir" sendiri, ? lokal,
// sejak `7ab05d2`; shell tidak mengulang hotkey di situ agar tidak dua panel).
// Panel memakai Modal standar (ESC + focus trap, a11y UX-6). Ringkasan hotkey
// POS hanya ditampilkan bila user bisa akses POS (canAccess 'pos').
import type { AppUser } from '@/lib/auth';
import { canAccess } from '@/lib/features';
import { Modal } from './ui';

type Row = [string, string];

// Hotkey shell-level: berlaku di semua halaman yang ter-shell.
const GLOBAL_ROWS: Row[] = [
  ['Ctrl+K', 'Buka komando & pencarian (navigasi, aksi, cari lintas-entitas)'],
  ['?', 'Buka / tutup cheatsheet ini'],
  ['Esc', 'Tutup panel / modal yang terbuka'],
];

// Ringkasan hotkey POS (rincian lengkap = "Panduan Kasir" di /kasir, tekan ?
// di sana). Baris dipadatkan — detail ada di pos-client (CHEAT_ROWS).
const POS_ROWS: Row[] = [
  ['F1–F5', 'Alur transaksi: produk · pembeli · uang diterima · simpan · struk'],
  ['F6 · F7', 'Metode bayar (1 tunai · 2 QRIS · 3 transfer · 4 campur) · shift'],
  ['F8 · F9', 'Pilih member · diskon (admin)'],
  ['↑ / ↓ · + / − · Del', 'Seleksi item keranjang · qty · hapus'],
  ['Ctrl+P · Ctrl+M · Ctrl+R', 'Cetak struk · fokus pilih member · reset pesanan'],
];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
      {rows.map(([k, d]) => (
        <div
          key={k}
          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-navy-900/40"
        >
          <span className="shrink-0 font-mono font-bold text-accent-500 dark:text-accent-300">
            {k}
          </span>
          <span className="text-right text-slate-600 dark:text-slate-300">{d}</span>
        </div>
      ))}
    </div>
  );
}

export function KeyCheatsheet({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: AppUser;
}) {
  const showPos = canAccess(user, 'pos');
  return (
    <Modal open={open} title="Pintasan Keyboard" onClose={onClose}>
      <div className="space-y-4">
        <section>
          <h3 className="mb-1.5 card-label">Global (semua halaman)</h3>
          <Rows rows={GLOBAL_ROWS} />
        </section>
        {showPos && (
          <section>
            <h3 className="mb-1.5 card-label">Kasir POS (/kasir)</h3>
            <Rows rows={POS_ROWS} />
            <p className="mt-3 text-2xs leading-relaxed text-slate-600 dark:text-slate-400">
              Panduan lengkap + bantuan bila ada masalah: buka /kasir, tekan{' '}
              <b className="font-semibold">?</b> (&ldquo;Panduan Kasir&rdquo;).
            </p>
          </section>
        )}
        {!showPos && (
          <p className="text-2xs leading-relaxed text-slate-600 dark:text-slate-400">
            Role Anda belum punya pintasan khusus halaman lain — pintasan
            global di atas sudah mencakup semuanya.
          </p>
        )}
      </div>
    </Modal>
  );
}
