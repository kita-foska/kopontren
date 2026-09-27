import { redirect } from 'next/navigation';
import { canAccess, currentUser } from '@/lib/auth';
import { db } from '@/db';
import { queryPointHistory, type PointEntry } from '@/lib/points';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const MemberDashboardClient = lazy(
  () =>
    import('@/components/member/personal-dashboard-client').then(
      (m) => m.MemberDashboardClient
    ),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

type MemberRow = {
  id: number;
  name: string;
  phone: string;
  points: number;
  total_spent: number;
  created_at: string;
  tier: string;
  cashback_balance: number;
  qr_code: string;
};

type MySaleRow = {
  id: number;
  total: number;
  pay_method: string;
  status: string;
  member_points: number;
  created_at: string;
};

/**
 * UX-5 H3 (fix I-4): dashboard pribadi ROLE MEMBER — read-only, filtered.
 *
 * Data diambil server-side langsung dari DB (tanpa endpoint baru):
 * relasi `users.member_id` -> baris `members` (kartu loyalti milik user),
 * ledger `point_history` (riwayat poin & reward, 20 terakhir) dan `sales`
 * ber-`member_id` (transaksi saya, 20 terakhir). Role lain (admin/manajer
 * dst) bisa membuka halaman ini sebagai pratinjau kartu pribadi mereka;
 * semua peran tetap read-only.
 */
export default async function MemberPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const d = await db();

  // 1) Relasi user -> kartu member (auto-member; boleh NULL).
  const link = (await d
    .prepare('SELECT member_id FROM users WHERE id = ?')
    .get(user.id)) as { member_id: number | null } | undefined;

  // 2) Baris members (kartu loyalti) bila terhubung.
  const member: MemberRow | null = link?.member_id
    ? ((await d
        .prepare(
          `SELECT id, name, phone, points, total_spent, created_at,
                  tier, cashback_balance, qr_code
           FROM members WHERE id = ?`
        )
        .get(link.member_id)) as MemberRow | undefined) ?? null
    : null;

  // 3) Ledger poin/reward + transaksi saya (masing-masing 20 baris;
  //    WHERE member_id ter-index: idx_point_history_member / idx_sales_member).
  const history: PointEntry[] = member
    ? await queryPointHistory(d, member.id, 20, 0)
    : [];
  const sales: MySaleRow[] = member
    ? ((await d
        .prepare(
          `SELECT id, total, pay_method, status, member_points, created_at
           FROM sales WHERE member_id = ?
           ORDER BY created_at DESC LIMIT 20`
        )
        .all(member.id)) as MySaleRow[])
    : [];

  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Kartu <span className="text-accent-500 dark:text-accent-300">Member Saya</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Ringkasan poin, saldo reward, dan transaksi Anda - read-only.
      </p>
      <MemberDashboardClient
        member={member}
        history={history}
        sales={sales}
        showPosCta={canAccess(user, 'pos')}
      />
    </Shell>
  );
}