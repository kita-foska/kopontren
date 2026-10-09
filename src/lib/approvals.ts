/**
 * P2 / Q62 (ruling Gus Fi 2026-10-10) -- state machine approval flow.
 * Modul PURE (pola lib/keuangan.ts & lib/jurnal.ts: bebas dependensi
 * server) agar bisa diuji Node (scripts/test/approval-flow.mjs,
 * node:sqlite in-memory); hanya `import { ROLES } from './features.ts'`
 * (modul pure UX-5 H1) utk validasi enum role di guard re-validate.
 *
 * Lima aksi allow-list yang MUST melalui antrean:
 * user:create_admin (POST /api/users role='admin'), user:role +
 * user:active (PUT /api/users), jurnal:reverse (POST /api/jurnal),
 * kas:delete (DELETE /api/kas).
 *
 * State machine: pending -> rejected (tolak) | withdrawn (pemohon
 * menarik) | approved -> applied (setujui + guard lolos + apply ok) |
 * approved -> rejected (guard re-validation gagal, prefix 'guard: ').
 *
 * Aturan dua orang: pemohon TIDAK boleh memutus sendiri, KECUALI
 * bootstrap (pemohon = satu-satunya admin aktif; tanpa ini instalasi
 * 1-admin takkan bisa menambah admin ke-2). Dispatcher (decide)
 * RE-VALIDATE guard saat apply (state DB diperiksa ulang di detik
 * apply, bukan saat request dibuat).
 *
 * `reverseJournal` (lib/jurnal.reverseJournalInTx) di-INJEK via ctx
 * (DI): modul tetap zero-server-deps; route /api/approvals menyuplai
 * implementasi asli, test menyuplai mock.
 */
import { ROLES } from './features.ts';

/** Permukaan DB tulis minimum (mirror TxDb lib/jurnal.ts; async). */
export type ADb = {
  prepare(sql: string): {
    get(...args: unknown[]): Promise<unknown>;
    all(...args: unknown[]): Promise<unknown[]>;
    run(...args: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
  };
};

/** Allow-list aksi approval flow (5; sumber kebenaran). */
export type ApprovalAction =
  | 'user:create_admin'
  | 'user:role'
  | 'user:active'
  | 'jurnal:reverse'
  | 'kas:delete';

export const APPROVAL_ACTIONS: readonly ApprovalAction[] = [
  'user:create_admin',
  'user:role',
  'user:active',
  'jurnal:reverse',
  'kas:delete',
];

export const APPROVAL_ACTION_SET: ReadonlySet<string> = new Set<string>(APPROVAL_ACTIONS);

/** Label manusia (UI + notifikasi; tanpa emoji/unicode). */
export const ACTION_LABELS: Record<ApprovalAction, string> = {
  'user:create_admin': 'Buat akun admin',
  'user:role': 'Ubah peran pengguna',
  'user:active': 'Aktif/nonaktifkan pengguna',
  'jurnal:reverse': 'Jurnal pembalik',
  'kas:delete': 'Hapus jurnal kas manual',
};

export function isApprovalAction(a: unknown): a is ApprovalAction {
  return APPROVAL_ACTION_SET.has(String(a));
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'withdrawn';

/**
 * Status "tertutup" utk tab Riwayat. Keputusan P2: 'withdrawn' ikut
 * tampil di Riwayat (deviasi bernilai dari ruling 3 status, agar
 * penarikan pemohon tak hilang dari semua tampilan; Menunggu = pending).
 */
export const CLOSED_STATUSES: readonly string[] = ['approved', 'rejected', 'applied', 'withdrawn'];

/** Baris approval_requests (shape hasil SELECT *). */
export type ApprovalRow = {
  id: number;
  action: string;
  payload: string;
  target: string;
  status: string;
  request_user_id: number;
  request_username: string;
  reason: string;
  decided_by: number | null;
  decided_username: string;
  decided_at: string | null;
  applied_at: string | null;
  created_at: string;
};

export type Actor = { id: number; username: string };

/** Error domain approval flow (route memetakan code -> status HTTP). */
export class ApprovalError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
  }
}

