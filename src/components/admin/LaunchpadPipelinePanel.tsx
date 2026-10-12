// Cupcak8 Swap — Launchpad Pipeline & Stage 3 Test Panel
// Runs historical ingestion, live indexer, and acceptance tests.
// No mock data — all results from real pipeline execution.
import { useState, useEffect, useCallback } from 'react';
import {
  runHistoricalIngestion,
  getAllIndexedLaunches,
  type PipelineReport,
} from '../../lib/engine/launchpad-pipeline';
import {
  startLiveIndexer,
  stopLiveIndexer,
  isLiveIndexerRunning,
  getSourceStatuses,
  type SourceStatus,
} from '../../lib/engine/launchpad-live-indexer';
import {
  runStage3Tests,
  type TestSuiteReport,
} from '../../lib/engine/launchpad-test-suite';
import { getEnabledFactories } from '../../lib/engine/launchpad-registry';
import type { LaunchpadEventRecord } from '../../lib/engine/launchpad-registry';

const D = {
  text: 'var(--text)', textSec: 'var(--text)', textMuted: 'var(--text-dim)',
  border: 'var(--border)', bgAlt: 'var(--bg-elevated)',
  gold: 'var(--yellow)', goldBg: 'var(--yellow-bg)',
  green: 'var(--green)', red: 'var(--red)', amber: '#D97706', blue: '#2563EB',
  mono: "var(--font-mono)",
} as const;

