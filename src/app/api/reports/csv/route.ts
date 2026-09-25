import { NextResponse } from 'next/server';
import { db } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { parsePaySplit } from '@/lib/pay-methods';
import { startOfDayJakarta, utcToWib } from '@/lib/format';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });
  const url = new URL(req.url);
  // Batasi rentang export: maks 365 hari ke belakang (default lama = sejak 1970).
  const rawFrom = url.searchParams.get('from')?.trim() ?? '';
  const fromNorm = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : null;
  // Batas WIB (Batch F): cap 365 hari memakai hari kalender WIB
  // (startOfDayJakarta), bukan UTC (midnight UTC = 07:00 WIB → meleset ±7 jam).
  const capStr = startOfDayJakarta(-365).slice(0, 10);
  const from = fromNorm && fromNorm >= capStr ? fromNorm : capStr;
  // 'YYYY-MM-DD' (hari kalender WIB) → ISO tengah malam WIB, agar boundary
  // s.created_at >= ? jatuh tepat 00:00 WIB, bukan 00:00 UTC (07:00 WIB).
  const fromIso = new Date(from + 'T00:00:00+07:00').toISOString();
  const d = await db();
  const rows = (
    (await d
      .prepare(
        `SELECT s.created_at, u.username AS kasir, s.customer, s.pay_method, s.pay_split, s.status,
                si.product_name, si.qty, si.unit, si.unit_price, si.discount AS item_disc,
                si.subtotal, s.total AS sale_total, s.discount AS sale_disc
       FROM sales s
       LEFT JOIN users u ON u.id = s.kasir_id
       JOIN sale_items si ON si.sale_id = s.id
       WHERE s.created_at >= ?
        ORDER BY s.created_at DESC, si.id
        LIMIT 50000`
      )
      .all(fromIso)) as Record<string, unknown>[]
  );
  const head = [
    'created_at_wib',
    'kasir',
    'customer',
    'metode',
    'pembayaran_campur',
    'status',
    'produk',
    'qty',
    'unit',
    'harga_satuan',
    'diskon_item',
    'subtotal',
    'total_transaksi',
    'diskon_transaksi',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv =
    head.join(',') +
    '\n' +
    rows
      .map((r) => {
        // Split (fitur 3): mis. "cash=70000+tf=30000"; kosong bila tunggal.
        const pp = parsePaySplit(r.pay_split);
        return [
          utcToWib(String(r.created_at ?? '')),
          r.kasir,
          r.customer,
          r.pay_method,
          pp.length > 0 ? pp.map((p) => p.m + '=' + p.a).join('+') : '',
          r.status,
          r.product_name,
          r.qty,
          r.unit,
          r.unit_price,
          r.item_disc ?? 0,
          r.subtotal,
          r.sale_total,
          r.sale_disc ?? 0,
        ];
      })
      .map((cells) => cells.map(esc).join(','))
      .join('\n');
  // Sanitize the filename: Windows forbids ':' (and '/', '\\', ':', '?', etc.)
  const safeFrom = String(from).replace(/[^A-Za-z0-9._-]/g, '-');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="kopontren-penjualan-' + safeFrom + '.csv"',
    },
  });
}
