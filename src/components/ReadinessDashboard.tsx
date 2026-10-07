import { useState, useEffect } from 'react';
import { CHAINS, CONFIGURED_CHAINS, type ChainId } from '../lib/config';
import { runFullValidation, verdictIcon, verdictColor, type FinalReadinessReport, type RuntimeCheck, type Verdict } from '../lib/engine/runtime-validation';
import { isSandboxed } from '../lib/engine/sandbox';
import ChainIcon from './ChainIcon';

const VERDICT_ORDER: Record<Verdict, number> = { FAIL: 0, NOT_VERIFIED: 1, BLOCKED: 2, PASS: 3 };

export default function ReadinessDashboard() {
  const [report, setReport] = useState<FinalReadinessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedChain, setExpandedChain] = useState<ChainId | null>(null);
  const [showBlockers, setShowBlockers] = useState(true);
  const sandbox = isSandboxed();

  const runValidation = async () => {
    setLoading(true);
    try {
      const r = await runFullValidation();
      setReport(r);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { runValidation(); }, []);

  const allChecks = report ? [...report.chains.flatMap(c => c.checks), ...report.globalChecks] : [];
  const passCount = allChecks.filter(c => c.verdict === 'PASS').length;
  const failCount = allChecks.filter(c => c.verdict === 'FAIL').length;
  const nvCount = allChecks.filter(c => c.verdict === 'NOT_VERIFIED').length;
  const blockedCount = allChecks.filter(c => c.verdict === 'BLOCKED').length;

  const blockers = allChecks.filter(c => c.blocker);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          PRODUCTION READINESS AUDIT
        </span>
        <button className="btn btn-sm btn-cyan" style={{ fontSize: 8 }} onClick={runValidation} disabled={loading}>
          {loading ? 'RUNNING...' : 'RE-RUN'}
        </button>
        {sandbox && <span style={{ fontSize: 8, color: 'var(--amber)', fontWeight: 700 }}>PREVIEW MODE — RPC BLOCKED</span>}
      </div>

      {/* Overall Status */}
      {report && (
        <div style={{
          border: `2px solid ${verdictColor(report.overallStatus)}`,
          padding: 10, display: 'flex', alignItems: 'center', gap: 10,
          background: `color-mix(in srgb, ${verdictColor(report.overallStatus)} 5%, var(--bg-panel))`,
        }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: verdictColor(report.overallStatus) }}>
            {verdictIcon(report.overallStatus)}
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: verdictColor(report.overallStatus) }}>
              {report.overallStatus === 'PASS' ? 'ALL CHECKS PASSED' :
               report.overallStatus === 'FAIL' ? 'VALIDATION FAILURES DETECTED' :
               report.overallStatus === 'BLOCKED' ? 'NETWORK BLOCKED (PREVIEW)' :
               'PARTIALLY VERIFIED — SOME CHECKS NOT VERIFIED'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
              ✓ {passCount} pass · {failCount > 0 ? `✗ ${failCount} fail · ` : ''}{nvCount > 0 ? `? ${nvCount} not verified · ` : ''}{blockedCount > 0 ? `⊘ ${blockedCount} blocked · ` : ''}
              Generated {new Date(report.generatedAt).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* Blockers */}
      {showBlockers && blockers.length > 0 && (
        <div style={{ border: '1px solid var(--amber)', padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>
            NOT VERIFIED — BLOCKERS ({blockers.length})
          </div>
          {blockers.map((c, i) => (
            <div key={i} style={{ fontSize: 8, color: 'var(--text-dim)', padding: '2px 0', display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--amber)', fontWeight: 800, flexShrink: 0 }}>?</span>
              <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 80 }}>{c.category}</span>
              <span style={{ color: 'var(--text-dim)' }}>{c.blocker}</span>
            </div>
          ))}
        </div>
      )}

      {/* Per-Chain Results */}
      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {report.chains.map(chain => {
            const cfg = CHAINS[chain.chainId];
            const isExpanded = expandedChain === chain.chainId;
            const sorted = [...chain.checks].sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]);

            return (
              <div key={chain.chainId} style={{
                border: `1px solid ${verdictColor(chain.overallVerdict)}`,
                cursor: 'pointer',
                background: isExpanded ? 'var(--bg-panel-alt)' : 'var(--bg-panel)',
              }} onClick={() => setExpandedChain(isExpanded ? null : chain.chainId)}>
                <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: verdictColor(chain.overallVerdict),
                    boxShadow: chain.overallVerdict === 'PASS' ? `0 0 4px ${verdictColor(chain.overallVerdict)}` : 'none',
                  }} />
                  <ChainIcon chainId={cfg.id as ChainId} size={14} />
                  <span style={{ fontWeight: 800, color: cfg.color, fontSize: 11 }}>{cfg.name}</span>
                  <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{cfg.shortName}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 8, color: verdictColor(chain.overallVerdict), fontWeight: 800 }}>
                    {chain.overallVerdict}
                  </span>
                  <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>
                    ✓{chain.passCount} {chain.failCount > 0 ? `✗${chain.failCount} ` : ''}{chain.notVerifiedCount > 0 ? `?${chain.notVerifiedCount} ` : ''}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '4px 8px' }}>
                    {sorted.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, padding: '2px 0', fontSize: 8 }}>
                        <span style={{ color: verdictColor(c.verdict), fontWeight: 800, minWidth: 12, flexShrink: 0 }}>{verdictIcon(c.verdict)}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 60, flexShrink: 0 }}>{c.check}</span>
                        <span style={{ color: 'var(--text-dim)', flex: 1, wordBreak: 'break-word' }}>{c.detail}</span>
                        {c.latencyMs != null && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{c.latencyMs}ms</span>}
                      </div>
                    ))}
                    {chain.checks.some(c => c.blocker) && (
                      <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)', fontSize: 7, color: 'var(--amber)' }}>
                        BLOCKERS: {chain.checks.filter(c => c.blocker).map(c => c.blocker).join('; ')}
                      </div>
                    )}
                    <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 4 }}>
                      Last run: {new Date(chain.lastRun).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Global Checks */}
      {report && report.globalChecks.length > 0 && (
        <div style={{ border: '1px solid var(--border)', padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 4 }}>GLOBAL CHECKS</div>
          {report.globalChecks.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, padding: '2px 0', fontSize: 8 }}>
              <span style={{ color: verdictColor(c.verdict), fontWeight: 800, minWidth: 12 }}>{verdictIcon(c.verdict)}</span>
              <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 80 }}>{c.check}</span>
              <span style={{ color: 'var(--text-dim)', flex: 1 }}>{c.detail}</span>
            </div>
          ))}
        </div>
      )}

      {report && (
        <div style={{ fontSize: 7, color: 'var(--text-muted)', textAlign: 'center', padding: 4 }}>
          Verification performed against real infrastructure · No mocks · No fixtures · Blockchain is source of truth
        </div>
      )}
    </div>
  );
}