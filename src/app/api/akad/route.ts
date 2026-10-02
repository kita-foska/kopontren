/**
 * W3.3 -- API modul akad syariah (Sek.6.1/6.4; skema v23):
 * GET /api/akad  = riwayat akad + event + totals per tipe (tier akad
 *                   ATAU laporan -- Q3: pengurus baca read-only, pola
 *                   zis item 7). `?csv=1` = unduh CSV event (pola zis).
 * POST /api/akad = catat akad baru (tanpa akad_id) ATAU event (dgn
 *                   akad_id). D1: event SELALU tercatat; auto-jurnal
 *                   Sek.6.4 hanya saat gl_enabled='1' (satu tx:
 *                   akad/events + jurnal + posted_entry + audit
 *                   atomik). Pracheck akadKindAllowed: kombinasi
 *                   tak valid -> 400, bukan 500 (gl_on; gl-off tetap
 *                   tercatat tanpa jurnal, D1).
 * PUT /api/akad   = soft status active<->settled (+settled_at, audit).
 *                   DELETE TIDAK ADA (prefer soft status, ruling OQ 1).
 * Wakalah = bridge W3.4 (manual jurnal); denda = tak pernah di-post
 * (F3.3 #6; akun 5050 closed).
 */
import { NextResponse } from 'next/server';
import { db, getSettings, tx } from '@/db';
import { canAccess, currentUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import {
  AKAD_KINDS,
  AKAD_STATUS,
  AKAD_TYPES,
  AKAD_UNIQUE_ERROR,
  akadKindAllowed,
  akadValidateAmount,
  akadValidateTerms,
  recordAkadEventInTx,
} from '@/lib/akad';
import { nowWib } from '@/lib/jurnal';

export const dynamic = 'force-dynamic';

export type AkadRow = {
  id: string;
  type: string;
  counterparty: string;
  amount: number;
  terms_json: string | null;
  status: string;
  opened_at: string;
  settled_at: string | null;
  note: string | null;
};

export type AkadEventRow = {
  id: string;
  akad_id: string;
  kind: string;
  amount: number;
  event_date: string;
  posted_entry: string | null;
  entry_desc: string | null;
  created_by: string | null;
};

/** Escape sel CSV: kutip + gandakan kutip dalam (counterparty bebas teks). */
function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Deteksi UNIQUE constraint (akad.type/counterparty/opened_at/amount). */
function isUniqueViolation(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes('UNIQUE constraint failed');
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Q3: baca = tier akad (admin+manajer) ATAU laporan (termasuk pengurus,
  // read-only; consistent dgn zis item 7 + CALK item 8).
  if (!canAccess(user, 'akad') && !canAccess(user, 'laporan')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const d = await db();
  const params = new URL(req.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 100));

  // ?csv=1: unduh CSV event-level (pola zis-history.csv).
  if (params.get('csv') === '1') {
    const rows = (await d
      .prepare(
        'SELECT a.id, a.type, a.counterparty, a.status, e.kind, e.amount, e.event_date, ' +
          'e.posted_entry, e.created_by ' +
          'FROM akad_events e JOIN akad a ON a.id = e.akad_id ' +
          'ORDER BY e.event_date DESC, e.created_at DESC LIMIT ?'
      )
      .all(limit)) as {
      id: string;
      type: string;
      counterparty: string;
      status: string;
      kind: string;
      amount: number;
      event_date: string;
      posted_entry: string | null;
      created_by: string | null;
    }[];
    const lines = [
      'akad_id,type,counterparty,akad_status,kind,amount,event_date,posted_entry,created_by',
      ...rows.map((r) =>
        [r.id, r.type, r.counterparty, r.status, r.kind, r.amount, r.event_date, r.posted_entry, r.created_by]
          .map(csvCell)
          .join(',')
      ),
    ];
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="akad-history.csv"',
      },
    });
  }

  const rows = (await d
    .prepare(
      'SELECT id, type, counterparty, amount, terms_json, status, opened_at, settled_at, note ' +
        'FROM akad ORDER BY opened_at DESC LIMIT ?'
    )
    .all(limit)) as AkadRow[];
  const events = (await d
    .prepare(
      'SELECT e.id, e.akad_id, e.kind, e.amount, e.event_date, e.posted_entry, je.desc entry_desc, ' +
        'e.created_by ' +
        'FROM akad_events e LEFT JOIN journal_entries je ON je.id = e.posted_entry ' +
        'ORDER BY e.event_date DESC, e.created_at DESC LIMIT ?'
    )
    .all(limit)) as AkadEventRow[];
  const totals = (await d
    .prepare(
      'SELECT type, COUNT(*) c, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) a, ' +
        'SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) s, ' +
        'SUM(CASE WHEN status = ? THEN amount ELSE 0 END) sa ' +
        'FROM akad GROUP BY type ORDER BY type'
    )
    .all('active', 'settled', 'active')) as { type: string; c: number; a: number; s: number; sa: number }[];
  const settings = await getSettings();
  return NextResponse.json({
    rows,
    events,
    totals,
    gl_enabled: settings.gl_enabled === '1',
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Tulis = tier akad (admin+manajer); pengurus 403 (baca saja, Q3).
  if (!canAccess(user, 'akad')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'json body rusak' }, { status: 400 });

  const d = await db();
  const settings = await getSettings();
  const glOn = settings.gl_enabled === '1';

  // Cabang event: ada akad_id.
  if (b.akad_id) {
    const akadId = String(b.akad_id).trim();
    const rec = (await d
      .prepare('SELECT id, type, terms_json FROM akad WHERE id = ?')
      .get(akadId)) as { id: string; type: string; terms_json: string | null } | undefined;
    if (!rec) return NextResponse.json({ error: 'akad tidak ditemukan' }, { status: 404 });
    const kind = String(b.kind ?? '').trim();
    if (!(AKAD_KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json({ error: 'kind harus salah satu dari ' + AKAD_KINDS.join('/') }, { status: 400 });
    }
    let amount: number;
    try {
      amount = akadValidateAmount(b.amount);
    } catch {
      return NextResponse.json({ error: 'amount harus rupiah integer > 0' }, { status: 400 });
    }
    // Pracheck (NOTE 3 audit): gl_on + auto-post + kind tak didukung
    // type -> 400, bukan 500. gl-off / wakalah / denda tetap tercatat
    // tanpa jurnal (D1).
    const auto = glOn && rec.type !== 'wakalah' && kind !== 'denda';
    if (auto && !akadKindAllowed(rec.type, kind)) {
      return NextResponse.json(
        {
          error:
            'type ' +
            rec.type +
            ' tak mendukung kind ' +
            kind +
            (rec.type === 'ijarah' && kind === 'settlement' ? ' (settlement ijarah: OQ-A3, belum ada mapping)' : ''),
        },
        { status: 400 }
      );
    }
    const eventIn = b.event_date ? String(b.event_date) : undefined;
    if (eventIn && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(eventIn)) {
      return NextResponse.json(
        { error: 'event_date harus ISO WIB (mis. 2026-10-02T15:30:00.000+07:00)' },
        { status: 400 }
      );
    }
    const id = crypto.randomUUID();
    try {
      const entryId = await tx(d, async () => {
        const r = await recordAkadEventInTx(d, {
          id,
          akadId,
          type: rec.type,
          kind,
          amount,
          event_date: eventIn,
          terms_json: b.terms_json ? String(b.terms_json) : rec.terms_json,
          createdBy: String(user.id),
          gl_enabled: glOn,
          lunas: b.lunas === true,
          heldPp: b.heldPp === true,
        });
        // logAudit di-dalam tx: atomik dgn write event (rollback = audit
        // ikut batal; commit = audit persist bersama).
        await logAudit(user, 'akad:event', 'akad_events', null, undefined, {
          akad_id: akadId,
          type: rec.type,
          kind,
          amount,
          gl_enabled: glOn,
          entry_id: r.entryId,
        });
        return r.entryId;
      });
      // D6: event gl-off TIDAK di-backfill otomatis saat gl diaktifkan.
      return NextResponse.json({ ok: true, id, posted: entryId, gl_enabled: glOn });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json({ error: AKAD_UNIQUE_ERROR, code: 'akad_duplicate' }, { status: 409 });
      }
      return NextResponse.json(
        { error: 'gagal mencatat event akad: ' + (e instanceof Error ? e.message : String(e)) },
        { status: 500 }
      );
    }
  }

  // Cabang akad baru.
  const type = String(b.type ?? '').trim();
  if (!(AKAD_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'type harus salah satu dari ' + AKAD_TYPES.join('/') }, { status: 400 });
  }
  const counterparty = String(b.counterparty ?? '').trim();
  if (!counterparty || counterparty.length > 120) {
    return NextResponse.json({ error: 'counterparty wajib (maks 120 karakter)' }, { status: 400 });
  }
  let amount: number;
  try {
    amount = akadValidateAmount(b.amount);
  } catch {
    return NextResponse.json({ error: 'amount harus rupiah integer > 0' }, { status: 400 });
  }
  let termsJson: string | null = null;
  if (b.terms_json != null) {
    try {
      akadValidateTerms(String(b.terms_json));
      termsJson = String(b.terms_json);
    } catch {
      return NextResponse.json(
        { error: 'terms_json invalid (mis. nisbah harus integer 0-100; 0 preset, semua input manual)' },
        { status: 400 }
      );
    }
  }
  const openedIn = b.opened_at ? String(b.opened_at) : undefined;
  if (openedIn && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(openedIn)) {
    return NextResponse.json(
      { error: 'opened_at harus ISO WIB (mis. 2026-10-02T15:30:00.000+07:00)' },
      { status: 400 }
    );
  }
  const note = b.note ? String(b.note).slice(0, 200) : null;
  const opened = openedIn ?? nowWib();

  const id = crypto.randomUUID();
  try {
    await tx(d, async () => {
      await d
        .prepare(
          'INSERT INTO akad (id, type, counterparty, amount, terms_json, status, opened_at, settled_at, note) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)'
        )
        .run(id, type, counterparty, amount, termsJson, 'active', opened, note);
      await logAudit(user, 'akad:create', 'akad', null, undefined, {
        akad_id: id,
        type,
        counterparty,
        amount,
        opened_at: opened,
      });
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // NOTE 3 W3.1: pesan persis (konstanta AKAD_UNIQUE_ERROR, single
      // source of truth -- teruji di test-akad A8).
      return NextResponse.json({ error: AKAD_UNIQUE_ERROR, code: 'akad_duplicate' }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'gagal mencatat akad: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canAccess(user, 'akad')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'json body rusak' }, { status: 400 });
  const id = String(b.akad_id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'akad_id wajib' }, { status: 400 });
  const status = String(b.status ?? '').trim();
  if (!(AKAD_STATUS as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'status harus ' + AKAD_STATUS.join('/') }, { status: 400 });
  }
  let settledAt: string | null = null;
  if (status === 'settled') {
    settledAt = b.settled_at ? String(b.settled_at) : nowWib();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(settledAt)) {
      return NextResponse.json(
        { error: 'settled_at harus ISO WIB (mis. 2026-10-02T15:30:00.000+07:00)' },
        { status: 400 }
      );
    }
  }
  const d = await db();
  const prev = (await d.prepare('SELECT status FROM akad WHERE id = ?').get(id)) as { status: string } | undefined;
  if (!prev) return NextResponse.json({ error: 'akad tidak ditemukan' }, { status: 404 });
  try {
    await tx(d, async () => {
      await d.prepare('UPDATE akad SET status = ?, settled_at = ? WHERE id = ?').run(status, settledAt, id);
      await logAudit(user, 'akad:status', 'akad', null, { status: prev.status }, { akad_id: id, status, settled_at: settledAt });
    });
    return NextResponse.json({ ok: true, id, status, settled_at: settledAt });
  } catch (e) {
    return NextResponse.json(
      { error: 'gagal update status akad: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    );
  }
}

