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
  | 'zis' // W2.7: modul ZIS (skema v22; D2: tulis operasional)
  | 'akad' // W3.3: modul akad syariah (skema v23; tulis operasional admin/manajer)
  | 'koperasi' // W4.3: modul koperasi (skema v24; tulis operasional admin/manajer)
  | 'shu' // W4.4: distribusi SHU rasio input (tulis operasional admin/manajer)
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
  zis: ['admin', 'manajer'], // W2.7 (D2): tulis operasional (sejajar kas); pengurus baca via CALK item 7
  akad: ['admin', 'manajer'], // W3.3: tulis operasional; pengurus baca /admin/akad read-only (tier laporan) + CALK item 8
  koperasi: ['admin', 'manajer'], // W4.3: tulis operasional (Sek.7.1/7.3); pengurus baca /admin/koperasi read-only (tier laporan, pola Q3)
  shu: ['admin', 'manajer'], // W4.4: distribusi SHU rasio input (tulis admin/manajer; read via tier koperasi)
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

// ── H2: beranda per role ──────────────────────────────────────────────
/**
 * Beranda per role. Semua role internal (admin/manajer/pengurus/kasir/
 * gudang/pembelian) -> root '/' (dashboard operasional); member ->
 * '/member' (dashboard pribadi, H3). Peta terpusat di sini agar mudah
 * disesuaikan ke depan (mis. pengurus -> '/laporan') tanpa mengubah
 * halaman. normRole() menormalkan nilai tak dikenal ke 'kasir' (home
 * '/'), jadi roleHome() TIDAK PERNAH mengembalikan undefined.
 */
export const HOME_BY_ROLE: Readonly<Record<Role, string>> = {
  admin: '/',
  manajer: '/',
  pengurus: '/',
  kasir: '/',
  gudang: '/',
  pembelian: '/',
  member: '/member',
};

export function roleHome(role: unknown): string {
  return HOME_BY_ROLE[normRole(role)];
}

// ── M1: multi-role (pure) ──────────────────────────────────────────────
/**
 * M1: parse `users.roles` (JSON array) -> daftar Role valid + dedup.
 * Nilai `primary` WAJIB sudah dinormalkan pemanggil (normRole) — helper ini
 * murni string/JSON + ROLES lokal, sehingga bisa diuji di Node (M1-6
 * scripts/test-roles.ts). Pindah dari auth.ts agar tidak menarik dependensi
 * server (next/headers, @/db) ke modul pure.
 * - raw NULL/kosong/JSON rusak/non-array -> [primary].
 * - Entry tak dikenal di-drop; primary selalu dipasukkan (safety: user
 *   tak pernah kehilangan primary role).
 */
export function parseUserRoles(raw: string | null | undefined, primary: Role): Role[] {
  let arr: unknown = null;
  if (raw) {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = null;
    }
  }
  const out: Role[] = [];
  if (Array.isArray(arr)) {
    for (const r of arr) {
      const s = String(r);
      if ((ROLES as readonly string[]).includes(s) && !out.includes(s as Role)) out.push(s as Role);
    }
  }
  if (out.length === 0 || !out.includes(primary)) out.push(primary);
  return out;
}