// BSTONKEX Infrastructure Health Panel — Real-time health display for all components
import { useState, useEffect } from 'react';
import { getHealthReport, onHealthUpdate, statusColor, statusIcon, statusLabel, type InfraHealthReport, type ComponentHealth, type ChainHealth } from '../lib/engine/infra-health';
import { CHAINS } from '../lib/config';

function ComponentRow({ label, health }: { label: string; health: ComponentHealth }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 8 }}>
      <span style={{ color: statusColor(health.status), fontSize: 10 }}>{statusIcon(health.status)}</span>
      <span style={{ minWidth: 80, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ color: statusColor(health.status), fontWeight: 700, fontSize: 7 }}>{statusLabel(health.status)}</span>
      {health.latencyMs != null && <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{health.latencyMs}ms</span>}
      {health.errorMessage && <span style={{ color: 'var(--red)', marginLeft: 'auto', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={health.errorMessage}>{health.errorMessage}</span>}
    </div>
  );
}

function ChainSection({ chain }: { chain: ChainHealth }) {
  const cfg = CHAINS[chain.chainId];
  return (
    <div style={{ marginBottom: 8, padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg?.color || '#888' }} />
        <span style={{ fontWeight: 800, fontSize: 9, color: cfg?.color || 'var(--text-bright)' }}>{cfg?.name || chain.chainId}</span>
      </div>
      <ComponentRow label="RPC" health={chain.rpc} />
      <ComponentRow label="WebSocket" health={chain.websocket} />
      <ComponentRow label="Indexer" health={chain.indexer} />
      <ComponentRow label="Market Data" health={chain.marketData} />
      <ComponentRow label="Quote Service" health={chain.quoteService} />
    </div>
  );
}

export default function InfraHealthPanel() {
  const [report, setReport] = useState<InfraHealthReport>(getHealthReport());

  useEffect(() => onHealthUpdate(setReport), []);

  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: statusColor(report.overallStatus), fontSize: 12 }}>{statusIcon(report.overallStatus)}</span>
        <span style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)' }}>INFRASTRUCTURE HEALTH</span>
        <span style={{ marginLeft: 'auto', fontSize: 7, color: statusColor(report.overallStatus), fontWeight: 700 }}>{statusLabel(report.overallStatus)}</span>
      </div>
      {report.chains.map(c => <ChainSection key={c.chainId} chain={c} />)}
      <div style={{ padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}>
        <ComponentRow label="Cache" health={report.cache} />
        <ComponentRow label="Pipeline" health={report.pipeline} />
        <ComponentRow label="Frontend" health={report.frontend} />
      </div>
    </div>
  );
}