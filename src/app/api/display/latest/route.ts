import { NextResponse } from 'next/server';
import { db, getSettings } from '@/db';
import { buildDisplayPayload, type DisplaySaleRow } from '@/lib/display-latest';

/**
 * W8 ITEM 4 (CUSTOMER DISPLAY, ruling Opasi B, ACC 20 Okt 2026):
 * endpoint PUBLIK (tanpa login) utk kiosk pelanggan /display --
 * menampilkan transaksi terakhir (id, total, jumlah baris, label
 * metode, jam WIB, QR QRIS dinamis). Payload PII-FREE: tak pernah ada
 * nama pelanggan/member, tak ada rincian baris (proyeksi eksplisit di
 * src/lib/display-latest.ts). Kiosk mem-polling tiap 3 dtk (pola
 * confidence banner, bukan SSE/WebSocket -- keputusan ruling).
 * No-store sudah diset next.config utk /api/*.
 */
export async function GET() {
  try {
    const d = await db();
    const row = (await d
      .prepare(
        `SELECT s.id, s.total, s.pay_method, s.pay_split, s.created_at,
                (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS item_count
         FROM sales s
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT 1`
      )
      .get()) as DisplaySaleRow | null | undefined;
    const s = await getSettings();
    return NextResponse.json(
      buildDisplayPayload(row, {
        nmid: s.qris_nmid,
        nmid2: s.qris_nmid2,
        mcc: s.qris_mcc,
        city: s.qris_city,
        merchantName: s.store_name,
      })
    );
  } catch (e) {
    // Kiosk tak boleh hang / error merah: DB bermasala = "tak ada data"
    // (layaran idle) + log server.
    console.warn('[display/latest] gagal membaca:', e);
    return NextResponse.json(buildDisplayPayload(null, {}));
  }
}
