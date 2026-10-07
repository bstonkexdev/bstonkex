// BSTONKEX Component Card — Per-infrastructure-component status, deploy, verify, logs
import { useState } from 'react';
import { statusColor, statusLabel, type InfraComponent, type ComponentStatus } from '../../lib/engine/infra-state';

interface Props {
  component: InfraComponent;
  actionResult?: { success: boolean; detail: string };
  onDeploy?: () => void;
  onVerify?: () => void;
}

export default function ComponentCard({ component: c, actionResult, onDeploy, onVerify }: Props) {
  const [expanded, setExpanded] = useState(false);
  const color = statusColor(c.status);
  const isRunning = c.status === 'DEPLOYING' || c.status === 'VERIFYING';

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      {/* Header Row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          cursor: 'pointer', flexWrap: 'wrap',
        }}
      >
        {/* Status Dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
          boxShadow: isRunning ? `0 0 6px ${color}` : 'none',
          animation: isRunning ? 'pulse 1.5s infinite' : 'none',
        }} />

        {/* Name + Category */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.05em' }}>
            {c.name}
          </div>
          <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>
            {c.category.toUpperCase()} · v{c.version}
          </div>
        </div>

        {/* Status Badge */}
        <span style={{
          fontSize: 6, fontWeight: 900, padding: '2px 6px', borderRadius: 3,
          background: `${color}22`, color, letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
        }}>
          {statusLabel(c.status)}
        </span>

        {/* Expand Arrow */}
        <span style={{ fontSize: 8, color: 'var(--text-muted)', transform: expanded ? 'rotate(90deg)' : '' }}>▸</span>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, paddingTop: 8 }}>
          {/* Description */}
          <div style={{ fontSize: 8, color: 'var(--text)', lineHeight: 1.5 }}>{c.description}</div>

          {/* Dependencies */}
          {c.dependencies.length > 0 && (
            <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 700 }}>Dependencies:</span> {c.dependencies.join(', ')}
            </div>
          )}

          {/* External Requirement */}
          {c.externalRequirement && (
            <div style={{
              padding: '6px 8px', borderRadius: 4, fontSize: 7, lineHeight: 1.5,
              background: 'rgba(170,102,255,0.08)', border: '1px solid rgba(170,102,255,0.2)',
              color: '#aa66ff',
            }}>
              <span style={{ fontWeight: 900 }}>EXTERNAL:</span> {c.externalRequirement}
            </div>
          )}

          {/* Action Result */}
          {actionResult && (
            <div style={{
              padding: '6px 8px', borderRadius: 4, fontSize: 7, lineHeight: 1.5,
              background: actionResult.success ? 'rgba(0,255,100,0.08)' : 'rgba(255,48,96,0.08)',
              border: `1px solid ${actionResult.success ? 'rgba(0,255,100,0.2)' : 'rgba(255,48,96,0.2)'}`,
              color: actionResult.success ? 'var(--green)' : 'var(--red)',
            }}>
              {actionResult.detail}
            </div>
          )}

          {/* Last Error */}
          {c.lastError && (
            <div style={{ fontSize: 7, color: 'var(--red)', lineHeight: 1.4 }}>
              Error: {c.lastError}
            </div>
          )}

          {/* Timestamps */}
          <div style={{ display: 'flex', gap: 12, fontSize: 7, color: 'var(--text-muted)' }}>
            {c.lastDeployment && <span>Deployed: {new Date(c.lastDeployment).toLocaleTimeString()}</span>}
            {c.lastVerified && <span>Verified: {new Date(c.lastVerified).toLocaleTimeString()}</span>}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {onDeploy && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeploy(); }}
                disabled={isRunning}
                style={{
                  padding: '5px 10px', borderRadius: 4, border: '1px solid var(--cyan)',
                  background: isRunning ? 'var(--border)' : 'rgba(0,221,255,0.1)',
                  color: isRunning ? 'var(--text-muted)' : 'var(--cyan)',
                  fontSize: 7, fontWeight: 900, cursor: isRunning ? 'default' : 'pointer',
                  letterSpacing: '0.05em',
                }}
              >
                {isRunning ? 'RUNNING...' : '▶ DEPLOY'}
              </button>
            )}
            {onVerify && (
              <button
                onClick={(e) => { e.stopPropagation(); onVerify(); }}
                disabled={isRunning}
                style={{
                  padding: '5px 10px', borderRadius: 4, border: '1px solid var(--green)',
                  background: isRunning ? 'var(--border)' : 'rgba(0,255,100,0.1)',
                  color: isRunning ? 'var(--text-muted)' : 'var(--green)',
                  fontSize: 7, fontWeight: 900, cursor: isRunning ? 'default' : 'pointer',
                  letterSpacing: '0.05em',
                }}
              >
                ✓ VERIFY
              </button>
            )}
          </div>

          {/* Recent Logs */}
          {c.logs.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 7, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 4 }}>RECENT LOGS</div>
              <div style={{ maxHeight: 100, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {c.logs.slice(0, 5).map(log => (
                  <div key={log.id} style={{
                    fontSize: 6, fontFamily: 'var(--font-mono)', padding: '2px 4px', borderRadius: 2,
                    background: 'var(--bg-alt, rgba(0,0,0,0.2))',
                    color: log.status === 'success' ? 'var(--green)' : log.status === 'failure' ? 'var(--red)' : 'var(--text-muted)',
                  }}>
                    {new Date(log.timestamp).toLocaleTimeString()} [{log.action}] {log.detail}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}