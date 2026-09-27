/**
 * UX-5 H1: modul permission PURE — tanpa dependensi server
 * (node:crypto / next/headers / @/db), saged diimpor komponen client
 * (sidebar: filter menu level item). Sumber kebenaran Role/Feature/
 * FEATURE_MATRIX/normRole/canAccess/isManager pindah ke sini;
 * `auth.ts` re-export semua sehingga import lawas dr '@/lib/auth'
 * tetep jalan. (auth.ts campur server+client — landmine G5.)
 */
import type { AppUser } from './auth';

export type Role =
  | 'admin'
  | 'manajer'
  | 'pengurus'
  | 'kasir'
  | 'gudang'
  | 'pembelian'
  | 'member';

export const ROLES: readonly Role[] = [
  'admin',
  'manajer',
  'pengurus',
  'kasir',
  'gudang',
  'pembelian',
  'member',
];

/** Normalize a stored role value; nilai lama (admin/pengurus/kasir) tetap
 *  diterima apa adanya; nilai tak dikenal diturunkan ke 'kasir'. */
export function normRole(v: unknown): Role {
  return (ROLES as readonly string[]).includes(String(v)) ? (v as Role) : 'kasir';
}

/**
 * Matriks permission per fitur (7 role, implementasi 18 Sep 2026).
 * - admin     = akses penuh.
 * - manajer   = operasional + laporan + kelola produk/member.
 * - pengurus  = laporan + audit + zakat (read-only; TIDAK operasional).
 * - kasir     = POS + shift + piutang + retur (retur hanya transaksi sendiri).
 * - gudang    = stok masuk/keluar (opname) + lihat produk.
 * - pembelian = supplier + hutang (payables) + belanja/purchase.
 * - member    = dashboard pribadi (read-only).
 */
export type Feature =
  | 'pos'
  | 'shift'
  | 'products'
  | 'stock'
  | 'supplier' // supplier + payables + belanja
  | 'piutang'
  | 'laporan'
  | 'audit'
  | 'zakat'
  | 'member'
  | 'personal';

export const FEATURE_MATRIX: Readonly<Record<Feature, readonly Role[]>> = {
  pos: ['admin', 'manajer', 'kasir'],
  shift: ['admin', 'manajer', 'kasir'],
  products: ['admin', 'manajer'],
  stock: ['admin', 'manajer', 'gudang'],
  supplier: ['admin', 'manajer', 'pembelian'],
  piutang: ['admin', 'manajer', 'kasir'],
  laporan: ['admin', 'manajer', 'pengurus'],
  audit: ['admin', 'pengurus'],
  zakat: ['admin', 'manajer', 'pengurus'],
  member: ['admin', 'manajer'],
  personal: ['admin', 'manajer', 'pengurus', 'kasir', 'gudang', 'pembelian', 'member'],
};

/** Cek apakah role punya akses ke fitur tertentu (admin selalu lolos). */
export function canAccess(user: AppUser | null | undefined, feature: Feature): boolean {
  if (!user) return false;
  const role = normRole(user.role);
  if (role === 'admin') return true;
  return FEATURE_MATRIX[feature].includes(role);
}

/**
 * Tier operasional: admin + manajer. Catatan perubahan 18 Sep: pengurus
 * TIDAK lagi termasuk tier ini (peran pengurus kini read-only: laporan,
 * audit, zakat). Dipakai utk: pembukuan/kas, konsinyasi, member (CRUD),
 * produk (write), purchases, dan flag UI "ops".
 */
export function isManager(user: AppUser | null | undefined): boolean {
  return user != null && (user.role === 'admin' || user.role === 'manajer');
}