import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseImport, type ImportRow, type RowError } from '@/lib/product-import';

/**
 * POST /api/migrate/products — batch product upsert (ADMIN ONLY).
 *
 * Body: { csv?: string, rows?: ImportRow[], total?: number }
 *  - `csv`: raw CSV text — parsed & validated server-side (single batch).
 *  - `rows`: pre-parsed rows from the admin UI (sent in batches of ~50).
 *
 * Upsert rule (per user spec):
 *  - barcode present  -> UPDATE by barcode, else INSERT (barcode unique).
 *  - no barcode       -> UPDATE by lower(name), else INSERT.
 *  - strict: name required; base_price/cost_price/stock >= 0 and numeric.
 *
 * Response: { ok, inserted, updated, failed, errors, total_products,
 *             warn_cost_zero: {count, items}, warn_low_margin: {count, items} }
 */

const MAX_BATCH = 500;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.role !== 'admin')
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    csv?: string;
    rows?: ImportRow[];
  };

  let rows: ImportRow[];
  let rowErrors: RowError[] = [];
  if (typeof b.csv === 'string' && b.csv.trim()) {
    const parsed = parseImport(b.csv);
    rows = parsed.rows;
    rowErrors = parsed.errors;
  } else {
    rows = Array.isArray(b.rows) ? b.rows : [];
    // Re-validate server-side (never trust client-sent numbers)
    const bad = new Set<number>();
    const seenBarcode = new Set<string>();
    for (const r of rows) {
      if (!r || !String(r.name || '').trim()) {
        rowErrors.push({ line: r?.line ?? 0, code: 'name-required', message: 'name kosong' });
        bad.add(r?.line ?? 0);
        continue;
      }
      for (const k of ['base_price', 'cost_price', 'stock'] as const) {
        const v = Number((r as Record<string, unknown>)[k]);
        if (!Number.isFinite(v)) {
          rowErrors.push({ line: r.line, code: `invalid-${k}`, message: `${k} bukan angka` });
          bad.add(r.line);
          break;
        }
        if (v < 0) {
          rowErrors.push({ line: r.line, code: `negative-${k}`, message: `${k} negatif` });
          bad.add(r.line);
          break;
        }
      }
      if (!bad.has(r.line) && r.barcode) {
        if (seenBarcode.has(r.barcode)) {
          rowErrors.push({
            line: r.line,
            code: 'duplicate-barcode',
            message: `barcode ${r.barcode} muncul >1x dalam batch`,
          });
          bad.add(r.line);
        } else seenBarcode.add(r.barcode);
      }
    }
    rows = rows.filter((r) => r && !bad.has(r.line));
  }

  if (rows.length > MAX_BATCH)
    return NextResponse.json({ error: `Maksimal ${MAX_BATCH} baris per request` }, { status: 400 });

  const d = await db();
  let inserted = 0;
  let updated = 0;
  const failed: RowError[] = [];

  await tx(d, async () => {
    for (const r of rows) {
      try {
        const name = String(r.name).trim();
        const category = String(r.category ?? '').trim();
        const unit = String(r.unit ?? '').trim() || 'pcs';
        const base = Math.round(Number(r.base_price));
        const cost = Math.round(Number(r.cost_price));
        const stock = Math.round(Number(r.stock));
        if (r.barcode) {
          const info = await d
            .prepare(
              `UPDATE products
               SET name = ?, category = ?, unit = ?, base_price = ?, cost_price = ?, stock = ?, barcode = ?
               WHERE barcode = ?`
            )
            .run(name, category, unit, base, cost, stock, r.barcode, r.barcode);
          if (info.changes > 0) updated++;
          else {
            await d
              .prepare(
                `INSERT INTO products (name, category, unit, base_price, cost_price, stock, active, barcode)
                 VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
              )
              .run(name, category, unit, base, cost, stock, r.barcode);
            inserted++;
          }
        } else {
          const info = await d
            .prepare(
              `UPDATE products
               SET category = ?, unit = ?, base_price = ?, cost_price = ?, stock = ?
               WHERE lower(name) = lower(?)`
            )
            .run(category, unit, base, cost, stock, name);
          if (info.changes > 0) updated++;
          else {
            await d
              .prepare(
                `INSERT INTO products (name, category, unit, base_price, cost_price, stock, active, barcode)
                 VALUES (?, ?, ?, ?, ?, ?, 1, '')`
              )
              .run(name, category, unit, base, cost, stock);
            inserted++;
          }
        }
      } catch (e) {
        failed.push({
          line: r.line,
          code: 'db-error',
          message: `Baris ${r.line} (${String(r.name).trim()}): ${String(
            (e as { message?: string })?.message || e
          )}`,
        });
      }
    }
  });

  // Post-import health report
  const totalProducts = ((await d.prepare('SELECT COUNT(*) c FROM products').get()) as { c: number })
    .c;
  const costZero = (
    await d
      .prepare('SELECT name FROM products WHERE cost_price = 0 ORDER BY name LIMIT 50')
      .all()
  ) as { name: string }[];
  const lowMargin = (
    await d
      .prepare(
        `SELECT name, base_price, cost_price,
                ROUND(((base_price - cost_price) * 1000.0 / base_price)) / 10.0 AS margin_pct
         FROM products
         WHERE active = 1 AND base_price > 0 AND cost_price > 0
           AND (base_price - cost_price) * 100 < base_price * 5
         ORDER BY base_price DESC
         LIMIT 50`
      )
      .all()
  ) as { name: string; base_price: number; cost_price: number; margin_pct: number }[];

  await logAudit(user, 'product:import', 'products', null, undefined, {
    rows: rows.length,
    inserted,
    updated,
    failed: failed.length,
    total_products: totalProducts,
  });

  return NextResponse.json({
    ok: true,
    inserted,
    updated,
    failed,
    errors: rowErrors,
    total_products: totalProducts,
    warn_cost_zero: { count: costZero.length, items: costZero.map((r) => r.name) },
    warn_low_margin: { count: lowMargin.length, items: lowMargin },
  });
}