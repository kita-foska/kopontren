import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';
import { parsePaySplit } from '@/lib/pay-methods';

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
  debts?: unknown[];
  payables?: unknown[];
  returns?: unknown[];
  notification_settings?: unknown[];
  notification_logs?: unknown[];
  notifications?: unknown[];
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
    version: 4,
    exported_at: new Date().toISOString(),
    products: await all(
      'SELECT id, name, category, unit, base_price, cost_price, stock, active, barcode FROM products'
    ),
    sales: await all(
      `SELECT id, kasir_id, customer, pay_method, pay_split, status, note, total,
              member_id, amount_paid, change, discount, member_points, created_at, reported_at, client_ref
       FROM sales`
    ),
    sale_items: await all(
      'SELECT id, sale_id, product_id, product_name, qty, unit, unit_price, subtotal, discount, cost_price FROM sale_items'
    ),
    purchases: await all('SELECT * FROM purchases'),
    expenses: await all('SELECT * FROM expenses'),
    cash_entries: await all('SELECT * FROM cash_entries'),
    consignments: await all(
      'SELECT id, owner, owner_phone, item_name, unit, qty_received, agree_price, commission_rate, qty_sold, qty_returned, amount_paid, status, note, created_at, settled_at FROM consignments'
    ),
    members: await all('SELECT * FROM members'),
    shifts: await all('SELECT * FROM shifts'),
    debts: await all('SELECT * FROM debts'),
    payables: await all('SELECT * FROM payables'),
    returns: await all(
      'SELECT id, sale_id, product_id, qty, reason, amount, created_at FROM returns'
    ),
    notification_settings: await all('SELECT * FROM notification_settings'),
    notification_logs: await all('SELECT * FROM notification_logs'),
    notifications: await all('SELECT * FROM notifications'),
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
      // Urutan FK-safe: returns merujuk sales (hapus dulu); debts/payables
      // mandiri; settings kv DIKECUALIKAN (katalog & setelan toko tetap).
      // audit_log + notifikasi DIHAPUS SEBELUM re-INSERT karena insert
      // memakai ID eksplisit — tanpa clear, ID lama akan tabrakan PK
      // (UNIQUE fail).
      await d.exec(
        'DELETE FROM notification_logs; DELETE FROM notification_settings; DELETE FROM notifications; DELETE FROM returns; DELETE FROM sale_items; DELETE FROM sales; DELETE FROM purchases; DELETE FROM expenses; DELETE FROM cash_entries; DELETE FROM products; DELETE FROM consignments; DELETE FROM members; DELETE FROM shifts; DELETE FROM debts; DELETE FROM payables; DELETE FROM audit_log;'
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
        `INSERT INTO sales (id, kasir_id, customer, pay_method, pay_split, status, note, total,
                            member_id, amount_paid, change, discount, member_points, created_at, reported_at, client_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const s of (payload.sales as Record<string, unknown>[]) || []) {
        // Guard import pay_split (review Fitur 3 🟠): JSON harus well-formed,
        // metode whitelisted (parsePaySplit), Σ bagian === total baris.
        // Gagal validasi → null (baris jadi legacy pay_method) — JSON rusak
        // tidak boleh masuk, supaya json_each di sisi baca tidak pecah.
        const rowTotal = Number(s.total) || 0;
        let paySplitDb: string | null = null;
        if (typeof s.pay_split === 'string' && s.pay_split) {
          const parts = parsePaySplit(s.pay_split);
          const splitSum = parts.reduce((t, x) => t + x.a, 0);
          if (parts.length > 0 && splitSum === rowTotal) paySplitDb = JSON.stringify(parts);
        }
        // Integritas (Batch F): normalisasi sama persis dgn POST /api/sales —
        // split valid → total/0; selain itu amount_paid tidak boleh < total
        // (partial paid tidak masuk), dan change hanya di-rekompute utk cash.
        const payMethod = String(s.pay_method ?? '') || 'cash';
        const paidNorm = paySplitDb ? rowTotal : Math.max(rowTotal, Number(s.amount_paid) || 0);
        const changeNorm =
          paySplitDb || payMethod !== 'cash' ? 0 : paidNorm - rowTotal;
        await insS.run(
          Number(s.id),
          s.kasir_id != null ? Number(s.kasir_id) : null,
          String(s.customer ?? ''),
          payMethod,
          paySplitDb,
          String(s.status ?? '') || 'unreported',
          String(s.note ?? ''),
          rowTotal,
          s.member_id != null ? Number(s.member_id) : null,
          paidNorm,
          changeNorm,
          Number(s.discount) || 0,
          Number(s.member_points) || 0,
          normTs(s.created_at, new Date().toISOString()),
          s.reported_at != null ? normTs(s.reported_at) : null,
          String(s.client_ref ?? '')
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
        'INSERT INTO consignments (id, owner, owner_phone, item_name, unit, qty_received, agree_price, commission_rate, qty_sold, qty_returned, amount_paid, status, note, created_at, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
          // FASE P4: rate komisi (ju'alah); backup lama tanpa key -> 20.
          k.commission_rate != null
            ? Math.max(0, Math.min(100, Math.floor(Number(k.commission_rate))))
            : 20,
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
      // Retur (selesai di atas: sales + sale_items sudah terisi). ID eksplisit
      // dipertahankan agar relasi sale_id/product_id tetap konsisten.
      const insRet = d.prepare(
        'INSERT INTO returns (id, sale_id, product_id, qty, reason, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const r of (payload.returns as Record<string, unknown>[]) || []) {
        await insRet.run(
          Number(r.id),
          Number(r.sale_id),
          r.product_id != null ? Number(r.product_id) : null,
          Number(r.qty) || 0,
          String(r.reason ?? ''),
          Number(r.amount) || 0,
          normTs(r.created_at, new Date().toISOString())
        );
      }
      const insDebt = d.prepare(
        'INSERT INTO debts (id, customer_name, customer_phone, amount, paid, remaining, due_date, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const db2 of (payload.debts as Record<string, unknown>[]) || []) {
        await insDebt.run(
          Number(db2.id),
          String(db2.customer_name ?? ''),
          String(db2.customer_phone ?? ''),
          Number(db2.amount) || 0,
          Number(db2.paid) || 0,
          Number(db2.remaining) || 0,
          String(db2.due_date ?? ''),
          String(db2.status ?? '') || 'open',
          String(db2.note ?? ''),
          normTs(db2.created_at, new Date().toISOString())
        );
      }
      const insPay = d.prepare(
        'INSERT INTO payables (id, supplier_name, supplier_phone, amount, paid, remaining, due_date, status, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const py of (payload.payables as Record<string, unknown>[]) || []) {
        await insPay.run(
          Number(py.id),
          String(py.supplier_name ?? ''),
          String(py.supplier_phone ?? ''),
          Number(py.amount) || 0,
          Number(py.paid) || 0,
          Number(py.remaining) || 0,
          String(py.due_date ?? ''),
          String(py.status ?? '') || 'open',
          String(py.note ?? ''),
          py.created_by != null ? Number(py.created_by) : null,
          normTs(py.created_at, new Date().toISOString())
        );
      }
      const insNS = d.prepare(
        'INSERT INTO notification_settings (id, user_id, type, enabled_in_app, enabled_push, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const ns of (payload.notification_settings as Record<string, unknown>[]) || []) {
        await insNS.run(
          Number(ns.id),
          Number(ns.user_id),
          String(ns.type ?? ''),
          ns.enabled_in_app != null ? Number(ns.enabled_in_app) : 1,
          ns.enabled_push != null ? Number(ns.enabled_push) : 0,
          normTs(ns.created_at, new Date().toISOString())
        );
      }
      const insNotif = d.prepare(
        'INSERT INTO notifications (id, user_id, type, title, message, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const n of (payload.notifications as Record<string, unknown>[]) || []) {
        await insNotif.run(
          Number(n.id),
          Number(n.user_id),
          String(n.type ?? ''),
          String(n.title ?? ''),
          String(n.message ?? ''),
          String(n.link ?? ''),
          n.read != null ? Number(n.read) : 0,
          normTs(n.created_at, new Date().toISOString())
        );
      }
      const insNL = d.prepare(
        'INSERT INTO notification_logs (id, notification_id, channel, status, error, sent_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const nl of (payload.notification_logs as Record<string, unknown>[]) || []) {
        await insNL.run(
          Number(nl.id),
          nl.notification_id != null ? Number(nl.notification_id) : null,
          String(nl.channel ?? ''),
          String(nl.status ?? ''),
          String(nl.error ?? ''),
          normTs(nl.sent_at, new Date().toISOString())
        );
      }
      // audit_log v11: insert KE 13 kolom (incl. user_name, user_role,
      // ip_address, user_agent) — DELETE di atas sudah clear tabel, jadi
      // ID eksplisit aman (autoincrement reset). Kolom v11 lama di file
      // backup lama: fallback default '' (col NOT NULL DEFAULT '').
      const insA = d.prepare(
        `INSERT INTO audit_log (id, user_id, username, user_name, user_role, action, table_name, record_id, old_value, new_value, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const a of (payload.audit_log as Record<string, unknown>[]) || []) {
        await insA.run(
          Number(a.id),
          a.user_id != null ? Number(a.user_id) : null,
          String(a.username ?? ''),
          a.user_name != null ? String(a.user_name) : '',
          a.user_role != null ? String(a.user_role) : '',
          String(a.action ?? ''),
          String(a.table_name ?? ''),
          a.record_id != null ? Number(a.record_id) : null,
          a.old_value != null ? String(a.old_value) : null,
          a.new_value != null ? String(a.new_value) : null,
          a.ip_address != null ? String(a.ip_address) : '',
          a.user_agent != null ? String(a.user_agent) : '',
          normTs(a.created_at, new Date().toISOString())
        );
      }
    });
    await logAudit(user, 'backup:import', 'database', null, undefined, {
      products: (payload.products as unknown[] | undefined)?.length ?? 0,
      sales: (payload.sales as unknown[] | undefined)?.length ?? 0,
      debts: (payload.debts as unknown[] | undefined)?.length ?? 0,
      payables: (payload.payables as unknown[] | undefined)?.length ?? 0,
      returns: (payload.returns as unknown[] | undefined)?.length ?? 0,
      notification_settings:
        (payload.notification_settings as unknown[] | undefined)?.length ?? 0,
      notifications: (payload.notifications as unknown[] | undefined)?.length ?? 0,
      audit_log: (payload.audit_log as unknown[] | undefined)?.length ?? 0,
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
