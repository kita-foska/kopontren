import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';

type Backup = {
  version: number;
  exported_at: string;
  products?: unknown[];
  sales?: unknown[];
  sale_items?: unknown[];
  purchases?: unknown[];
  expenses?: unknown[];
  cash_entries?: unknown[];
  consignments?: unknown[];
  members?: unknown[];
  shifts?: unknown[];
  audit_log?: unknown[];
};

/**
 * Normalize imported timestamps to ISO UTC ('YYYY-MM-DDTHH:MM:SS.sssZ') so
 * string comparisons against startOfDayJakarta() stay consistent. Old local
 * apps (and old DBs) store 'YYYY-MM-DD HH:MM:SS' (UTC, space-separated).
 */
function normTs(v: unknown, fallback?: string): string {
  const s = String(v ?? '').trim();
  if (!s) return fallback ?? '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    const d = new Date(s.replace(' ', 'T') + 'Z');
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return s;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });
  const d = await db();
  const all = async (q: string) => await d.prepare(q).all();
  const payload: Backup = {
    version: 2,
    exported_at: new Date().toISOString(),
    products: await all(
      'SELECT id, name, category, unit, base_price, cost_price, stock, active, barcode FROM products'
    ),
    sales: await all(
      `SELECT id, kasir_id, customer, pay_method, status, note, total,
              member_id, amount_paid, change, discount, member_points, created_at, reported_at
       FROM sales`
    ),
    sale_items: await all(
      'SELECT id, sale_id, product_id, product_name, qty, unit, unit_price, subtotal, discount, cost_price FROM sale_items'
    ),
    purchases: await all('SELECT * FROM purchases'),
    expenses: await all('SELECT * FROM expenses'),
    cash_entries: await all('SELECT * FROM cash_entries'),
    consignments: await all(
      'SELECT id, owner, owner_phone, item_name, unit, qty_received, agree_price, qty_sold, qty_returned, amount_paid, status, note, created_at, settled_at FROM consignments'
    ),
    members: await all('SELECT * FROM members'),
    shifts: await all('SELECT * FROM shifts'),
    audit_log: await all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 5000'),
  };
  await logAudit(user, 'backup:export', 'database', null, undefined, {
    products: (payload.products as unknown[] | undefined)?.length ?? 0,
    sales: (payload.sales as unknown[] | undefined)?.length ?? 0,
  });
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="kopontren-backup-' +
        new Date().toISOString().slice(0, 10) +
        '.json"',
    },
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  let payload: Backup;
  try {
    payload = (await req.json()) as Backup;
  } catch {
    return NextResponse.json({ error: 'File backup tidak valid (JSON rusak)' }, { status: 400 });
  }
  if (!payload || Array.isArray(payload.products) === false) {
    return NextResponse.json({ error: 'Format backup tidak dikenali' }, { status: 400 });
  }
  const d = await db();
  try {
    await tx(d, async () => {
      await d.exec(
        'DELETE FROM sale_items; DELETE FROM sales; DELETE FROM purchases; DELETE FROM expenses; DELETE FROM cash_entries; DELETE FROM products; DELETE FROM consignments; DELETE FROM members; DELETE FROM shifts;'
      );
      const insP = d.prepare(
        'INSERT INTO products (id, name, category, unit, base_price, cost_price, stock, active, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const p of payload.products as Record<string, unknown>[]) {
        await insP.run(
          Number(p.id),
          String(p.name ?? ''),
          String(p.category ?? ''),
          String(p.unit ?? '') || 'pcs',
          Number(p.base_price) || 0,
          Number(p.cost_price) || 0,
          Number(p.stock) || 0,
          p.active ? 1 : 0,
          String(p.barcode ?? '')
        );
      }
      const insS = d.prepare(
        `INSERT INTO sales (id, kasir_id, customer, pay_method, status, note, total,
                            member_id, amount_paid, change, discount, member_points, created_at, reported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const s of (payload.sales as Record<string, unknown>[]) || []) {
        await insS.run(
          Number(s.id),
          s.kasir_id != null ? Number(s.kasir_id) : null,
          String(s.customer ?? ''),
          String(s.pay_method ?? '') || 'cash',
          String(s.status ?? '') || 'unreported',
          String(s.note ?? ''),
          Number(s.total) || 0,
          s.member_id != null ? Number(s.member_id) : null,
          Number(s.amount_paid) || 0,
          Number(s.change) || 0,
          Number(s.discount) || 0,
          Number(s.member_points) || 0,
          normTs(s.created_at, new Date().toISOString()),
          s.reported_at != null ? normTs(s.reported_at) : null
        );
      }
      const insI = d.prepare(
        `INSERT INTO sale_items (id, sale_id, product_id, product_name, qty, unit, unit_price, subtotal, discount, cost_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const i of (payload.sale_items as Record<string, unknown>[]) || []) {
        await insI.run(
          Number(i.id),
          Number(i.sale_id),
          i.product_id != null ? Number(i.product_id) : null,
          String(i.product_name ?? ''),
          Number(i.qty) || 0,
          String(i.unit ?? '') || 'pcs',
          Number(i.unit_price) || 0,
          Number(i.subtotal) || 0,
          Number(i.discount) || 0,
          Number(i.cost_price) || 0
        );
      }
      const insX = d.prepare(
        'INSERT INTO purchases (id, product_id, product_name, qty, unit_cost, supplier, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const x of (payload.purchases as Record<string, unknown>[]) || []) {
        await insX.run(
          Number(x.id),
          x.product_id != null ? Number(x.product_id) : null,
          String(x.product_name ?? ''),
          Number(x.qty) || 0,
          Number(x.unit_cost) || 0,
          String(x.supplier ?? ''),
          String(x.note ?? ''),
          normTs(x.created_at, new Date().toISOString())
        );
      }
      const insE = d.prepare(
        'INSERT INTO expenses (id, name, category, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const x of (payload.expenses as Record<string, unknown>[]) || []) {
        await insE.run(
          Number(x.id),
          String(x.name ?? ''),
          String(x.category ?? ''),
          Number(x.amount) || 0,
          String(x.note ?? ''),
          normTs(x.created_at, new Date().toISOString())
        );
      }
      const insC = d.prepare(
        'INSERT INTO cash_entries (id, type, label, amount, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const x of (payload.cash_entries as Record<string, unknown>[]) || []) {
        await insC.run(
          Number(x.id),
          x.type === 'expense' ? 'expense' : 'income',
          String(x.label ?? ''),
          Number(x.amount) || 0,
          String(x.note ?? ''),
          x.created_by != null ? Number(x.created_by) : null,
          normTs(x.created_at, new Date().toISOString())
        );
      }
      const insK = d.prepare(
        'INSERT INTO consignments (id, owner, owner_phone, item_name, unit, qty_received, agree_price, qty_sold, qty_returned, amount_paid, status, note, created_at, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const k of (payload.consignments as Record<string, unknown>[]) || []) {
        await insK.run(
          Number(k.id),
          String(k.owner ?? ''),
          String(k.owner_phone ?? ''),
          String(k.item_name ?? ''),
          String(k.unit ?? '') || 'pcs',
          Number(k.qty_received) || 0,
          Number(k.agree_price) || 0,
          Number(k.qty_sold) || 0,
          Number(k.qty_returned) || 0,
          Number(k.amount_paid) || 0,
          String(k.status ?? '') || 'active',
          String(k.note ?? ''),
          normTs(k.created_at, new Date().toISOString()),
          k.settled_at != null ? normTs(k.settled_at) : null
        );
      }
      const insM = d.prepare(
        `INSERT INTO members (id, name, phone, address, points, total_spent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const m of (payload.members as Record<string, unknown>[]) || []) {
        await insM.run(
          Number(m.id),
          String(m.name ?? ''),
          String(m.phone ?? ''),
          String(m.address ?? ''),
          Number(m.points) || 0,
          Number(m.total_spent) || 0,
          normTs(m.created_at, new Date().toISOString())
        );
      }
      const insSh = d.prepare(
        `INSERT INTO shifts (id, kasir_id, label, status, start_time, end_time, sales_count, sales_total, cash_total, by_method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const sh of (payload.shifts as Record<string, unknown>[]) || []) {
        await insSh.run(
          Number(sh.id),
          Number(sh.kasir_id) || 0,
          String(sh.label ?? ''),
          String(sh.status ?? '') || 'open',
          normTs(sh.start_time, new Date().toISOString()),
          sh.end_time != null ? normTs(sh.end_time) : null,
          Number(sh.sales_count) || 0,
          Number(sh.sales_total) || 0,
          Number(sh.cash_total) || 0,
          String(sh.by_method ?? ''),
          normTs(sh.created_at, new Date().toISOString())
        );
      }
      const insA = d.prepare(
        `INSERT INTO audit_log (id, user_id, username, action, table_name, record_id, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const a of (payload.audit_log as Record<string, unknown>[]) || []) {
        await insA.run(
          Number(a.id),
          a.user_id != null ? Number(a.user_id) : null,
          String(a.username ?? ''),
          String(a.action ?? ''),
          String(a.table_name ?? ''),
          a.record_id != null ? Number(a.record_id) : null,
          a.old_value != null ? String(a.old_value) : null,
          a.new_value != null ? String(a.new_value) : null,
          normTs(a.created_at, new Date().toISOString())
        );
      }
    });
    await logAudit(user, 'backup:import', 'database', null, undefined, {
      products: (payload.products as unknown[] | undefined)?.length ?? 0,
      sales: (payload.sales as unknown[] | undefined)?.length ?? 0,
    });
    // Import backup mengganti seluruh data operasional -> buang SEMUA cache
    // referensi (prefiks kosong = seluruh store).
    invalidate('');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: 'Import gagal: ' + (e instanceof Error ? e.message : '') },
      { status: 500 }
    );
  }
}
