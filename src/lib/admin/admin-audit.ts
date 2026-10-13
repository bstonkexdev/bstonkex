// Cupcak8 Swap Admin Audit Log — tracks all administrative actions
// Uses 'inbox' visibility — only the builder can read audit records
import { gitlawb } from '../gitlawb';

export interface AuditEntry {
  adminAddress: string;
  collection: string;
  action: string;
  outcome: string;
  timestamp: string;
}

const auditLog = gitlawb.db.collection<any>('admin_audit', { visibility: 'inbox' });

/** Record an admin action to the audit log. */
export async function logAdminAction(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
  try {
    await auditLog.create({ ...entry, timestamp: new Date().toISOString() });
  } catch {
    // Non-fatal: audit logging should never block admin actions
    console.warn('[admin-audit] Failed to write audit entry');
  }
}

/** Read all audit log entries (builder-only — works in preview, gated in production). */
export async function getAuditLog(limit = 100): Promise<(AuditEntry & { id: string })[]> {
  try {
    const { records } = await auditLog.list({ limit, sort: 'timestamp:desc' });
    return records.map(r => ({ id: r.id, ...r.data }));
  } catch {
    return [];
  }
}