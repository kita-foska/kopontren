import { NextResponse } from 'next/server';
import { db, tx, getMemberSettings } from '@/db';
import { canAccess, currentUser, isManager } from '@/lib/auth';
import { startOfDayJakarta } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';
import { notifyLargeTransaction, notifyMarginClamp, notifyStockAfterSale } from '@/lib/notify';
import { computePerks, marginGuard, parsePerkConfig, type PerkResult } from '@/lib/perks';
import { parsePaySplit } from '@/lib/pay-methods';

type SaleRow = {
  id: number;
  kasir_id: number | null;
  customer: string;
  pay_method: string;
  status: string;
  total: number;
  member_id: number | null;
  amount_paid: number;
  change: number;
  discount: number;
  member_points: number;
  created_at: string;
  pay_split?: string | null;
};

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  // Pembacaan transaksi: tier laporan (admin, manajer, pengurus) atau POS
  // (admin, manajer, kasir utk retur/rekap). Peran lain ditolak.
  if (!canAccess(user, 'laporan') && !canAccess(user, 'pos'))
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') || '0');
  const status = url.searchParams.get('status') || 'all';
  // Pagination: default & maksimal 50 (target Turso Rows Read < 3.000),
  // klien boleh paging dengan ?offset=.
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const d = await db();
  let from: string | null = null;
  if (days > 0) from = startOfDayJakarta(1 - days);
  const where = [from !== null ? 'created_at >= ?' : '1=1'];
  const args: (string | number)[] = from ? [from] : [];
  if (status !== 'all') {
    where.push('status = ?');
    args.push(status);
  }
  // Total baris (COUNT tanpa limit/offset, WHERE sama persis) — dipakai
  // klien Laporan utk notifikasi "Menampilkan X dari N transaksi" supaya
  // pagination tidak disembunyikan dari user.
  const total = (
    (await d
      .prepare(`SELECT COUNT(*) c FROM sales WHERE ${where.join(' AND ')}`)
      .get(...args)) as { c: number }
  ).c;
  args.push(limit, offset);
  const rows = (
    (await d
      .prepare(
        `SELECT * FROM sales WHERE ${where.join(
          ' AND '
        )} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...args)) as SaleRow[]
  );
  // Batch N+1: dulu 3 query per baris (kasir, member, items) = 3×N round-trip.
  // Sekarang 3 query total dengan IN (...) terlepas dari jumlah baris.
  const ph = (n: number) => Array(n).fill('?').join(', ');
  const kasirIds = [...new Set(rows.map((r) => r.kasir_id).filter((v): v is number => !!v))];
  const memberIds = [...new Set(rows.map((r) => r.member_id).filter((v): v is number => !!v))];
  const saleIds = rows.map((r) => r.id);
  const [kasirRows, memberRows, itemRows] = await Promise.all([
    kasirIds.length
      ? d.prepare(`SELECT id, username, display_name FROM users WHERE id IN (${ph(kasirIds.length)})`).all(
          ...kasirIds
        )
      : Promise.resolve([]),
    memberIds.length
      ? d
          .prepare(`SELECT id, name, phone, points FROM members WHERE id IN (${ph(memberIds.length)})`)
          .all(...memberIds)
      : Promise.resolve([]),
    saleIds.length
      ? d
          .prepare(
            `SELECT sale_id, product_name, qty, unit, unit_price, subtotal, discount
             FROM sale_items WHERE sale_id IN (${ph(saleIds.length)}) ORDER BY sale_id, id`
          )
          .all(...saleIds)
      : Promise.resolve([]),
  ]);
  const kasirMap = new Map<number, { username: string; display_name: string }>();
  for (const u of kasirRows as { id: number; username: string; display_name: string }[])
    kasirMap.set(u.id, u);
  const memberMap = new Map<number, { name: string; phone: string; points: number }>();
  for (const m of memberRows as { id: number; name: string; phone: string; points: number }[])
    memberMap.set(m.id, m);
  type SaleItem = {
    product_name: string;
    qty: number;
    unit: string;
    unit_price: number;
    subtotal: number;
    discount: number;
  };
  const itemsMap = new Map<number, SaleItem[]>();
  for (const it of itemRows as (SaleItem & { sale_id: number })[]) {
    const arr = itemsMap.get(it.sale_id) || [];
    arr.push(it);
    itemsMap.set(it.sale_id, arr);
  }
  const sales = rows.map((r) => {
    const kasir = r.kasir_id ? kasirMap.get(r.kasir_id) : undefined;
    const member = r.member_id ? memberMap.get(r.member_id) : undefined;
    return {
      ...r,
      kasir_name: kasir ? kasir.display_name || kasir.username : '',
      member_name: member?.name || '',
      member_phone: member?.phone || '',
      items: itemsMap.get(r.id) || [],
    };
  });
  return NextResponse.json({ sales, total, limit, offset });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  // Tier: POS (admin, manajer, kasir). Pengurus/pembelian/gudang/member tidak boleh.
  if (!canAccess(user, 'pos'))
    return NextResponse.json({ error: 'Role Anda tidak dapat melakukan transaksi POS' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    customer?: string;
    pay_method?: string;
    pay_split?: { m: string; a: number }[];
    note?: string;
    member_id?: number;
    amount_paid?: number;
    change?: number;
    discount?: number;
    redeem?: number;
    client_ref?: string;
    items?: { product_id: number; qty: number; unit_price?: number; discount?: number }[];
  };
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length === 0)
    return NextResponse.json({ error: 'Keranjang kosong' }, { status: 400 });
  let method = ['cash', 'tf', 'wa'].includes(String(b.pay_method)) ? String(b.pay_method) : 'cash';
  // Split pembayaran (fitur 3): whitelist metode {cash, tf, wa} & nominal
  // bulat > 0 per bagian; aturan Σa === total diverifikasi di dalam
  // transaksi (setelah total final, termasuk perk member).
  const splitIn: { m: string; a: number }[] = [];
  if (Array.isArray(b.pay_split)) {
    for (const p of b.pay_split) {
      const m = String((p as { m?: unknown })?.m ?? '');
      if (m !== 'cash' && m !== 'tf' && m !== 'wa')
        return NextResponse.json({ error: 'Metode pembayaran campur tidak dikenal' }, { status: 400 });
      const a = Math.floor(Number((p as { a?: unknown })?.a) || 0);
      if (a > 0) splitIn.push({ m, a });
    }
    if (splitIn.length === 0)
      return NextResponse.json({ error: 'Nominal pembayaran campur tidak valid' }, { status: 400 });
  }
  const manager = isManager(user);
  const clientRef = String(b.client_ref || '').trim().slice(0, 64);

  const d = await db();
  // Idempotensi offline-queue: transaksi POS offline memakai client_ref
  // (UUID sisi klien). Retry sinkronisasi mengembalikan sale yang sudah
  // ada tanpa duplikat stok/kas/loyalty.
  if (clientRef) {
    const dup = (await d
      .prepare(
        `SELECT s.id, s.total, s.status, s.created_at, s.member_points points, s.cashback, s.redeem, s.member_id, s.pay_split,
                m.name member_name
         FROM sales s LEFT JOIN members m ON m.id = s.member_id
         WHERE s.client_ref = ?`
      )
      .get(clientRef)) as
      | {
          id: number;
          total: number;
          status: string;
          created_at: string;
          points: number;
          cashback: number;
          redeem: number;
          member_id: number | null;
          pay_split?: string | null;
          member_name?: string;
        }
      | undefined;
    if (dup) {
      invalidate('members:');
      invalidate('products:');
      invalidate('kas:');
      invalidate('reports:');
      return NextResponse.json({
        ok: true,
        deduped: true,
        sale: {
          id: dup.id,
          total: dup.total,
          status: dup.status,
          created_at: dup.created_at,
          points: dup.points,
          cashback: dup.cashback,
          redeem: dup.redeem,
          pay_split: parsePaySplit(dup.pay_split),
          member_name: dup.member_name || '',
        },
      });
    }
  }
  try {
    const out = await tx(d, async () => {
      let subtotal = 0;
      let totalCost = 0;
      let lineDiscSum = 0;
      const prodStmt = d.prepare('SELECT * FROM products WHERE id = ?');
      // Guarded decrement: update HANYA jalan bila stok masih cukup saat
      // statement dieksekusi (menutup race window oversell antar transaksi
      // paralel). Cek di loop bawah tetap sebagai guard UX cepat.
      const decStmt = d.prepare(
        'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?'
      );
      // [qty, name, pid, unit, price, sub, lineDisc, cost]
      const insertItems: [number, string, number, string, number, number, number, number][] = [];
      for (const it of items) {
        const qty = Math.max(1, Math.floor(Number(it.qty) || 0));
        const prod = (await prodStmt.get(Number(it.product_id))) as
          | {
              id: number;
              name: string;
              unit: string;
              base_price: number;
              cost_price: number;
              stock: number;
              active: number;
            }
          | undefined;
        if (!prod || prod.active !== 1)
          throw new Error('Produk tidak tersedia: ' + (prod?.name || it.product_id));
        if (prod.stock < qty)
          throw new Error('Stok ' + prod.name + ' tidak cukup (sisa ' + prod.stock + ')');
        // Manager may override the price per line; only accept a finite
        // positive value, anything else falls back to the catalog price
        // (kasir: always base price). Prevents negative/NaN manipulation.
        const override = Number(it.unit_price);
        const price =
          manager && Number.isFinite(override) && override > 0
            ? Math.floor(override)
            : prod.base_price;
        const sub = price * qty;
        subtotal += sub;
        totalCost += (prod.cost_price || 0) * qty;
        // Per-line discount: manager only, capped at the line total.
        let lineDisc = 0;
        if (manager) {
          const dv = Number(it.discount);
          if (Number.isFinite(dv) && dv > 0) lineDisc = Math.min(Math.floor(dv), sub);
        }
        lineDiscSum += lineDisc;
        const decRes = await decStmt.run(qty, prod.id, qty);
        if (Number(decRes.changes) !== 1)
          throw new Error(
            'Stok ' + prod.name + ' tidak cukup (stok berubah — sisa ' + prod.stock + ')'
          );
        const insertItemsRow: [number, string, number, string, number, number, number, number] = [
          qty,
          prod.name,
          prod.id,
          prod.unit,
          price,
          sub,
          lineDisc,
          prod.cost_price || 0,
        ];
        insertItems.push(insertItemsRow);
      }
      if (subtotal <= 0) throw new Error('Total transaksi tidak valid');
      // Transaction-level discount: manager only, capped at the subtotal.
      let txDisc = 0;
      if (manager) {
        const tv = Number(b.discount);
        if (Number.isFinite(tv) && tv > 0) txDisc = Math.min(Math.floor(tv), subtotal);
      }
      const prePerk = subtotal - lineDiscSum - txDisc;
      if (prePerk <= 0)
        throw new Error('Total setelah diskon tidak valid (diskon melebihi total)');

      // PENJAGA MARGIN (anti rugi): margin kotor produk = subtotal − HPP.
      // Keluaran perk otomatis (diskon member + redeem + cashback) dibatasi
      // oleh margin tersebut (setelah dikurangi diskon manual) oleh
      // computePerks; bila terpotong / diskon manual menembus margin,
      // dicatat di audit + notifikasi admin. Penjualan TIDAK diblokir.
      const margin = marginGuard(subtotal, totalCost, lineDiscSum, txDisc);

      // Member link + loyalty perks (diskon member/ulang tahun, cashback,
      // poin, auto-tier, redeem). Semua perk dihitung di modul murni
      // src/lib/perks.ts — rumus SAMA dengan preview POS, server tetap
      // sumber kebenaran. Nilai tiap setting berasal dari pengaturan
      // member (/admin/pengaturan-member, cache 60 dtk).
      let total = prePerk;
      let memberId: number | null = null;
      let points = 0;
      let memberName = '';
      let memberDiscount = 0;
      let cashback = 0;
      let tier = '';
      let redeem = 0;
      let redeemPoints = 0;
      let redeemCash = 0;
      let redeemPtsValue = 0;
      let perk: PerkResult | null = null;
      if (b.member_id && Number(b.member_id) > 0) {
        const mrow = (await d
          .prepare(
            'SELECT id, name, birth_date, total_spent, points, cashback_balance FROM members WHERE id = ?'
          )
          .get(Number(b.member_id))) as
          | {
              id: number;
              name: string;
              birth_date: string;
              total_spent: number;
              points: number;
              cashback_balance: number;
            }
          | undefined;
        if (!mrow) throw new Error('Member tidak ditemukan');
        memberId = mrow.id;
        memberName = mrow.name;
        const mset = await getMemberSettings();
        // Cek ulang tahun: match MM-DD birth_date vs hari ini (zona Jakarta
        // karena server Vercel UTC) — bila aktif, promo ultah memakai nilai
        // MAKS(birthday_discount, diskon base) di dalam computePerks.
        const jktDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })
          .format(new Date())
          .slice(5);
        const isBday = mrow.birth_date?.length === 10 && mrow.birth_date.slice(5) === jktDay;
        perk = computePerks(parsePerkConfig(mset), {
          subtotal,
          totalCost,
          lineDisc: lineDiscSum,
          txDisc,
          isBday,
          memberPoints: Number(mrow.points) || 0,
          memberCashbackBalance: Number(mrow.cashback_balance) || 0,
          memberTotalSpent: Number(mrow.total_spent) || 0,
          redeemRequested: Math.floor(Number(b.redeem) || 0),
        });
        total = perk.total;
        points = perk.points;
        memberDiscount = perk.memberDiscount;
        cashback = perk.cashback;
        tier = perk.tier;
        redeem = perk.redeem;
        redeemPoints = perk.redeemPoints;
        redeemCash = perk.redeemCash;
        redeemPtsValue = perk.redeemPtsValue;
      }
      const customer = String(b.customer || '').trim() || memberName;
      // Split penuh (fitur 3, tanpa piutang): Σa harus sama dengan total
      // final (setelah perk member); metode dominan (bagian terbesar)
      // ditulis ke kolom pay_method legacy; tanpa kembalian
      // (amount_paid = total, change = 0).
      let paySplitParts: { m: string; a: number }[] = [];
      let paySplitJson: string | null = null;
      if (splitIn.length > 0) {
        const splitSum = splitIn.reduce((s, x) => s + x.a, 0);
        if (splitSum !== total)
          throw new Error(
            'Pembayaran campur belum lunas — input Rp ' +
              splitSum.toLocaleString('id-ID') +
              ', total Rp ' +
              total.toLocaleString('id-ID')
          );
        const dom = splitIn.reduce((x, y) => (y.a > x.a ? y : x));
        method = dom.m;
        paySplitParts = splitIn;
        paySplitJson = JSON.stringify(splitIn.map((x) => ({ m: x.m, a: x.a })));
      }
      const amount_paid =
        paySplitParts.length > 0 ? total : Math.max(0, Math.floor(Number(b.amount_paid) || 0));
      const change = paySplitParts.length > 0 ? 0 : Math.max(0, Math.floor(Number(b.change) || 0));

      const created_at = new Date().toISOString();
      const sale = await d
        .prepare(
          `INSERT INTO sales (kasir_id, customer, pay_method, status, note, total,
                              member_id, amount_paid, change, discount, member_discount,
                              member_points, cashback, redeem, pay_split, created_at, client_ref)
           VALUES (?, ?, ?, 'unreported', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          user.id,
          customer,
          method,
          String(b.note || '').trim(),
          total,
          memberId,
          amount_paid,
          change,
          lineDiscSum + txDisc,
          memberDiscount,
          points,
          cashback,
          redeem,
          paySplitJson,
          created_at,
          clientRef
        );
      const sid = Number(sale.lastInsertRowid);
      const insItem = d.prepare(
        `INSERT INTO sale_items (sale_id, product_id, product_name, qty, unit, unit_price, subtotal, discount, cost_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const [qty, name, pid, unit, price, sub, lineDisc, cost] of insertItems) {
        await insItem.run(sid, pid, name, qty, unit, price, sub, lineDisc, cost);
      }
      if (memberId) {
        if (redeem > 0) {
          // Guard anti-race: balance harus masih cukup saat UPDATE
          // berjalan, bukan saat SELECT di atas — mencegah oversell
          // poin/saldo bila dua transaksi paralel memakai member sama.
          const guard = (await d
            .prepare(
              'SELECT points, cashback_balance FROM members WHERE id = ? AND points >= ? AND cashback_balance >= ?'
            )
            .get(memberId, redeemPoints, redeemCash)) as {
            points: number;
            cashback_balance: number;
          } | undefined;
          if (!guard)
            throw new Error('Poin/saldo member tidak mencukupi untuk redemsi');
        }
        await d
          .prepare(
            `UPDATE members SET points = MAX(points + ? - ?, 0), total_spent = total_spent + ?,
             tier = ?, cashback_balance = MAX(cashback_balance + ? - ?, 0) WHERE id = ?`
          )
          .run(points, redeemPoints, total, tier, cashback, redeemCash, memberId);
        // Jejak ledger poin (dulu tabel point_history tidak pernah tertulis).
        if (points > 0) {
          await d
            .prepare(
              `INSERT INTO point_history (member_id, delta, reason, amount, sale_id)
               VALUES (?, ?, 'earn', ?, ?)`
            )
            .run(memberId, points, total, sid);
        }
        // Jejak ledger cashback: tabel sama, reason 'cashback' — saldo
        // members.cashback_balance kini tertulis & terlacak.
        if (cashback > 0) {
          await d
            .prepare(
              `INSERT INTO point_history (member_id, delta, reason, amount, sale_id)
               VALUES (?, ?, 'cashback', ?, ?)`
            )
            .run(memberId, cashback, total, sid);
        }
        // Jejak ledger redemsi: bagian poin (reason 'redeem') & bagian
        // cashback (reason 'cashback_use') sebagai delta NEGATIF, agar
        // DELETE transaksi bisa membalikkan saldo secara presisi.
        if (redeemPoints > 0) {
          await d
            .prepare(
              `INSERT INTO point_history (member_id, delta, reason, amount, sale_id)
               VALUES (?, ?, 'redeem', ?, ?)`
            )
            .run(memberId, -redeemPoints, redeemPtsValue, sid);
        }
        if (redeemCash > 0) {
          await d
            .prepare(
              `INSERT INTO point_history (member_id, delta, reason, amount, sale_id)
               VALUES (?, ?, 'cashback_use', ?, ?)`
            )
            .run(memberId, -redeemCash, redeemCash, sid);
        }
      }
      return {
        id: sid,
        total,
        status: 'unreported',
        created_at,
        points,
        member_discount: memberDiscount,
        cashback,
        redeem,
        tier,
        member_name: memberName,
        customer,
        pay_split: paySplitParts.length > 0 ? paySplitParts : undefined,
        product_ids: insertItems.map((x) => x[2]),
        // Diagnostik penjaga margin (dipakai audit/notifikasi/POS utk
        // menampilkan seberapa banyak perk terpotong & apakah diskon
        // manual menembus margin).
        margin: {
          gross_margin: margin.grossMargin,
          cap: margin.cap,
          manual_outflow: margin.manualOutflow,
          manual_over_margin: margin.manualOverMargin,
          perk_raw_total: perk?.perkRawTotal ?? 0,
          perk_total: perk?.perkTotal ?? 0,
          clamped: perk?.clamped ?? false,
          clamped_amount: perk?.clampedAmount ?? 0,
        },
      };
    });
    await logAudit(user, 'sales:create', 'sales', Number(out.id), undefined, {
      total: out.total,
      member_name: out.member_name || undefined,
      points: out.points,
      pay_split: out.pay_split ?? undefined,
    }, req);
    // PENJAGA MARGIN: bila perk otomatis terpotong oleh margin kotor, atau
    // keluaran manual (diskon) sudah melewati margin -> log khusus +
    // peringatan admin. Penjualan tetap tercatat (keputusan "soft").
    if (out.margin.clamped || out.margin.manual_over_margin) {
      await logAudit(
        user,
        out.margin.clamped ? 'sales:margin_clamped' : 'sales:manual_over_margin',
        'sales',
        Number(out.id),
        undefined,
        {
          total: out.total,
          member_name: out.member_name || undefined,
          gross_margin: out.margin.gross_margin,
          cap: out.margin.cap,
          perk_raw_total: out.margin.perk_raw_total,
          perk_total: out.margin.perk_total,
          clamped_amount: out.margin.clamped_amount,
          manual_outflow: out.margin.manual_outflow,
        },
        req
      );
    }
    // Transaksi mengubah stok, poin member, saldo kas & agregat laporan
    // -> buang cache agar pembacaan berikutnya segar.
    invalidate('members:');
    invalidate('products:');
    invalidate('kas:');
    invalidate('reports:');
    // Notifikasi admin (best-effort, tidak memblokir/merollback penjualan).
    try {
      await notifyLargeTransaction(out.total, out.id, out.customer, method);
      await notifyStockAfterSale(out.product_ids);
      if (out.margin.clamped || out.margin.manual_over_margin)
        await notifyMarginClamp({
          saleId: out.id,
          total: out.total,
          customer: out.customer,
          grossMargin: out.margin.gross_margin,
          clamped: out.margin.clamped,
          clampedAmount: out.margin.clamped_amount,
          manualOverMargin: out.margin.manual_over_margin,
          manualOutflow: out.margin.manual_outflow,
        });
    } catch (e) {
      console.warn('[notify] pemicu penjualan gagal:', e);
    }
    return NextResponse.json({ ok: true, sale: out });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gagal menyimpan transaksi' },
      { status: 400 }
    );
  }
}
