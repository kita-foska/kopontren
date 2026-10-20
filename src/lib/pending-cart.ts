/**
 * W8 ITEM 3 (PENDING CART, 20 Okt 2026): persist keranjang kasir yang
 * belum di-checkout ke localStorage (key PENDING_CART_KEY), resume di
 * sesi berikutnya / tab kedua (multi-tab via event storage, dipanggil
 * dari pos-client.tsx). Hermetis & pure -- tanpa dependensi server
 * (@/db, next/) dan tanpa akses DOM: akses localStorage dilakukan oleh
 * pemanggil; modul ini hanya (de)serialize + validasi. String ASCII.
 * Teruji: scripts/test-pending-cart.ts (suite 39).
 *
 * Kontrak key: PENDING_CART_KEY adalah key BAHASA SENDIRI -- terpisah
 * dari POS_QUEUE_KEY ('kopontren_pos_queue_v1', beku P13.1/W5.1) yang
 * antre transaksi SUDAH JADI; modul ini menyimpan keranjang MENUNGGU.
 *
 * Bentuk tersimpan: { items, customer, member_id, pay, note, ts }.
 * Keputusan (ruling W8 Item 3): mix/received/disc TIDAK disimpan --
 * atribut momen bayar; bila kasir resume, nominal diulang.
 */
import { STOCK_EPS } from './multisatuan.ts';

export const PENDING_CART_KEY: string = 'kopontren_pos_pending_cart_v1';

const PAY_METHODS = ['cash', 'tf', 'wa'] as const;

/**
 * Bentuk minimum produk untuk validasi baris (Product di pos-client.tsx
 * punya field persis sama -- kompatibel struktural, tak perlu impor
 * tipe komponen agar modul tetap pure & bebas reaktualisasi UI).
 */
export interface PendingCartProduct {
  id: number;
  name: string;
  category: string;
  unit: string;
  base_price: number;
  stock: number;
  barcode?: string;
  is_consignment?: number;
  wholesale?: string;
  image_url?: string;
  pack_units?: string;
}

/** Baris pending cart -- snapshot produk + qty + harga (+ flag manual). */
export interface PendingCartLine {
  product: PendingCartProduct;
  qty: number;
  price: number;
  manual?: boolean;
  unitName?: string;
  qtyPerBase?: number;
}

/** Bentuk penuh pending cart yang tersimpan (JSON di PENDING_CART_KEY). */
export interface PendingCart {
  items: PendingCartLine[];
  customer: string;
  member_id: string;
  pay: 'cash' | 'tf' | 'wa';
  note: string;
  ts: string;
}

/** Normalisasi 1 baris tersimpan: baris rusak -> null (dihitung dropped). */
function normalizeLine(it: unknown): PendingCartLine | null {
  if (typeof it !== 'object' || it === null) return null;
  const l = it as Record<string, unknown>;
  const p = l.product;
  if (typeof p !== 'object' || p === null) return null;
  const prod = p as Record<string, unknown>;
  if (typeof prod.id !== 'number' || typeof prod.name !== 'string') return null;
  const qty = Number(l.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const price = Number(l.price);
  if (!Number.isFinite(price) || price < 0) return null;
  const qpb = Number(l.qtyPerBase);
  const line: PendingCartLine = {
    product: {
      id: prod.id,
      name: prod.name,
      category: typeof prod.category === 'string' ? prod.category : '',
      unit: typeof prod.unit === 'string' ? prod.unit : '',
      base_price: Number.isFinite(Number(prod.base_price)) ? Number(prod.base_price) : 0,
      stock: Number.isFinite(Number(prod.stock)) ? Number(prod.stock) : 0,
      barcode: typeof prod.barcode === 'string' ? prod.barcode : undefined,
      is_consignment: typeof prod.is_consignment === 'number' ? prod.is_consignment : undefined,
      wholesale: typeof prod.wholesale === 'string' ? prod.wholesale : undefined,
      image_url: typeof prod.image_url === 'string' ? prod.image_url : undefined,
      pack_units: typeof prod.pack_units === 'string' ? prod.pack_units : undefined,
    },
    qty: Math.floor(qty),
    price,
    manual: l.manual === true ? true : undefined,
    unitName: typeof l.unitName === 'string' && l.unitName !== '' ? l.unitName : undefined,
    qtyPerBase: Number.isFinite(qpb) && qpb > 0 && qpb !== 1 ? qpb : undefined,
  };
  return line;
}

/**
 * Serialize pending cart (pemanggil menuliskannya ke storage dengan
 * try/catch -- storage penuh = swallow, POS tetap jalan). ts parameter
 * opsional untuk test hermetis (default = sekarang).
 */
export function serializePendingCart(
  items: PendingCartLine[],
  customer: string,
  memberId: string,
  pay: string,
  note: string,
  ts: string = new Date().toISOString()
): string {
  const data: PendingCart = {
    items,
    customer: customer || '',
    member_id: memberId || '',
    pay: (PAY_METHODS as readonly string[]).includes(pay) ? (pay as PendingCart['pay']) : 'cash',
    note: note || '',
    ts: typeof ts === 'string' && ts !== '' ? ts : new Date(0).toISOString(),
  };
  return JSON.stringify(data);
}

/**
 * Baca + validasi JSON tersimpan: bukan JSON / bukan objek / items bukan
 * array / semua baris rusak / items kosong -> null (tak ada "bangkitnya"
 * data korup). Baris valid dinormalisasi; snapshot produk dipertahankan
 * -- clamp stok dilakukan terpisah saat resume (clampPendingCart).
 */
export function readPendingCart(raw: string | null): PendingCart | null {
  if (typeof raw !== 'string' || raw === '') return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof d !== 'object' || d === null) return null;
  const o = d as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items: PendingCartLine[] = [];
  for (const it of o.items) {
    const line = normalizeLine(it);
    if (line) items.push(line);
  }
  if (items.length === 0) return null;
  return {
    items,
    customer: typeof o.customer === 'string' ? o.customer : '',
    member_id: typeof o.member_id === 'string' ? o.member_id : '',
    pay: (PAY_METHODS as readonly string[]).includes(o.pay as string)
      ? (o.pay as PendingCart['pay'])
      : 'cash',
    note: typeof o.note === 'string' ? o.note : '',
    ts: typeof o.ts === 'string' ? o.ts : new Date(0).toISOString(),
  };
}


