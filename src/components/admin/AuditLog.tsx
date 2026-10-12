// Cupcak8 Swap Audit Log — displays administrative actions
import { useState, useEffect } from 'react';
import { getAuditLog, type AuditEntry } from '../../lib/admin/admin-audit';

export default function AuditLog() {
  const [entries, setEntries] = useState<(AuditEntry & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const log = await getAuditLog(200);
      setEntries(log);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)' }}>
        Loading audit log...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.06em', marginBottom: 4 }}>
          AUDIT LOG
        </div>
        <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>
          All administrative actions are recorded. This log is stored in the admin_audit collection (inbox visibility — builder-only reads).
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{
          padding: 30, textAlign: 'center', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg)',
          fontSize: 8, color: 'var(--text-dim)',
        }}>
          No admin actions have been recorded yet. Actions will appear here when permissions are reviewed or system checks are performed.
        </div>
      ) : (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '140px 120px 1fr 100px',
            padding: '8px 12px', background: 'var(--bg-elevated)',
            fontSize: 6, fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '0.06em',
            borderBottom: '1px solid var(--border)',
          }}>
            <div>TIMESTAMP</div>
            <div>COLLECTION</div>
            <div>ACTION</div>
            <div>OUTCOME</div>
          </div>

          {/* Table Rows */}
          {entries.map(entry => (
            <div key={entry.id} style={{
              display: 'grid', gridTemplateColumns: '140px 120px 1fr 100px',
              padding: '6px 12px', borderBottom: '1px solid var(--border)',
              fontSize: 7, alignItems: 'center',
            }}>
              <div style={{ color: 'var(--text-dim)', fontSize: 6 }}>
                {new Date(entry.timestamp).toLocaleString()}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{entry.collection}</div>
              <div style={{ color: 'var(--text-dim)' }}>{entry.action}</div>
              <div style={{
                fontWeight: 700,
                color: entry.outcome.includes('Success') || entry.outcome.includes('verified')
                  ? 'var(--green)'
                  : entry.outcome.includes('Manual') || entry.outcome.includes('Needs')
                    ? 'var(--amber)'
                    : 'var(--text-dim)',
              }}>
                {entry.outcome.length > 20 ? entry.outcome.slice(0, 20) + '...' : entry.outcome}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div style={{
        padding: 8, borderRadius: 4,
        background: 'var(--cyan-bg)', border: '1px solid var(--cyan-bg)',
        fontSize: 6, color: 'var(--text-dim)', lineHeight: 1.7,
      }}>
        <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>SECURITY:</span> Audit records use inbox visibility —
        only the builder can read them. Ordinary users cannot view, edit, or delete audit entries.
        Records are append-only via the admin panel.
      </div>
    </div>
  );
}