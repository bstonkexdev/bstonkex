// Cupcak8 Swap — Network & Data Status Settings Section
import { useState, useEffect } from 'react';
import { wsManager, type WsState } from '../../lib/engine/realtime-ws';
import { getStreamState, getLastPollTime, getDataFreshness, getDataSource } from '../../lib/engine/market-stream';
import { CHAINS } from '../../lib/config';
import { useApp } from '../../lib/context';

const STATE_LABELS: Record<string, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  degraded: 'Degraded',
  disconnected: 'Disconnected',
};

const FRESHNESS_COLORS: Record<string, string> = {
  LIVE: 'var(--lime-dim)',
  DELAYED: 'var(--yellow-dim)',
  RECONNECTING: 'var(--yellow-dim)',
  OFFLINE: 'var(--red)',
};

export default function NetworkSection() {
  const { activeChain } = useApp();
  const [wsState, setWsState] = useState<WsState>(wsManager.getState());
  const [latency, setLatency] = useState(wsManager.getLatency());
  const [streamState, setStreamState] = useState(getStreamState());
  const [lastPoll, setLastPoll] = useState(getLastPollTime());

  useEffect(() => {
    const unsubWs = wsManager.onStateChange((state, lat) => {
      setWsState(state);
      setLatency(lat);
    });
    const iv = setInterval(() => {
      setStreamState(getStreamState());
      setLastPoll(getLastPollTime());
    }, 3000);
    return () => { unsubWs(); clearInterval(iv); };
  }, []);

  const freshness = getDataFreshness();
  const dataSource = getDataSource();
  const effectiveState = wsState === 'connected' ? 'connected' : streamState === 'connected' ? 'connected' : wsState;
  const statusColor = FRESHNESS_COLORS[freshness] || 'var(--text-dim)';
  const age = lastPoll > 0 ? Math.floor((Date.now() - lastPoll) / 1000) : null;
  const chain = CHAINS[activeChain];

  return (
    <div className="ref-card">
      <div className="ref-card-header">NETWORK & DATA</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StatusRow label="Status" value={freshness} color={statusColor} />
        <StatusRow label="WebSocket" value={STATE_LABELS[effectiveState] || effectiveState}
          color={effectiveState === 'connected' ? 'var(--lime-dim)' : 'var(--yellow-dim)'} />
        {latency > 0 && <StatusRow label="Latency" value={`${latency}ms`} />}
        {age != null && <StatusRow label="Last Update" value={`${age}s ago`} />}
        <StatusRow label="Data Source" value={dataSource || 'Market Stream'} />
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: '0.06em' }}>
          ACTIVE NETWORK
        </div>
        {chain && (
          <div style={{
            padding: '10px 12px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Chain</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#E8547C' }}>{chain.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Native Token</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-bright)' }}>{chain.nativeSymbol}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Explorer</span>
              <a href={chain.explorerUrl} target="_blank" rel="noopener"
                style={{ fontSize: 11, color: '#E8547C', textDecoration: 'none' }}>
                {chain.explorerName}
              </a>
            </div>
          </div>
        )}
      </div>

      {freshness === 'OFFLINE' && (
        <div style={{
          marginTop: 10, padding: '8px 12px', background: 'var(--red-bg)',
          border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)',
          fontSize: 10, color: 'var(--red)', lineHeight: 1.5,
        }}>
          Market data is currently unavailable. Some features may not work correctly.
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: color || 'var(--text-bright)' }}>{value}</span>
    </div>
  );
}