import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invalidate } from '@/lib/ref-cache';
import { kpBarcode } from '@/lib/barcode';

/**
 * Barcode ID (WAVE 8 ITEM 2, 20 Okt 2026 -- ruling R1-R5 Gus Fi).
 *
 * POST { id: number }      -> generate utk 1 produk (R3 tombol per-baris).
 * POST { allEmpty: true }  -> backfill semua produk ber-barcode kosong
 *                             (R1a, R3 tombol massal "Isi semua kosong").
 *
 * R2: format `KP-{id:05d}` (deterministik dari products.id).
 * R4: cek duplikat sebelum menulis; TIDAK memakai UNIQUE constraint
 *     (kompatibilitas upsert-by-barcode import CSV tetap terjaga).
 * R5: tanpa migrasi -- memakai kolom products.barcode yang ada.
 * Tier akses: 'products' (admin/manajer), sama dgn aksi data produk lain.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'products'))
    return NextResponse.json({ error: 'Hanya admin/manajer' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const d = await db();

  if (b.allEmpty === true) {
    // R1a backfill: target = produk ber-barcode kosong (NULL / '' / spasi).
    // R4: lewati baris bila kode hasil generate sudah dipakai produk lain
    // (mis. kode manual 'KP-00007' terisi pada produk id=99, lalu id=7
    // masih kosong -> target id 7 bentrok, dilewati + dilaporkan).
    const empties = (await d
      .prepare(`SELECT id FROM products WHERE barcode IS NULL OR TRIM(barcode) = ''`)
      .all()) as { id: number }[];
    const kpExisting = (await d
      .prepare(`SELECT barcode FROM products WHERE barcode LIKE 'KP-%'`)
      .all()) as { barcode: string }[];
    const taken = new Set(kpExisting.map((r) => r.barcode));
    const apply = empties.filter((r) => !taken.has(kpBarcode(r.id)));
    const skipped = empties.length - apply.length;
    if (apply.length > 0) {
      // 1 statement CASE (id -> kode) = 1 round-trip, atomik via tx.
      const caseWhen = apply.map(() => 'WHEN ? THEN ?').join(' ');
      const params: unknown[] = [];
      apply.forEach((r) => {
        params.push(r.id, kpBarcode(r.id));
      });
      await tx(d, async () => {
        await d
          .prepare(
            `UPDATE products SET barcode = CASE id ${caseWhen} ELSE barcode END
             WHERE id IN (${apply.map(() => '?').join(',')})`
          )
          .run(...params, ...apply.map((r) => r.id));
      });
    }
    await logAudit(user, 'products:barcode-bulk', 'products', null, undefined, {
      filled: apply.length,
      skipped,
      format: 'KP-{id:05d}',
    }, req);
    if (apply.length > 0) invalidate('products:');
    return NextResponse.json({ ok: true, affected: apply.length, skipped });
  }

  // R3 per-baris: generate utk 1 produk.
  const id = Math.floor(Number(b.id));
  if (!Number.isFinite(id) || id <= 0)
    return NextResponse.json({ error: 'id produk wajib' }, { status: 400 });
  const row = (await d
    .prepare('SELECT id, barcode FROM products WHERE id = ?')
    .get(id)) as { id: number; barcode: string } | undefined;
  if (!row)
    return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  if (row.barcode && row.barcode.trim() !== '')
    return NextResponse.json(
      { error: 'Barcode sudah terisi -- hapus dulu lewat form Ubah' },
      { status: 400 }
    );
  const target = kpBarcode(id);
  // R4: bentrok dgn kode manual produk lain (mis. 'KP-00007' diketik di id=99).
  const clash = (await d
    .prepare('SELECT COUNT(*) AS n FROM products WHERE barcode = ? AND id != ?')
    .get(target, id)) as { n: number };
  if (Number(clash.n) > 0)
    return NextResponse.json(
      { error: 'Konflik: ' + target + ' sudah dipakai produk lain' },
      { status: 409 }
    );
  await d
    .prepare('UPDATE products SET barcode = ? WHERE id = ?')
    .run(target, id);
  await logAudit(user, 'products:barcode-generate', 'products', id, undefined, {
    barcode: target,
  }, req);
  invalidate('products:');
  return NextResponse.json({ ok: true, id, barcode: target });
}
