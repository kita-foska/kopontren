import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { buildEstructUrl, hasEstructSecret } from '@/lib/struk-link';

/**
 * GET /api/struk-link?id=<saleId> (W14-1 E-STRUK)
 * Buat link e-Struk publik /struk/<saleId>.<hmac> -- token HMAC
 * (STRUK_LINK_SECRET) jadi link tak bisa ditebak; tanpa skema baru.
 * Guard: role bertier POS (kasir + admin). Tanpa env -> 503 + pesan
 * (tombol di POS juga otomatis tersembunyi bila buildEstructUrl null).
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'pos')) {
    return NextResponse.json({ error: 'Role tidak dapat membuat link struk' }, { status: 403 });
  }
  const id = Number(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id transaksi tidak valid' }, { status: 400 });
  }
  if (!hasEstructSecret()) {
    return NextResponse.json(
      { error: 'e-Struk link belum dikonfigurasi -- set env STRUK_LINK_SECRET di Vercel lalu deploy ulang.' },
      { status: 503 }
    );
  }
  const d = await db();
  const row = (await d.prepare('SELECT id FROM sales WHERE id = ?').get(id)) as
    | { id: number }
    | undefined;
  if (!row) {
    return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  }
  const url = buildEstructUrl(id, req.nextUrl.origin);
  if (!url) {
    return NextResponse.json(
      { error: 'e-Struk link belum dikonfigurasi -- set env STRUK_LINK_SECRET di Vercel lalu deploy ulang.' },
      { status: 503 }
    );
  }
  return NextResponse.json({ url, no: '#' + id }, { headers: { 'Cache-Control': 'no-store' } });
}