export default function LaunchpadPipelinePanel() {
  const [pipelineReport, setPipelineReport] = useState<PipelineReport | null>(null);
  const [testReport, setTestReport] = useState<TestSuiteReport | null>(null);
  const [launches, setLaunches] = useState<LaunchpadEventRecord[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [liveRunning, setLiveRunning] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLaunches(await getAllIndexedLaunches(50));
    setSourceStatuses(getSourceStatuses());
    setLiveRunning(isLiveIndexerRunning());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleIngest = async () => {
    setRunning('ingest');
    setError(null);
    try {
      const report = await runHistoricalIngestion();
      setPipelineReport(report);
      await refresh();
    } catch (e: any) { setError(e.message); }
    setRunning(null);
  };

  const handleTests = async () => {
    setRunning('tests');
    setError(null);
    try {
      const report = await runStage3Tests();
      setTestReport(report);
    } catch (e: any) { setError(e.message); }
    setRunning(null);
  };

  const handleToggleLive = () => {
    if (liveRunning) {
      stopLiveIndexer();
    } else {
      startLiveIndexer();
    }
    setTimeout(refresh, 500);
    setLiveRunning(!liveRunning);
  };

  const enabled = getEnabledFactories();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Action bar */}
      <div style={{
        border: `1px solid ${D.border}`, borderRadius: 6, overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 14px', background: D.bgAlt,
          borderBottom: `1px solid ${D.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: D.text, letterSpacing: '0.06em' }}>
              STAGE 3 PIPELINE
            </span>
            <span style={{
              fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 2,
              background: D.goldBg, color: D.gold,
            }}>
              {enabled.length} VERIFIED SOURCES
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleIngest} disabled={!!running} style={btnStyle(running === 'ingest', D.gold)}>
              {running === 'ingest' ? 'INGESTING...' : 'INGEST HISTORICAL'}
            </button>
            <button onClick={handleToggleLive} style={btnStyle(false, liveRunning ? D.red : D.green)}>
              {liveRunning ? 'STOP LIVE' : 'START LIVE'}
            </button>
            <button onClick={handleTests} disabled={!!running} style={btnStyle(running === 'tests', D.blue)}>
              {running === 'tests' ? 'TESTING...' : 'RUN TESTS'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '6px 14px', background: 'rgba(220,38,38,0.06)', fontSize: 9, color: D.red }}>
            {error}
          </div>
        )}

        {/* Pipeline results */}
        {pipelineReport && (
          <div style={{ padding: '8px 14px', borderBottom: `1px solid ${D.border}` }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: D.textSec, marginBottom: 4, letterSpacing: '0.04em' }}>
              INGESTION RESULTS — {pipelineReport.totalIngested} ingested, {pipelineReport.totalDuplicates} duplicates
            </div>
            {pipelineReport.results.map(r => (
              <div key={r.launchpadId} style={{ fontSize: 8, color: D.text, padding: '2px 0', display: 'flex', gap: 8 }}>
                <span style={{ fontWeight: 700, color: r.status === 'PASS' ? D.green : D.red, width: 32 }}>{r.status}</span>
                <span style={{ width: 100 }}>{r.launchpadId}</span>
                <span style={{ color: D.textSec }}>{r.chain.toUpperCase()}</span>
                <span>ingested={r.eventsIngested} dupes={r.duplicatesSkipped}</span>
                <span style={{ color: D.textMuted }}>checkpoint={r.checkpoint}</span>
                {r.errors.length > 0 && <span style={{ color: D.red }}>{r.errors[0]}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Source statuses */}
      {sourceStatuses.length > 0 && (
        <div style={{ border: `1px solid ${D.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: D.bgAlt, borderBottom: `1px solid ${D.border}`, fontSize: 9, fontWeight: 700, color: D.textSec, letterSpacing: '0.04em' }}>
            SOURCE STATUS
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['SOURCE', 'CHAIN', 'STATUS', 'BLOCK', 'LAG', 'INGESTED', 'DUPES', 'ERROR'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 7, fontWeight: 700, color: D.textMuted, borderBottom: `1px solid ${D.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sourceStatuses.map(s => (
                <tr key={s.factoryId}>
                  <td style={cellStyle}><span style={{ fontWeight: 700, fontSize: 8 }}>{s.factoryId}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 8 }}>{s.chain.toUpperCase()}</span></td>
                  <td style={cellStyle}><StatusBadge status={s.status} /></td>
                  <td style={cellStyle}><span style={{ fontSize: 8, fontFamily: D.mono }}>{s.latestBlock || '—'}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 8 }}>{s.lag > 0 ? `${s.lag} blocks` : '0'}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 8 }}>{s.eventsIngested}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 8 }}>{s.duplicatesRejected}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 7, color: D.red, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{s.lastError || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Indexed launches */}
      {launches.length > 0 && (
        <div style={{ border: `1px solid ${D.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: D.bgAlt, borderBottom: `1px solid ${D.border}`, fontSize: 9, fontWeight: 700, color: D.textSec, letterSpacing: '0.04em' }}>
            INDEXED LAUNCHES ({launches.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['LAUNCHPAD', 'CHAIN', 'TOKEN', 'CREATOR', 'TX', 'BLOCK', 'STATUS'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 7, fontWeight: 700, color: D.textMuted, borderBottom: `1px solid ${D.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {launches.slice(0, 10).map((e, i) => (
                <tr key={e.eventId || i}>
                  <td style={cellStyle}><span style={{ fontWeight: 700, fontSize: 8 }}>{e.launchpad}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 8 }}>{e.chain.toUpperCase()}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 7, fontFamily: D.mono }}>{e.tokenAddress.slice(0, 12)}...</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 7, fontFamily: D.mono }}>{e.creator === 'UNKNOWN' ? '—' : e.creator.slice(0, 10) + '...'}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 7, fontFamily: D.mono }}>{e.txHash.slice(0, 10)}...</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 8, fontFamily: D.mono }}>{e.blockNumber}</span></td>
                  <td style={cellStyle}><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Test results */}
      {testReport && (
        <div style={{ border: `1px solid ${D.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: D.bgAlt, borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: D.textSec, letterSpacing: '0.04em' }}>
              STAGE 3 ACCEPTANCE TESTS
            </span>
            <span style={{ fontSize: 8 }}>
              <span style={{ color: D.green, fontWeight: 700 }}>{testReport.passCount} PASS</span>
              <span style={{ color: D.textMuted, margin: '0 4px' }}>/</span>
              <span style={{ color: D.red, fontWeight: 700 }}>{testReport.failCount} FAIL</span>
              <span style={{ color: D.textMuted, margin: '0 4px' }}>/</span>
              <span style={{ color: D.amber }}>{testReport.notVerifiedCount} NOT VERIFIED</span>
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['TEST', 'LAUNCHPAD', 'CHAIN', 'STATUS', 'DETAIL'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 7, fontWeight: 700, color: D.textMuted, borderBottom: `1px solid ${D.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {testReport.tests.map(t => (
                <tr key={t.id}>
                  <td style={cellStyle}><span style={{ fontWeight: 700, fontSize: 8 }}>{t.name}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 8 }}>{t.launchpad}</span></td>
                  <td style={cellStyle}><span style={{ fontSize: 8 }}>{t.chain.toUpperCase()}</span></td>
                  <td style={cellStyle}><StatusBadge status={t.status} /></td>
                  <td style={cellStyle}><span style={{ fontSize: 7, color: D.textSec, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{t.detail}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!pipelineReport && !testReport && launches.length === 0 && (
        <div style={{ border: `1px solid ${D.border}`, borderRadius: 6, padding: '24px 14px', textAlign: 'center', fontSize: 10, color: D.textMuted }}>
          Click INGEST HISTORICAL to process the 3 verified launch events, then RUN TESTS for acceptance verification.
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    PASS: { bg: 'rgba(22,163,74,0.08)', fg: D.green },
    FAIL: { bg: 'rgba(220,38,38,0.08)', fg: D.red },
    LIVE: { bg: 'rgba(22,163,74,0.08)', fg: D.green },
    confirmed: { bg: 'rgba(22,163,74,0.08)', fg: D.green },
    CATCHING_UP: { bg: 'rgba(217,119,6,0.08)', fg: D.amber },
    STOPPED: { bg: 'rgba(200,200,200,0.2)', fg: D.textMuted },
    ERROR: { bg: 'rgba(220,38,38,0.08)', fg: D.red },
    NOT_VERIFIED: { bg: 'rgba(217,119,6,0.08)', fg: D.amber },
    SKIPPED: { bg: 'rgba(200,200,200,0.2)', fg: D.textMuted },
  };
  const c = colors[status] || colors.STOPPED;
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 2,
      background: c.bg, color: c.fg, letterSpacing: '0.03em',
    }}>
      {status.toUpperCase()}
    </span>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '5px 8px', borderBottom: `1px solid ${D.border}`, verticalAlign: 'top',
};

function btnStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '4px 10px', fontSize: 8, fontWeight: 700,
    background: active ? D.border : color,
    border: 'none', borderRadius: 3,
    color: active ? D.textMuted : '#000',
    cursor: active ? 'wait' : 'pointer',
    letterSpacing: '0.03em',
  };
}