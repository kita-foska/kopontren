/**
 * P2 / Q62 (ruling Gus Fi 2026-10-10) -- API alur persetujuan.
 *
 * Tier: admin (guard role === 'admin', sejajar /admin/pengguna &
 * /admin/jurnal). Pengurus/role lain = 403.
 *
 * GET /api/approvals?tab=menunggu|riwayat
 *  - "menunggu" = approval_requests WHERE status='pending' (FIFO, cap 500)
 *  - "riwayat"  = status IN (approved/rejected/applied/withdrawn) newest,
 *    cap 200. (Keputusan P2: 'withdrawn' ikut Riwayat agar tak hilang
 *    dari semua tampilan -- deviasi bernilai dari ruling 3 status.)
 *
 * POST /api/approvals -- dua op:
 *  - { op:'decide', id, approve:true|false, reason? } : putus request.
 *    Alur decide (lib/approvals.ts, berjalan DI DALAM tx()): aturan dua
 *    orang (pemohon tak memutus sendiri; pengecualian bootstrap =
 *    pemohon satu-satunya admin aktif) -> [tolak] 'rejected' |
 *    [setujui] 'approved' -> guard re-validation -> apply aksi ->
 *    'applied' (guard gagal -> 'rejected' + prefix 'guard: ').
 *  - { op:'withdraw', id } : pemohon menarik request-nya (pending saja).
 *
 * Audit: logAudit 'approval:decide' / 'approval:withdraw' (entity
 * approval_requests). Notifikasi: jenis 'approval_pending' (semua
 * admin), best-effort. Cache: jurnal:reverse -> invalidate('gl:');
 * kas:delete -> invalidate('kas:' + 'reports:') + notifyCashBalance.
 */
import { NextResponse } from 'next/server';
import { db, tx } from '@/db';
import { currentUser } from '@/lib/auth';
import { invalidate } from '@/lib/ref-cache';
import { logAudit } from '@/lib/audit';
import { notify, notifyCashBalance } from '@/lib/notify';
import { reverseJournalInTx } from '@/lib/jurnal';
import {
  ACTION_LABELS,
  ApprovalError,
  decide,
  getHistory,
  getPending,
  withdraw,
  type Actor,
  type ApprovalAction,
  type ApprovalCtx,
  type ApprovalRow,
} from '@/lib/approvals';

function shape(r: ApprovalRow) {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(r.payload) as Record<string, unknown>;
    if (!payload || typeof payload !== 'object') payload = {};
  } catch {
    payload = {};
  }
  return {
    id: r.id,
    action: r.action,
    label: ACTION_LABELS[r.action as ApprovalAction] ?? r.action,
    payload,
    status: r.status,
    request_username: r.request_username,
    reason: r.reason,
    decided_username: r.decided_username,
    decided_at: r.decided_at,
    applied_at: r.applied_at,
    created_at: r.created_at,
  };
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.role !== 'admin')
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') === 'riwayat' ? 'riwayat' : 'menunggu';
  const d = await db();
  const rows = tab === 'menunggu' ? await getPending(d) : await getHistory(d, 200);
  return NextResponse.json({ tab, requests: rows.map(shape) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.role !== 'admin')
    return NextResponse.json({ error: 'Hanya pengurus' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(b.op ?? '').trim();
  const id = Number(b.id ?? 0);
  if (!id) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });
  const d = await db();
  const actor: Actor = { id: user.id, username: user.username };

  if (op === 'decide') {
    const approve = b.approve === true;
    const reason = String(b.reason ?? '').trim().slice(0, 200);
    if (!approve && !reason)
      return NextResponse.json({ error: 'Alasan penolakan wajib diisi' }, { status: 400 });
    // ctx DI (lib/approvals.ts): implementasi reversal asli dari lib/jurnal
    // (reverseJournalInTx, TxDb secara struktural = ADb approvals).
    const ctx: ApprovalCtx = { reverseJournal: reverseJournalInTx };
    let result: Awaited<ReturnType<typeof decide>>;
    try {
      result = await tx(d, () => decide(d, actor, { id, approve, reason }, ctx));
    } catch (e) {
      if (e instanceof ApprovalError) {
        const status =
          e.code === 'not-found'
            ? 404
            : e.code === 'not-pending'
              ? 409
              : e.code === 'self-decide' || e.code === 'no-permission'
                ? 403
                : 400;
        return NextResponse.json({ error: e.message }, { status });
      }
      return NextResponse.json({ error: 'Gagal memutus permintaan' }, { status: 500 });
    }
    // Efek sisi setelah apply (di luar tx; best-effort):
    if (result.applied) {
      if (result.request.action === 'jurnal:reverse') invalidate('gl:');
      if (result.request.action === 'kas:delete') {
        invalidate('kas:');
        invalidate('reports:');
        try {
          await notifyCashBalance();
        } catch (e) {
          console.warn('[notify] pemicu kas gagal:', e);
        }
      }
    }
    await logAudit({
      userId: user.id,
      userName: user.display_name || user.username,
      userRole: user.role,
      action: 'approval:decide',
      entity: 'approval_requests',
      entityId: id,
      fieldChanges: {
        decision: {
          before: 'pending',
          after: {
            approve,
            reason,
            status: result.applied ? 'applied' : 'rejected',
            guard: result.guard_reason || null,
            self_bootstrap: result.self_bootstrap,
          },
        },
        underlying: {
          before: null,
          after: result.applied
            ? { action: result.request.action, payload: result.request.payload }
            : null,
        },
      },
      req,
    });
    try {
      await notify({
        type: 'approval_pending',
        title: result.applied ? 'Persetujuan diterapkan' : 'Persetujuan tidak diterapkan',
        message:
          'Permintaan #' +
          id +
          ' (' +
          (ACTION_LABELS[result.request.action as ApprovalAction] ?? result.request.action) +
          '): ' +
          (result.applied
            ? 'diterapkan'
            : result.guard_reason
              ? 'guard gagal (' + result.guard_reason + ')'
              : 'ditolak') +
          ' oleh ' +
          user.username +
          '.',
        link: '/admin/persetujuan',
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({
      ok: true,
      id,
      status: result.applied ? 'applied' : 'rejected',
      guard_reason: result.guard_reason,
    });
  }

  if (op === 'withdraw') {
    try {
      await withdraw(d, actor, id);
    } catch (e) {
      if (e instanceof ApprovalError) {
        const status = e.code === 'not-found' ? 404 : e.code === 'not-pending' ? 409 : 403;
        return NextResponse.json({ error: e.message }, { status });
      }
      return NextResponse.json({ error: 'Gagal menarik permintaan' }, { status: 500 });
    }
    await logAudit(user, 'approval:withdraw', 'approval_requests', id, undefined, undefined, req);
    return NextResponse.json({ ok: true, id });
  }

  return NextResponse.json({ error: 'op tak dikenal (pakai "decide" atau "withdraw")' }, { status: 400 });
}