import { NextResponse } from 'next/server';
import { db, getZakatSettings, saveZakatSettings } from '@/db';
import { canAccess, currentUser, isAdmin } from '@/lib/auth';
import { resolveValuationMode } from '@/lib/zakat-valuation';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ambil pengaturan zakat (pengurus ke atas; halaman-nya admin-only via layout). */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!canAccess(user, 'zakat'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });
  const s = await getZakatSettings();
  return NextResponse.json({
    gold_price: Number(s.gold_price) || 0,
    nishab_gram: Number(s.nishab_gram) || 0,
    zakat_rate: Number(s.zakat_rate) || 0,
    haul_start_date: s.haul_start_date,
    last_zakat_date: s.last_zakat_date,
    valuation_mode: resolveValuationMode(s.valuation_mode), // P3 Step 2 (provisional)
  });
}

/** Simpan pengaturan zakat (admin-only). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, string> = {};

  if (b.gold_price !== undefined) {
    const v = Number(b.gold_price);
    if (!Number.isFinite(v) || v <= 0)
      return NextResponse.json({ error: 'Harga emas harus > 0' }, { status: 400 });
    patch.gold_price = String(v);
  }
  if (b.nishab_gram !== undefined) {
    const v = Number(b.nishab_gram);
    if (!Number.isFinite(v) || v <= 0)
      return NextResponse.json({ error: 'Nishab (gram) harus > 0' }, { status: 400 });
    patch.nishab_gram = String(v);
  }
  if (b.zakat_rate !== undefined) {
    const v = Number(b.zakat_rate);
    if (!Number.isFinite(v) || v <= 0 || v > 100)
      return NextResponse.json(
        { error: 'Kadar zakat harus > 0 dan maksimal 100' },
        { status: 400 }
      );
    patch.zakat_rate = String(v);
  }
  for (const k of ['haul_start_date', 'last_zakat_date'] as const) {
    if (b[k] !== undefined) {
      const v = String(b[k] ?? '').trim();
      if (v !== '' && !DATE_RE.test(v))
        return NextResponse.json(
          { error: `Tanggal ${k} harus format YYYY-MM-DD (atau kosongkan)` },
          { status: 400 }
        );
      patch[k] = v;
    }
  }
  if (b.valuation_mode !== undefined) {
    // P3 Step 2 (provisional): 'market' (default) | 'hpp' (fallback).
    patch.valuation_mode = resolveValuationMode(b.valuation_mode);
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'Tidak ada pengaturan untuk disimpan' }, { status: 400 });

  const d = await db();
  await saveZakatSettings(d, patch, { id: user.id, username: user.username });
  const s = await getZakatSettings();
  return NextResponse.json({
    ok: true,
    settings: {
      gold_price: Number(s.gold_price) || 0,
      nishab_gram: Number(s.nishab_gram) || 0,
      zakat_rate: Number(s.zakat_rate) || 0,
      haul_start_date: s.haul_start_date,
      last_zakat_date: s.last_zakat_date,
      valuation_mode: resolveValuationMode(s.valuation_mode),
    },
  });
}
