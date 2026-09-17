import { db } from '@/db';

/**
 * Write one audit_log entry. Never throws: a failed audit write must not
 * block the business operation it records.
 */
export async function logAudit(
  user: { id: number; username: string } | null,
  action: string,
  table: string,
  recordId: number | null,
  oldValue?: unknown,
  newValue?: unknown
): Promise<void> {
  try {
    const d = await db();
    const now = new Date().toISOString();
    const j = (v?: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
    await d
      .prepare(
        `INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user?.id ?? null,
        user?.username ?? 'system',
        action,
        table,
        recordId,
        j(oldValue),
        j(newValue),
        now
      );
  } catch (e) {
    console.warn('[audit] gagal menulis log:', e);
  }
}