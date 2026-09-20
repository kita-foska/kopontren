import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { cached, invalidate } from '@/lib/ref-cache';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  // Sumber data loyalty POS (tier 'pos': admin, manajer, kasir). Peran lain
  // tidak perlu membaca data member (PII).
  if (!canAccess(user, 'pos'))
    return NextResponse.json({ error: 'Hanya admin/manajer/kasir' }, { status: 403 });
  const url = new URL(req.url);
  const q = String(url.searchParams.get('q') || '').trim();
  // Pagination: default & maksimal 50 (target Turso Rows Read); klien
  // memakai "Muat lebih banyak" dengan ?offset= .
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const d = await db();
  let where = '';
  const args: string[] = [];
  if (q) {
    // Escape meta-char LIKE (% _ \) — input user menjadi pola literal,
    // bukan wildcard. (Tidak SQLi: query tetap parameterized.)
    const qEsc = q.replace(/[\\%_]/g, (ch) => '\\' + ch);
    where =
      ` WHERE (name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')`;
    const like = '%' + qEsc + '%';
    args.push(like, like, like);
  }
  const rows = await d
    .prepare(
      `SELECT id, name, phone, address, points, total_spent, created_at, birth_date, tier, cashback_balance FROM members${where} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset);
  // Agregat global (seluruh tabel, bukan halaman) untuk kartu ringkasan.
  // Cache 60 dtk (ref-cache): COUNT/SUM penuh tabel members adalah pemicu
  // Rows Read; dibuang saat ada mutasi (member & poin via transaksi).
  const totals = await cached(`members:totals:${q || '-'}`, async () => {
    const t = (await d
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(points),0) p, COALESCE(SUM(total_spent),0) t FROM members${where}`
      )
      .get(...args)) as { c: number; p: number; t: number };
    return t;
  });
  return NextResponse.json({
    members: rows,
    total: totals.c,
    total_points: totals.p,
    total_spent: totals.t,
    limit,
    offset,
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  // Kasir membuat member saat transaksi POS; tier 'pos' (admin, manajer, kasir).
  if (!canAccess(user, 'pos'))
    return NextResponse.json({ error: 'Hanya admin/manajer/kasir' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Nama member wajib' }, { status: 400 });
  const d = await db();
  const info = await d
    .prepare(
      `INSERT INTO members (name, phone, address) VALUES (?, ?, ?)`
    )
    .run(name, String(b.phone || '').trim(), String(b.address || '').trim());
  await logAudit(user, 'member:create', 'members', Number(info.lastInsertRowid), undefined, {
    name,
  }, req);
  invalidate('members:');
  return NextResponse.json({ ok: true, id: Number(info.lastInsertRowid) });
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'member'))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(b.id || 0);
  if (!id) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });
  const d = await db();
  const row = (await d
    .prepare('SELECT * FROM members WHERE id = ?')
    .get(id)) as {
    id: number;
    name: string;
    phone: string;
    address: string;
    points: number;
  } | undefined;
  if (!row) return NextResponse.json({ error: 'Member tidak ditemukan' }, { status: 404 });
  await d
    .prepare('UPDATE members SET name = ?, phone = ?, address = ? WHERE id = ?')
    .run(
      String(b.name ?? row.name).trim() || row.name,
      String(b.phone ?? row.phone).trim(),
      String(b.address ?? row.address).trim(),
      id
    );
  await logAudit(user, 'member:update', 'members', id, row, {
    name: String(b.name ?? row.name),
    phone: String(b.phone ?? row.phone),
    address: String(b.address ?? row.address),
  }, req);
  invalidate('members:');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'member'))
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id') || '0');
  if (!id) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });
  const d = await db();
  const row = (await d
    .prepare('SELECT * FROM members WHERE id = ?')
    .get(id)) as { id: number; name: string } | undefined;
  if (!row) return NextResponse.json({ error: 'Member tidak ditemukan' }, { status: 404 });
  // Urutan FK-safe dalam 1 tx: net-kan relasi sales DULU, baru hapus
  // member (order lama terbalik -> jeda orfan sales.member_id + poin
  // ledger yatim bila proses terganggu di tengah).
  await tx(d, async () => {
    await d.prepare('UPDATE sales SET member_id = NULL WHERE member_id = ?').run(id);
    await d.prepare('DELETE FROM members WHERE id = ?').run(id);
  });
  await logAudit(user, 'member:delete', 'members', id, row, undefined, req);
  invalidate('members:');
  return NextResponse.json({ ok: true });
}