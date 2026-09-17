import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isManager(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const d = await db();
  const rows = (
    await d
      .prepare(`SELECT ${COLS} FROM consignments ORDER BY (status = 'active') DESC, created_at DESC LIMIT 500`)
      .all()
  ) as Row[];
  const items = rows.map(computed);
  const act = items.filter((i) => i.status === 'active');
  return NextResponse.json({
    consignments: items,
    totals: {
      active: act.length,
      unpaid: act.reduce((a, i) => a + i.unpaid, 0),
      remaining: act.reduce((a, i) => a + i.remaining, 0),
    },
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
            if (b.action === 'sell')
              await d
                .prepare('UPDATE consignments SET qty_sold = qty_sold + ? WHERE id = ?')
                .run(n, id);
            else
              await d
                .prepare('UPDATE consignments SET qty_returned = qty_returned + ? WHERE id = ?')
                .run(n, id);
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
            await d
              .prepare('UPDATE consignments SET amount_paid = amount_paid + ? WHERE id = ?')
              .run(amount, id);
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