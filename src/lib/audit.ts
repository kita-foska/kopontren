import { db } from '@/db';

/** Snapshot user utk log audit (subset AppUser). `null` = event sistem. */
export type AuditUser = {
  id: number | null;
  username: string;
  display_name?: string;
  role?: string;
};

/**
 * Audit trail form objek (detail, dst. 2026-09-18): SIAPA + APA + DI MANA.
 * - userName/userRole = snapshot (bukan FK): history tetap utuh walau user
 *   dihapus atau role-nya berubah.
 * - fieldChanges = diff per-field {field: {before, after}} -> dicatat ke
 *   old_value/new_value JSON (UI audit menampilkan "lama → baru").
 * - req = opsional; IP (x-forwarded-for) & user-agent disimak utk forensik.
 */
export type AuditFields = {
  userId: number | null;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: number | null;
  fieldChanges?: Record<string, { before: unknown; after: unknown }>;
  req?: Request;
};

/** IP klien: x-forwarded-for (load balancer / Vercel) lalu x-real-ip. */
function ipOf(req?: Request): string {
  if (!req) return '';
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    ''
  );
}

function userAgentOf(req?: Request): string {
  if (!req) return '';
  return (req.headers.get('user-agent') || '').slice(0, 300);
}

function fieldToDiff(
  fieldChanges: Record<string, { before: unknown; after: unknown }> | undefined
): [string | null, string | null] {
  const j = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
  if (!fieldChanges || Object.keys(fieldChanges).length === 0) return [null, null];
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fieldChanges)) {
    before[k] = v.before;
    after[k] = v.after;
  }
  return [j(before), j(after)];
}

/**
 * Write one audit_log entry. Never throws: a failed audit write must not
 * block the business operation it records.
 *
 * Dua bentuk pemanggilan:
 *  1. OBJEK (disarankan):
 *     logAudit({ userId, userName, userRole, action, entity, entityId,
 *                fieldChanges, req })
 *  2. LEGACY (20+ route lama tetap jalan):
 *     logAudit(user, action, table, recordId, oldValue?, newValue?, req?)
 *     — user (AppUser) otomatis di-snapshot: display_name -> user_name,
 *       role -> user_role; req opsional utk IP/user-agent.
 */
export async function logAudit(
  userOrFields: AuditUser | null | AuditFields,
  action?: string,
  table?: string,
  recordId?: number | null,
  oldValue?: unknown,
  newValue?: unknown,
  req?: Request
): Promise<void> {
  try {
    let userId: number | null;
    let username: string;
    let userName: string; // snapshot display_name
    let userRole: string; // snapshot role
    let act: string;
    let entity: string;
    let entityId: number | null;
    let oldJ: string | null;
    let newJ: string | null;

    if (userOrFields !== null && typeof userOrFields === 'object' && 'action' in userOrFields) {
      // ── bentuk objek ──
      const f = userOrFields as AuditFields;
      userId = f.userId ?? null;
      username = f.userId ? String(f.userName || '').trim() || 'user#' + f.userId : 'system';
      userName = String(f.userName || '').trim();
      userRole = String(f.userRole || '');
      act = f.action;
      entity = f.entity;
      entityId = f.entityId ?? null;
      [oldJ, newJ] = fieldToDiff(f.fieldChanges);
      req = f.req;
    } else {
      // ── bentuk legacy ──
      const u = userOrFields as AuditUser | null;
      userId = u?.id ?? null;
      username = u?.username ?? 'system';
      userName = (u?.display_name ?? '').trim() || (u ? u.username : 'system');
      userRole = u?.role || '';
      act = action ?? '';
      entity = table ?? '';
      entityId = recordId ?? null;
      const j = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
      oldJ = j(oldValue);
      newJ = j(newValue);
    }

    const d = await db();
    await d
      .prepare(
        `INSERT INTO audit_log (user_id, username, user_name, user_role, action, table_name, record_id, old_value, new_value, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        username,
        userName,
        userRole,
        act,
        entity,
        entityId,
        oldJ,
        newJ,
        ipOf(req),
        userAgentOf(req),
        new Date().toISOString()
      );
  } catch (e) {
    console.warn('[audit] gagal menulis log:', e);
  }
}