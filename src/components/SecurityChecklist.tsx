import type { SecurityCheck, CheckStatus } from '../lib/engine/security-engine';
import { statusIcon, statusColor } from '../lib/engine/security-engine';

interface Props {
  checks: SecurityCheck[];
  compact?: boolean;
  showPassed?: boolean;
}

export default function SecurityChecklist({ checks, compact, showPassed = false }: Props) {
  const displayChecks = showPassed ? checks : checks.filter(c => c.status !== 'pass');

  if (checks.length === 0) return null;

  const passCount = checks.filter(c => c.status === 'pass').length;
  const warnCount = checks.filter(c => c.status === 'warning').length;
  const blockCount = checks.filter(c => c.status === 'block').length;

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {checks.map(c => (
          <span key={c.id} title={`${c.check}: ${c.message}`} style={{
            fontSize: 7, fontWeight: 700, padding: '0 3px',
            border: `1px solid ${statusColor(c.status)}`,
            color: statusColor(c.status), cursor: 'default',
          }}>
            {statusIcon(c.status)} {c.check}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      {/* Summary bar */}
      <div style={{
        padding: '4px 8px', display: 'flex', gap: 8, alignItems: 'center',
        borderBottom: '1px solid var(--border)', fontSize: 8,
      }}>
        <span style={{ fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.08em' }}>SECURITY</span>
        <div style={{ flex: 1 }} />
        {passCount > 0 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ {passCount}</span>}
        {warnCount > 0 && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ {warnCount}</span>}
        {blockCount > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>✗ {blockCount}</span>}
      </div>

      {/* Check rows */}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {displayChecks.map(c => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
            borderBottom: '1px solid rgba(22,40,72,0.2)', fontSize: 8,
          }}>
            <span style={{ color: statusColor(c.status), fontWeight: 800, minWidth: 10, textAlign: 'center' }}>
              {statusIcon(c.status)}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 60 }}>{c.check}</span>
            <span style={{ flex: 1, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.message}
            </span>
            <span style={{ fontSize: 6, color: 'var(--text-muted)', flexShrink: 0 }}>{c.source}</span>
          </div>
        ))}
        {displayChecks.length === 0 && showPassed && (
          <div style={{ padding: 8, textAlign: 'center', fontSize: 8, color: 'var(--green)' }}>
            ALL CHECKS PASSED
          </div>
        )}
      </div>
    </div>
  );
}

/** Minimal inline security status badge */
export function SecurityBadge({ status, label }: { status: CheckStatus; label?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 7, fontWeight: 700, color: statusColor(status),
    }}>
      <span style={{
        width: 4, height: 4, borderRadius: '50%',
        background: statusColor(status),
        boxShadow: status === 'pass' ? `0 0 3px ${statusColor(status)}` : 'none',
      }} />
      {label}
    </span>
  );
}