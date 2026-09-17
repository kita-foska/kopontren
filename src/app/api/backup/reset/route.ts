import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const d = await db();
  await tx(d, async () => {
    await d.exec(
      `DELETE FROM sale_items;
       DELETE FROM sales;
       DELETE FROM purchases;
       DELETE FROM expenses;
       DELETE FROM cash_entries;
       DELETE FROM products;
       DELETE FROM consignments;
       DELETE FROM members;
       DELETE FROM shifts;`
    );
  });
  await logAudit(user, 'data:reset', 'database', null, undefined, {
    note: 'Semua data operasional dihapus',
  });
  return NextResponse.json({
    ok: true,
    note: 'Semua data operasional dihapus. Akun pengguna & riwayat session tetap ada.',
  });
}