/** ctx di-inject pemanggil (reverseJournal = reverseJournalInTx). */
export type ApprovalCtx = {
  reverseJournal: (d: ADb, entryId: string, reason: string, user: string) => Promise<string | null>;
};

const nowIso = (): string => new Date().toISOString();

/** Kunci alami per aksi -- dedupe: SATU request pending per target. */
export function naturalKey(action: ApprovalAction, payload: Record<string, unknown>): string {
  switch (action) {
    case 'user:create_admin':
      return 'user:' + String(payload.username ?? '');
    case 'user:role':
    case 'user:active':
      return 'user:' + String(payload.user_id ?? '');
    case 'jurnal:reverse':
      return 'je:' + String(payload.entry_id ?? '');
    case 'kas:delete':
      return 'ce:' + String(payload.entry_id ?? '');
  }
}

function parsePayload(row: ApprovalRow): Record<string, unknown> {
  try {
    const p = JSON.parse(row.payload) as Record<string, unknown>;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function rowToApprovalRow(r: Record<string, unknown>): ApprovalRow {
  return {
    id: Number(r.id),
    action: String(r.action ?? ''),
    payload: String(r.payload ?? ''),
    target: String(r.target ?? ''),
    status: String(r.status ?? ''),
    request_user_id: Number(r.request_user_id ?? 0),
    request_username: String(r.request_username ?? ''),
    reason: String(r.reason ?? ''),
    decided_by: r.decided_by === null || r.decided_by === undefined ? null : Number(r.decided_by),
    decided_username: String(r.decided_username ?? ''),
    decided_at: r.decided_at === null || r.decided_at === undefined ? null : String(r.decided_at),
    applied_at: r.applied_at === null || r.applied_at === undefined ? null : String(r.applied_at),
    created_at: String(r.created_at ?? ''),
  };
}

async function loadRequest(d: ADb, id: number): Promise<ApprovalRow | null> {
  const row = (await d.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id)) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return rowToApprovalRow(row);
}

/** Tab Menunggu: request pending (FIFO, cap 500). */
export async function getPending(d: ADb): Promise<ApprovalRow[]> {
  const rows = (await d
    .prepare("SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY id ASC LIMIT 500")
    .all()) as Record<string, unknown>[];
  return rows.map(rowToApprovalRow);
}

/** Tab Riwayat: request tertutup (approved/rejected/applied/withdrawn,
 * newest-first, cap default 200). */
export async function getHistory(d: ADb, limit = 200): Promise<ApprovalRow[]> {
  const rows = (await d
    .prepare(
      `SELECT * FROM approval_requests WHERE status IN ('approved','rejected','applied','withdrawn') ORDER BY id DESC LIMIT ?`
    )
    .all(limit)) as Record<string, unknown>[];
  return rows.map(rowToApprovalRow);
}

/**
 * Buat request pending. Idempoten per target: bila sudah ada request
 * pending utk (action, target) yang sama -> kembalikan id-nya (tak ada
 * duplikat antrean). `payload` DISIMPAN APA ADANYA (route memvalidasi
 * bentuk sebelum memanggil); utk create_admin payload memuat salt +
 * pass_hash (BUKAN plaintext password). SELECT dedupe + INSERT harus
 * atomik: jalankan DI DALAM tx() pemanggil.
 */
export async function createRequest(
  d: ADb,
  actor: Actor,
  action: string,
  payload: Record<string, unknown>,
  reason = ''
): Promise<number> {
  if (!isApprovalAction(action)) {
    throw new ApprovalError('unknown-action', 'Aksi tidak dikenal: ' + action);
  }
  const key = naturalKey(action, payload);
  const ex = (await d
    .prepare(
      "SELECT id FROM approval_requests WHERE action = ? AND target = ? AND status = 'pending' ORDER BY id ASC LIMIT 1"
    )
    .get(action, key)) as { id: number } | undefined;
  if (ex && ex.id) return Number(ex.id);
  const info = await d
    .prepare(
      "INSERT INTO approval_requests (action, payload, target, status, request_user_id, request_username, reason) " +
        "VALUES (?, ?, ?, 'pending', ?, ?, ?)"
    )
    .run(
      action,
      JSON.stringify(payload),
      key,
      actor.id,
      actor.username,
      String(reason).slice(0, 200)
    );
  return Number(info.lastInsertRowid);
}

/** Pemohon menarik permintaannya sendiri (pending saja). */
export async function withdraw(d: ADb, actor: Actor, id: number): Promise<void> {
  const r = await loadRequest(d, id);
  if (!r) throw new ApprovalError('not-found', 'Permintaan tidak ditemukan');
  if (r.status !== 'pending')
    throw new ApprovalError('not-pending', 'Permintaan #' + id + ' sudah ' + r.status);
  if (Number(r.request_user_id) !== Number(actor.id))
    throw new ApprovalError('not-owner', 'Hanya pemohon yang dapat menarik permintaan');
  await d
    .prepare("UPDATE approval_requests SET status = 'withdrawn', decided_at = ? WHERE id = ?")
    .run(nowIso(), id);
}

type DecideResult = {
  request: ApprovalRow;
  applied: boolean;
  guard_reason: string;
  self_bootstrap: boolean;
};

/**
 * Putus request (admin aktif). Urutan di dalam (route membungkus dgn
 * tx()): 1) validasi state + aturan dua orang; 2) tolak -> 'rejected';
 * 3) setujui -> 'approved' -> guard re-validate -> apply -> 'applied'
 * (guard gagal -> 'rejected' + prefix 'guard: ').
 */
export async function decide(
  d: ADb,
  actor: Actor,
  opts: { id: number; approve: boolean; reason?: string },
  ctx: ApprovalCtx
): Promise<DecideResult> {
  const r = await loadRequest(d, opts.id);
  if (!r) throw new ApprovalError('not-found', 'Permintaan tidak ditemukan');
  if (r.status !== 'pending')
    throw new ApprovalError('not-pending', 'Permintaan #' + opts.id + ' sudah ' + r.status);

  // Dispatcher re-validation: aktor harus user aktif ber-role admin.
  const actorRow = (await d
    .prepare('SELECT active, role FROM users WHERE id = ?')
    .get(actor.id)) as { active: number; role: string } | undefined;
  if (!actorRow || Number(actorRow.active) !== 1 || actorRow.role !== 'admin') {
    throw new ApprovalError('no-permission', 'Pemberi keputusan harus admin aktif');
  }

  // Aturan dua orang (anti self-approve), KECUALI bootstrap.
  let selfBootstrap = false;
  if (Number(r.request_user_id) === Number(actor.id)) {
    const cnt = (await d
      .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1")
      .get()) as { c: number };
    if (Number(cnt.c) > 1) {
      throw new ApprovalError(
        'self-decide',
        'Pemohon tidak boleh memutus permintaannya sendiri (aturan dua orang)'
      );
    }
    selfBootstrap = true;
  }

  const reason = String(opts.reason ?? '').slice(0, 200);

  if (!opts.approve) {
    await d
      .prepare(
        "UPDATE approval_requests SET status = 'rejected', decided_by = ?, decided_username = ?, decided_at = ?, reason = ? WHERE id = ?"
      )
      .run(actor.id, actor.username, nowIso(), reason, r.id);
    return { request: r, applied: false, guard_reason: '', self_bootstrap: selfBootstrap };
  }

  // Stage 'approved' (atomik dgn apply lewat tx pemanggil).
  await d
    .prepare(
      "UPDATE approval_requests SET status = 'approved', decided_by = ?, decided_username = ?, decided_at = ? WHERE id = ?"
    )
    .run(actor.id, actor.username, nowIso(), r.id);

  const payload = parsePayload(r);
  const guard = await guardAction(d, r.action as ApprovalAction, payload);
  if (guard.fail) {
    await d
      .prepare("UPDATE approval_requests SET status = 'rejected', reason = ? WHERE id = ?")
      .run('guard: ' + guard.fail, r.id);
    return { request: r, applied: false, guard_reason: guard.fail, self_bootstrap: selfBootstrap };
  }
  await applyAction(d, r.action as ApprovalAction, payload, actor.username, ctx);
  await d
    .prepare("UPDATE approval_requests SET status = 'applied', applied_at = ? WHERE id = ?")
    .run(nowIso(), r.id);
  return { request: r, applied: true, guard_reason: '', self_bootstrap: selfBootstrap };
}

/**
 * Guard RE-VALIDATION saat apply: periksa state DB SEKARANG (bukan
 * snapshot saat request dibuat). Hasil fail = alasan ditolak.
 */
async function guardAction(
  d: ADb,
  action: ApprovalAction,
  p: Record<string, unknown>
): Promise<{ fail: string }> {
  switch (action) {
    case 'user:create_admin': {
      const username = String(p.username ?? '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return { fail: 'bentuk username tidak valid' };
      if (!p.salt || !p.pass_hash) return { fail: 'payload tanpa salt/pass_hash' };
      const dup = (await d.prepare('SELECT id FROM users WHERE username = ?').get(username)) as
        | { id: number }
        | undefined;
      if (dup && dup.id) return { fail: 'username sudah dipakai' };
      return { fail: '' };
    }
    case 'user:role': {
      const uid = Number(p.user_id ?? 0);
      if (!uid) return { fail: 'user_id hilang dari payload' };
      const tgt = (await d
        .prepare('SELECT role, roles FROM users WHERE id = ?')
        .get(uid)) as { role: string; roles: string | null } | undefined;
      if (!tgt) return { fail: 'pengguna tidak ditemukan' };
      const primary = String(p.new_primary ?? '').trim().toLowerCase();
      const extra: string[] = (Array.isArray(p.new_roles) ? (p.new_roles as unknown[]) : []).map((x) =>
        String(x ?? '').trim().toLowerCase()
      );
      for (const s of [primary, ...extra]) {
        if (!s || !(ROLES as readonly string[]).includes(s))
          return { fail: 'role tidak valid: ' + (s || '(kosong)') };
      }
      // Guard terakhir-admin: hitung ulang SEKARANG (bukan snapshot).
      const curRoles = parseRolesJson(tgt.roles, String(tgt.role ?? ''));
      const finalRoles = dedupRoles([primary, ...extra]);
      if (curRoles.includes('admin') && !finalRoles.includes('admin')) {
        const cnt = (await d
          .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' OR roles LIKE '%\"admin\"%'")
          .get()) as { c: number };
        if (Number(cnt.c) <= 1) return { fail: 'tidak boleh mendemote admin terakhir' };
      }
      return { fail: '' };
    }
    case 'user:active': {
      const uid = Number(p.user_id ?? 0);
      if (!uid) return { fail: 'user_id hilang dari payload' };
      const tgt = (await d
        .prepare('SELECT active FROM users WHERE id = ?')
        .get(uid)) as { active: number } | undefined;
      if (!tgt) return { fail: 'pengguna tidak ditemukan' };
      return { fail: '' };
    }
    case 'jurnal:reverse': {
      const entryId = String(p.entry_id ?? '');
      if (!entryId) return { fail: 'entry_id hilang dari payload' };
      const je = (await d
        .prepare('SELECT reversed_by FROM journal_entries WHERE id = ?')
        .get(entryId)) as { reversed_by: string | null } | undefined;
      if (!je) return { fail: 'jurnal tidak ditemukan' };
      if (je.reversed_by) return { fail: 'jurnal sudah dibalik' };
      const lines = (await d
        .prepare('SELECT COUNT(*) AS c FROM journal_lines WHERE entry_id = ?')
        .get(entryId)) as { c: number };
      if (Number(lines.c) === 0) return { fail: 'jurnal tidak memiliki baris' };
      return { fail: '' };
    }
    case 'kas:delete': {
      const uid = Number(p.entry_id ?? 0);
      if (!uid) return { fail: 'entry_id hilang dari payload' };
      const row = (await d
        .prepare('SELECT id FROM cash_entries WHERE id = ?')
        .get(uid)) as { id: number } | undefined;
      if (!row) return { fail: 'jurnal kas tidak ditemukan' };
      return { fail: '' };
    }
  }
}

/** Eksekusi aksi (guard sudah lolos). Throw = tx pemanggil roll-back. */
async function applyAction(
  d: ADb,
  action: ApprovalAction,
  p: Record<string, unknown>,
  decidedUsername: string,
  ctx: ApprovalCtx
): Promise<void> {
  switch (action) {
    case 'user:create_admin': {
      const username = String(p.username ?? '').trim().toLowerCase();
      await d
        .prepare(
          'INSERT INTO users (username, display_name, role, roles, active, salt, pass_hash, pw_default, created_by) ' +
            "VALUES (?, ?, 'admin', '[\"admin\"]', 1, ?, ?, 0, ?)"
        )
        .run(
          username,
          String(p.display_name ?? '').trim(),
          String(p.salt ?? ''),
          String(p.pass_hash ?? ''),
          Number(p.created_by ?? 0) || null
        );
      return;
    }
    case 'user:role': {
      const uid = Number(p.user_id ?? 0);
      const primary = String(p.new_primary ?? '').trim().toLowerCase();
      const extra: string[] = (Array.isArray(p.new_roles) ? (p.new_roles as unknown[]) : []).map((x) =>
        String(x ?? '').trim().toLowerCase()
      );
      const finalRoles = dedupRoles([primary, ...extra]);
      await d
        .prepare('UPDATE users SET role = ?, roles = ? WHERE id = ?')
        .run(primary, JSON.stringify(finalRoles), uid);
      return;
    }
    case 'user:active': {
      const uid = Number(p.user_id ?? 0);
      const active = p.active ? 1 : 0;
      await d.prepare('UPDATE users SET active = ? WHERE id = ?').run(active, uid);
      if (active === 0) {
        await d.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
      }
      return;
    }
    case 'jurnal:reverse': {
      const entryId = String(p.entry_id ?? '');
      const out = await ctx.reverseJournal(d, entryId, String(p.reason ?? ''), decidedUsername);
      if (!out) {
        // Guard sudah lolos barusan; race -> tolak (tx pemanggil roll-back).
        throw new ApprovalError('guard', 'jurnal tidak dapat dibalik saat apply');
      }
      return;
    }
    case 'kas:delete': {
      const uid = Number(p.entry_id ?? 0);
      const info = await d.prepare('DELETE FROM cash_entries WHERE id = ?').run(uid);
      if (Number(info.changes) === 0) {
        throw new ApprovalError('guard', 'jurnal kas tidak ditemukan saat apply');
      }
      return;
    }
  }
}

/** Parse kolom users.roles (JSON array) dgn fallback primary (mirror
 *  parseUserRoles lib/features.ts -- versi bebas-import utk modul ini). */
function parseRolesJson(raw: string | null, primary: string): string[] {
  let arr: unknown = null;
  if (raw) {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = null;
    }
  }
  const out: string[] = [];
  if (Array.isArray(arr)) {
    for (const r of arr) {
      const s = String(r);
      if ((ROLES as readonly string[]).includes(s) && !out.includes(s)) out.push(s);
    }
  }
  if (out.length === 0 || !out.includes(primary)) out.push(primary);
  return out;
}

function dedupRoles(list: string[]): string[] {
  const out: string[] = [];
  for (const s of list) if (s && !out.includes(s)) out.push(s);
  return out;
}