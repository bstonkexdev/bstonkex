// BSTONKEX Admin Preflight Panel — runs all pre-deployment checks
import { useState, useEffect } from 'react';
import { runPreflight, statusColor, statusIcon, type PreflightReport, type PreflightCheck, type CheckCategory } from '../../lib/engine/deploy-preflight';

const CATEGORY_LABELS: Record<CheckCategory, string> = {
  runtime: 'RUNTIME',
  environment: 'ENVIRONMENT',
  rpc: 'RPC ENDPOINTS',
  backend: 'BACKEND',
  domain: 'DOMAIN / TLS',
  wallet: 'WALLETS',
  security: 'SECURITY',
};

export default function PreflightPanel({ onResult }: { onResult?: (canDeploy: boolean, blockers: string[]) => void }) {
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<CheckCategory | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const r = await runPreflight();
      setReport(r);
      onResult?.(r.canDeploy, r.blockers);
    } catch { /* ignore */ }
    setRunning(false);
  };

  useEffect(() => { run(); }, []);

  const categories = report ? [...new Set(report.checks.map(c => c.category))] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          DEPLOYMENT PREFLIGHT
        </span>
        <button className="btn btn-sm btn-cyan" style={{ fontSize: 8 }} onClick={run} disabled={running}>
          {running ? 'CHECKING...' : 'RE-RUN'}
        </button>
        {report && (
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
            background: report.canDeploy ? 'rgba(0,255,100,0.15)' : 'rgba(255,60,60,0.15)',
            color: report.canDeploy ? 'var(--green)' : 'var(--red)',
          }}>
            {report.canDeploy ? 'ALL CHECKS PASS' : `${report.blockers.length} BLOCKER${report.blockers.length !== 1 ? 'S' : ''}`}
          </span>
        )}
      </div>

      {/* Summary bar */}
      {report && (
        <div style={{ display: 'flex', gap: 12, fontSize: 8, color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--green)' }}>✓ {report.readyCount}</span>
          {report.missingCount > 0 && <span style={{ color: 'var(--amber)' }}>○ {report.missingCount}</span>}
          {report.blockedCount > 0 && <span style={{ color: 'var(--text-muted)' }}>⊘ {report.blockedCount}</span>}
          {report.errorCount > 0 && <span style={{ color: 'var(--red)' }}>✗ {report.errorCount}</span>}
        </div>
      )}

      {/* Blockers */}
      {report && report.blockers.length > 0 && (
        <div style={{
          padding: 8, borderRadius: 4,
          background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.2)',
        }}>
          <div style={{ fontSize: 8, fontWeight: 900, color: 'var(--red)', marginBottom: 4, letterSpacing: '0.1em' }}>
            BLOCKERS
          </div>
          {report.blockers.map((b, i) => (
            <div key={i} style={{ fontSize: 8, color: 'var(--text)', paddingLeft: 8 }}>• {b}</div>
          ))}
        </div>
      )}

      {/* Checks by category */}
      {report && categories.map(cat => {
        const checks = report.checks.filter(c => c.category === cat);
        const isExpanded = expanded === cat;
        const catReady = checks.every(c => c.status === 'READY');
        
        return (
          <div key={cat} style={{ border: '1px solid var(--border)', borderRadius: 4 }}>
            <button
              onClick={() => setExpanded(isExpanded ? null : cat)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer',
                color: catReady ? 'var(--green)' : 'var(--text-bright)',
                fontSize: 8, fontWeight: 900, letterSpacing: '0.05em', textAlign: 'left',
              }}
            >
              <span>{catReady ? '✓' : '○'}</span>
              <span>{CATEGORY_LABELS[cat]}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 7 }}>
                {checks.filter(c => c.status === 'READY').length}/{checks.length}
              </span>
            </button>
            
            {isExpanded && (
              <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {checks.map(check => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckRow({ check }: { check: PreflightCheck }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ color: statusColor(check.status), fontSize: 9, minWidth: 12, textAlign: 'center' }}>
        {statusIcon(check.status)}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-bright)' }}>
          {check.name}
          {check.required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
        </div>
        <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>{check.detail}</div>
        {check.action && (
          <div style={{ fontSize: 7, color: 'var(--amber)', marginTop: 2 }}>→ {check.action}</div>
        )}
      </div>
      <span style={{
        fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
        color: statusColor(check.status),
        background: `${statusColor(check.status)}15`,
      }}>
        {check.status}
      </span>
    </div>
  );
}