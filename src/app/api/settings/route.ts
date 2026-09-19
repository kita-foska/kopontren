import { NextResponse } from 'next/server';
import { getSettings } from '@/db';
import { currentUser } from '@/lib/auth';

/**
 * Read-only shop settings utk widget klien (mis. target nomor WA
 * notifikasi stok di dashboard admin). Hanya field publik —
 * tidak pernah berisi kredensial.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  const s = await getSettings();
  return NextResponse.json({
    store_name: s.store_name,
    store_address: s.store_address,
    store_phone: s.store_phone,
    currency: s.currency,
    receipt_footer: s.receipt_footer,
  });
}