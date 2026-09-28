import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';

/**
 * UX-7A: pencarian global lintas-entitas utk Command Palette (Ctrl+K).
 *
 * GET /api/search?q=<min 2 karakter>
 * -> { products: [...max 5], members: [...max 5], sales: [...max 5] }
 *
 * Aturan (Target Turso Rows Read < 3.000):
 * - Guard tier 'pos' (admin, manajer, kasir) — selaras pembacaan members
 *   (PII) di /api/members; peran lain ditolak 403.
 * - q < 2 karakter: tanpa query DB, kembalikan daftar kosong (hemat).
 * - Escape meta-char LIKE (% _ \) agar input user jadi pola literal
 *   (pola sama persis dgn /api/members ?q=).
 * - 3 query paralel, masing-masing LIMIT 5 -> maks 15 baris terkirim.
 * - Data bisnis tanpa cache: hasil harus selalu segar.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'pos'))
    return NextResponse.json({ error: 'Hanya admin/manajer/kasir' }, { status: 403 });
  const url = new URL(req.url);
  const q = String(url.searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ products: [], members: [], sales: [] });
  const qEsc = q.replace(/[\\%_]/g, (ch) => '\\' + ch);
  const like = '%' + qEsc + '%';
  const qIsId = /^\d+$/.test(q); // "cari #id" transaksi (pola laporan)
  const d = await db();
  const [products, members, sales] = await Promise.all([
    // Katalog aktif saja (sama dgn yang dipakai POS ?live=1).
    d
      .prepare(
        `SELECT id, name, category, unit, base_price, stock, barcode
         FROM products
         WHERE active = 1
           AND (name LIKE ? ESCAPE '\\' OR barcode LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')
         ORDER BY name COLLATE NOCASE LIMIT 5`
      )
      .all(like, like, like),
    // PII ringkas (tanpa address/qr_code) — konteks palette.
    d
      .prepare(
        `SELECT id, name, phone, points, tier
         FROM members
         WHERE (name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')
         ORDER BY name COLLATE NOCASE LIMIT 5`
      )
      .all(like, like),
    // Transaksi: nama pembeli; bila q angka murni -> cocokkan juga #id.
    d
      .prepare(
        `SELECT id, customer, total, status, created_at
         FROM sales
         WHERE customer LIKE ? ESCAPE '\\'${qIsId ? ' OR id = ?' : ''}
         ORDER BY created_at DESC LIMIT 5`
      )
      .all(...(qIsId ? [like, Number(q)] : [like])),
  ]);
  return NextResponse.json({ products, members, sales, q });
}
