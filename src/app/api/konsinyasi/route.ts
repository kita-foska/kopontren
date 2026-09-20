import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';
import { notifyNewKonsinyasi } from '@/lib/notify';

type Row = {
  id: number;
  owner: string;
  owner_phone: string;
  item_name: string;
  unit: string;
  qty_received: number;
  agree_price: number;
  qty_sold: number;
  qty_returned: number;
  amount_paid: number;
  status: string;
  note: string;
  created_at: string;
  settled_at: string | null;
};

const COLS =
  'id, owner, owner_phone, item_name, unit, qty_received, agree_price, qty_sold, qty_returned, amount_paid, status, note, created_at, settled_at';

/** Add derived fields: sisa barang, tagihan pemilik, dan selisih belum dibayar. */
function computed(r: Row) {
  const remaining = r.qty_received - r.qty_sold - r.qty_returned;
  const payable = r.qty_sold * r.agree_price;
  return { ...r, remaining, payable, unpaid: payable - r.amount_paid };
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const url = new URL(req.url);
  // 50 baris/halaman + ?offset= (dulu LIMIT 500 tanpa paging — sekarang
  // klien menambah "Muat lebih banyak").
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const d = await db();
  const rows = (
    await d
      .prepare(`SELECT ${COLS} FROM consignments ORDER BY (status = 'active') DESC, created_at DESC LIMIT ? OFFSET ?`)
      .all(limit, offset)
  ) as Row[];
  const items = rows.map(computed);
  // Ringkasan dari agregat atas baris ACTIVE (bukan dari halaman yang
  // dipaging) agar tetap akurat meski list dibatasi 50 baris.
  const actAgg = (await d
    .prepare(
      `SELECT COUNT(*) c,
              COALESCE(SUM(qty_received - qty_sold - qty_returned), 0) r,
              COALESCE(SUM(qty_sold * agree_price - amount_paid), 0) u
       FROM consignments WHERE status = 'active'`
    )
    .get()) as { c: number; r: number; u: number };
  return NextResponse.json({
    consignments: items,
    totals: {
      active: actAgg.c,
      unpaid: actAgg.u,
      remaining: actAgg.r,
    },
    limit,
    offset,
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: number;
    qty?: number;
    amount?: number;
    owner?: string;
    owner_phone?: string;
    item_name?: string;
    unit?: string;
    agree_price?: number;
    note?: string;
  };
  const d = await db();
  const now = new Date().toISOString();
  try {
    switch (b.action) {
      case 'create': {
        const owner = String(b.owner || '').trim();
        const item = String(b.item_name || '').trim();
        const qty = Math.floor(Number(b.qty) || 0);
        const price = Math.floor(Number(b.agree_price) || 0);
        if (!owner || !item || qty <= 0)
          return NextResponse.json(
            { error: 'Pemilik, barang & jumlah wajib diisi' },
            { status: 400 }
          );
        const out = (await tx(d, async () => {
          const r = await d
            .prepare(
              `INSERT INTO consignments (owner, owner_phone, item_name, unit, qty_received, agree_price, note)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              owner,
              String(b.owner_phone || '').trim(),
              item,
              String(b.unit || '').trim() || 'pcs',
              qty,
              price,
              String(b.note || '').trim()
            );
          return Number(r.lastInsertRowid);
        })) as number;
        await logAudit(user, 'konsinyasi:create', 'consignments', out, undefined, {
          owner,
          item,
          qty,
          agree_price: price,
        });
        try {
          await notifyNewKonsinyasi(owner, item, qty);
        } catch (e) {
          console.warn('[notify] pemicu konsinyasi gagal:', e);
        }
        return NextResponse.json({ ok: true, id: out });
      }
      case 'sell':
      case 'return':
      case 'pay':
      case 'close':
      case 'reopen': {
        const id = Number(b.id) || 0;
        if (!id) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });
        const out = await tx(d, async () => {
          const row = (
            await d.prepare(`SELECT ${COLS} FROM consignments WHERE id = ?`).get(id)
          ) as Row | undefined;
          if (!row) throw new Error('Data tidak ditemukan');
          if (b.action === 'sell' || b.action === 'return') {
            if (row.status !== 'active') throw new Error('Data sudah ditutup');
            const n = Math.floor(Number(b.qty) || 0);
            if (n <= 0) throw new Error('Jumlah minimal 1');
            const remaining = row.qty_received - row.qty_sold - row.qty_returned;
            if (n > remaining)
              throw new Error('Jumlah melebihi sisa (' + remaining + ' ' + row.unit + ')');
            // Guarded update: validasi ATOMIK di level SQL (menutup race
            // double-submit / 2 request paralel menembus sisa barang).
            const guard =
              b.action === 'sell'
                ? await d
                    .prepare(
                      `UPDATE consignments SET qty_sold = qty_sold + ?
                       WHERE id = ? AND status = 'active' AND qty_sold + ? <= qty_received`
                    )
                    .run(n, id, n)
                : await d
                    .prepare(
                      `UPDATE consignments SET qty_returned = qty_returned + ?
                       WHERE id = ? AND status = 'active' AND qty_sold + qty_returned + ? <= qty_received`
                    )
                    .run(n, id, n);
            if (Number(guard.changes) !== 1)
              throw new Error('Jumlah melebihi sisa (data berubah — muat ulang)');
            const c = computed({
              ...row,
              qty_sold: b.action === 'sell' ? row.qty_sold + n : row.qty_sold,
              qty_returned: b.action === 'return' ? row.qty_returned + n : row.qty_returned,
            });
            return { ok: true, remaining: c.remaining, unpaid: c.unpaid };
          }
          if (b.action === 'pay') {
            if (row.status !== 'active') throw new Error('Data sudah ditutup');
            const amount = Math.floor(Number(b.amount) || 0);
            if (amount <= 0) throw new Error('Nominal minimal 1');
            const unpaid = row.qty_sold * row.agree_price - row.amount_paid;
            if (amount > unpaid)
              throw new Error('Nominal melebihi tagihan (Rp ' + unpaid.toLocaleString('id-ID') + ')');
            // Guarded update: cegah overpay (amount_paid > tagihan) akibat
            // double-submit / 2 request paralel.
            const payRes = await d
              .prepare(
                `UPDATE consignments SET amount_paid = amount_paid + ?
                 WHERE id = ? AND status = 'active' AND amount_paid + ? <= qty_sold * agree_price`
              )
              .run(amount, id, amount);
            if (Number(payRes.changes) !== 1)
              throw new Error('Nominal melebihi tagihan (data berubah — muat ulang)');
            // uang keluar kas untuk pemilik -> tercatat di pembukuan kas
            await d
              .prepare(
                'INSERT INTO cash_entries (type, label, amount, note, created_by) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                'expense',
                'Kon. ' + row.owner + ' - ' + row.item_name,
                amount,
                'Pembayaran konsinyasi #' + id,
                user.id
              );
            // Uang keluar kas -> saldo kas & agregat laporan basi (cache).
            invalidate('kas:');
            invalidate('reports:');
            return {
              ok: true,
              unpaid: row.qty_sold * row.agree_price - (row.amount_paid + amount),
            };
          }
          if (b.action === 'close') {
            if (row.status !== 'active') throw new Error('Data sudah ditutup');
            const c = computed(row);
            if (c.remaining > 0)
              throw new Error('Masih ada sisa ' + c.remaining + ' ' + row.unit + ' - kembalikan dulu');
            if (c.unpaid > 0)
              throw new Error(
                'Masih ada tagihan Rp ' + c.unpaid.toLocaleString('id-ID') + ' - bayar dulu'
              );
            await d
              .prepare(`UPDATE consignments SET status = 'settled', settled_at = ? WHERE id = ?`)
              .run(now, id);
            return { ok: true };
          }
          // reopen
          if (row.status !== 'settled') throw new Error('Data masih aktif');
          await d
            .prepare(`UPDATE consignments SET status = 'active', settled_at = NULL WHERE id = ?`)
            .run(id);
          return { ok: true };
        });
        await logAudit(user, 'konsinyasi:' + b.action, 'consignments', b.id ?? null, undefined, {
          qty: b.qty,
          amount: b.amount,
        });
        return NextResponse.json(out as object);
      }
      default:
        return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gagal memproses' },
      { status: 400 }
    );
  }
}