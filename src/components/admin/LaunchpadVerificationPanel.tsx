// Cupcak8 Swap — Launchpad Stage 2 Verification Panel
// Runs real blockchain verification and displays results.
// No mock data — all results come from live RPC queries.
import { useState, useEffect, useCallback } from 'react';
import { explorerTxUrl, type ChainId } from '../../lib/config';
import {
  runStage2Verification,
  getLastReport,
  getVerificationSummary,
  type VerificationReport,
  type VerificationResult,
} from '../../lib/engine/launchpad-verification';
import ChainIcon from '../ChainIcon';

const D = {
  text: 'var(--text)', textSec: 'var(--text)', textMuted: 'var(--text-dim)',
  border: 'var(--border)', bgAlt: 'var(--bg-elevated)', bg: 'var(--bg-deep)',
  gold: 'var(--yellow)', goldBg: 'var(--yellow-bg)',
  green: 'var(--green)', red: 'var(--red)', amber: '#D97706',
  mono: "var(--font-mono)",
} as const;

export default function LaunchpadVerificationPanel() {
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = getVerificationSummary();

  // Load last report on mount
  useEffect(() => {
    getLastReport().then(setReport).catch(() => {});
  }, []);

  const runVerification = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await runStage2Verification();
      setReport(result);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    }
    setRunning(false);
  }, []);

  return (
    <div style={{
      border: `1px solid ${D.border}`, borderRadius: 6, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', background: D.bgAlt,
        borderBottom: `1px solid ${D.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: D.text, letterSpacing: '0.06em' }}>
            STAGE 2 VERIFICATION
          </span>
          <span style={{
            fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 2,
            background: D.goldBg, color: D.gold,
          }}>
            HISTORICAL LAUNCH PROOF
          </span>
        </div>
        <button
          onClick={runVerification}
          disabled={running}
          style={{
            padding: '5px 12px', fontSize: 9, fontWeight: 700,
            background: running ? D.border : D.gold,
            border: 'none', borderRadius: 3,
            color: running ? D.textMuted : '#000',
            cursor: running ? 'wait' : 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          {running ? 'VERIFYING...' : 'RUN VERIFICATION'}
        </button>
      </div>

      {/* Summary stats */}
      <div style={{
        display: 'flex', gap: 16, padding: '8px 14px',
        borderBottom: `1px solid ${D.border}`,
        fontSize: 9, color: D.textMuted,
      }}>
        <span>ENABLED: <b style={{ color: D.text }}>{summary.enabled}</b></span>
        <span>WITH TOPICS: <b style={{ color: D.text }}>{summary.withTopics}</b></span>
        <span>WITH FACTORIES: <b style={{ color: D.text }}>{summary.withFactoryAddresses}</b></span>
        <span>SOLANA: <b style={{ color: D.text }}>{summary.solanaPrograms}</b></span>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 14px', background: 'rgba(220,38,38,0.06)',
          borderBottom: `1px solid ${D.border}`, fontSize: 10, color: D.red,
        }}>
          {error}
        </div>
      )}

      {/* Results table */}
      {report && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['LAUNCHPAD', 'CHAIN', 'STATUS', 'TX/SLOT', 'TOKEN', 'CREATOR', 'PERSISTED', 'DETAILS'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '6px 10px', fontSize: 8, fontWeight: 700,
                    color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em',
                    borderBottom: `1px solid ${D.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.results.map(r => (
                <VerificationRow key={r.launchpadId} result={r} />
              ))}
            </tbody>
          </table>

          {/* Report footer */}
          <div style={{
            padding: '8px 14px', borderTop: `1px solid ${D.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 9, color: D.textMuted,
          }}>
            <span>
              {report.passCount}/{report.totalCount} PASSED
              {report.failCount > 0 && (
                <span style={{ color: D.red, marginLeft: 8 }}>
                  {report.failCount} FAILED
                </span>
              )}
            </span>
            <span>
              {new Date(report.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* No report yet */}
      {!report && !running && !error && (
        <div style={{
          padding: '20px 14px', textAlign: 'center',
          fontSize: 10, color: D.textMuted,
        }}>
          Click RUN VERIFICATION to query real blockchain RPCs for historical launch evidence.
        </div>
      )}
    </div>
  );
}

function VerificationRow({ result }: { result: VerificationResult }) {
  const isPass = result.status === 'PASS';
  const statusColor = isPass ? D.green : D.red;
  const txUrl = result.chain !== 'solana' && result.txHash
    ? explorerTxUrl(result.chain, result.txHash)
    : result.chain === 'solana' && result.txHash
    ? `https://solscan.io/tx/${result.txHash}`
    : null;

  return (
    <tr style={{ opacity: isPass ? 1 : 0.7 }}>
      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${D.border}` }}>
        <span style={{ fontWeight: 700, fontSize: 10, color: D.text }}>
          {result.launchpadName}
        </span>
      </td>
      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${D.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <ChainIcon chainId={result.chain as ChainId} size={10} />
          <span style={{ fontSize: 9, color: D.textSec }}>{result.chain.toUpperCase()}</span>
        </div>
      </td>
      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${D.border}` }}>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
          background: isPass ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
          color: statusColor,
        }}>
          {result.status}
        </span>
      </td>
      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${D.border}` }}>
        {txUrl ? (
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 8, fontFamily: D.mono, color: D.gold,
              textDecoration: 'none',
            }}
          >
            {result.txHash.slice(0, 10)}...{result.txHash.slice(-6)}
          </a>
        ) : (
          <span style={{ fontSize: 8, fontFamily: D.mono, color: D.textMuted }}>
            {result.txHash ? result.txHash.slice(0, 16) + '...' : '—'}
          </span>
        )}
        {result.blockNumber > 0 && (
          <span style={{ fontSize: 7, color: D.textMuted, marginLeft: 4 }}>
            #{result.blockNumber}
          </span>
        )}
      </td>
      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${D.border}` }}>
        <span style={{ fontSize: 8, fontFamily: D.mono, color: D.text }}>
          {result.tokenAddress
            ? `${result.tokenAddress.slice(0, 8)}...${result.tokenAddress.slice(-4)}`
            : '—'}
        </span>
      </td>
      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${D.border}` }}>
        <span style={{ fontSize: 8, fontFamily: D.mono, color: D.textSec }}>
          {result.creator
            ? `${result.creator.slice(0, 8)}...${result.creator.slice(-4)}`
            : '—'}
        </span>
      </td>
      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${D.border}` }}>
        <span style={{
          fontSize: 8, fontWeight: 600,
          color: result.persisted ? D.green : D.textMuted,
        }}>
          {result.persisted ? 'YES' : 'NO'}
        </span>
      </td>
      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${D.border}` }}>
        <span style={{
          fontSize: 7, fontFamily: D.mono, color: D.textMuted,
          maxWidth: 180, display: 'inline-block',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {result.error || result.creationEvent || '—'}
        </span>
      </td>
    </tr>
  );
}