/**
 * Validasi baris tersimpan TERHADAP katalog produk saat ini (dipanggil
 * saat kasir memilih "Lanjutkan"):
 *  - product_id hilang dari katalog = baris di-drop (jumlah di `dropped`);
 *  - qty di-clamp ke stok saat ini (pola setQty POS: floor
 *    ((stock + STOCK_EPS) / qpb); barang titipan tanpa cap);
 *  - data produk (nama/harga basis/stok/wholesale) di-refresh ke versi
 *    katalog -- harga baris (termasuk manual) tetap harga tersimpan;
 *  - katalog kosong (cold start offline, produk belum ke-load) = baris
 *    dipertahankan dari snapshot; verifikasi stok tetap di server saat
 *    checkout.
 */
export function clampPendingCart(
  cart: PendingCart,
  products: PendingCartProduct[]
): { items: PendingCartLine[]; dropped: number } {
  const byId = new Map<number, PendingCartProduct>();
  for (const p of products) {
    if (p && typeof p.id === 'number') byId.set(p.id, p);
  }
  const items: PendingCartLine[] = [];
  let dropped = 0;
  for (const l of cart.items) {
    const known = byId.get(l.product.id);
    if (byId.size > 0 && !known) {
      dropped++;
      continue;
    }
    const qpb =
      l.qtyPerBase && Number.isFinite(l.qtyPerBase) && l.qtyPerBase > 0 ? l.qtyPerBase : 1;
    let qty = Math.max(0, Math.floor(l.qty));
    if (known) {
      if (known.is_consignment !== 1) {
        qty = Math.min(qty, Math.floor((known.stock + STOCK_EPS) / qpb));
      }
      if (qty <= 0) {
        dropped++;
        continue;
      }
      items.push({
        product: known,
        qty,
        price: l.price,
        manual: l.manual,
        unitName: l.unitName,
        qtyPerBase: qpb !== 1 ? qpb : undefined,
      });
    } else {
      // Katalog belum ke-load: pakai snapshot tersimpan.
      items.push({ ...l, qty, qtyPerBase: qpb !== 1 ? qpb : undefined });
    }
  }
  return { items, dropped };
}

/**
 * Label umur pending cart komunikatif ("baru saja" / "N mnt lalu" /
 * "N jam lalu" / "N hari lalu") -- satu bahasa keluarga confidence.
 * Pure: nowMs parameter eksplisit utk test (default = sekarang).
 * Stempel tak valid = "waktu tak diketahui" (jujur, tak pura-pura segar).
 */
export function pendingCartAgeLabel(ts: string, nowMs: number = Date.now()): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return 'waktu tak diketahui';
  const mins = Math.max(0, Math.floor((nowMs - t) / 60_000));
  if (mins < 1) return 'baru saja';
  if (mins < 60) return mins + ' mnt lalu';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' jam lalu';
  const days = Math.floor(hrs / 24);
  return days + ' hari lalu';
}

