import { useState, useEffect } from 'react';
import { CHAINS, CONFIGURED_CHAINS, type ChainId } from '../lib/config';
import { validateChain, type ChainValidationResult, type ValidationStatus } from '../lib/engine/chain-validation';
import { isSandboxed } from '../lib/engine/sandbox';
import ChainIcon from './ChainIcon';

const STATUS_COLORS: Record<ValidationStatus, string> = {
  PASS: 'var(--green)',
  FAIL: 'var(--red)',
  NOT_VERIFIED: 'var(--amber)',
  BLOCKED: 'var(--text-muted)',
};

const STATUS_ICONS: Record<ValidationStatus, string> = {
  PASS: '✓',
  FAIL: '✗',
  NOT_VERIFIED: '?',
  BLOCKED: '⊘',
};

export default function ChainValidationPanel() {
  const [results, setResults] = useState<ChainValidationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<ChainId | null>(null);
  const sandbox = isSandboxed();

  const runValidation = async () => {
    setLoading(true);
    try {
      const all = await Promise.allSettled(
        CONFIGURED_CHAINS.map(c => validateChain(c.id as ChainId))
      );
      setResults(all.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<ChainValidationResult>).value));
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => { runValidation(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-bright)' }}>CHAIN VALIDATION</span>
        <button className="btn btn-sm btn-cyan" style={{ fontSize: 8 }} onClick={runValidation} disabled={loading}>
          {loading ? 'VALIDATING...' : 'RE-VALIDATE'}
        </button>
        {sandbox && <span style={{ fontSize: 8, color: 'var(--amber)' }}>PREVIEW MODE — RPC BLOCKED</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {results.map(r => {
          const chain = CHAINS[r.chainId];
          return (
            <div key={r.chainId} style={{
              border: `1px solid ${STATUS_COLORS[r.overallStatus]}`,
              padding: 8, cursor: 'pointer',
              background: expanded === r.chainId ? 'var(--bg-panel-alt)' : 'var(--bg-panel)',
            }} onClick={() => setExpanded(expanded === r.chainId ? null : r.chainId)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: STATUS_COLORS[r.overallStatus],
                  boxShadow: r.overallStatus === 'PASS' ? `0 0 4px ${STATUS_COLORS[r.overallStatus]}` : 'none',
                }} />
                <ChainIcon chainId={chain.id as ChainId} size={16} />
                <span style={{ fontWeight: 800, color: chain.color, fontSize: 11 }}>{chain.name}</span>
                <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{chain.shortName}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: STATUS_COLORS[r.overallStatus] }}>
                  {r.overallStatus}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, fontSize: 8, color: 'var(--text-dim)' }}>
                <span style={{ color: 'var(--green)' }}>✓ {r.passCount}</span>
                {r.failCount > 0 && <span style={{ color: 'var(--red)' }}>✗ {r.failCount}</span>}
                {r.notVerifiedCount > 0 && <span style={{ color: 'var(--amber)' }}>? {r.notVerifiedCount}</span>}
              </div>

              {expanded === r.chainId && (
                <div style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                  {r.checks.map(c => (
                    <div key={c.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, padding: '2px 0', fontSize: 8 }}>
                      <span style={{ color: STATUS_COLORS[c.status], fontWeight: 800, minWidth: 12 }}>{STATUS_ICONS[c.status]}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 70 }}>{c.name}</span>
                      <span style={{ color: 'var(--text-dim)', flex: 1, wordBreak: 'break-word' }}>{c.detail}</span>
                      {c.latencyMs != null && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{c.latencyMs}ms</span>}
                    </div>
                  ))}
                  <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 4 }}>
                    Last validated: {new Date(r.lastValidated).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {results.length === 0 && !loading && (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 10 }}>
          No validation results. Click RE-VALIDATE to check chains.
        </div>
      )}
    </div>
  );
}