// BSTONKEX Terminal Status Bar — Bottom bar showing connection state, data freshness, latency
import { useState, useEffect } from 'react';
import { getHealthReport, onHealthUpdate, statusColor, statusIcon, type InfraHealthReport } from '../lib/engine/infra-health';
import { getPipelineState, onPipelineState, type PipelineState } from '../lib/engine/pipeline-orchestrator';
import { wsManager } from '../lib/engine/realtime-ws';
import { CHAINS, CONFIGURED_CHAINS } from '../lib/config';
import type { WsState } from '../lib/engine/realtime-ws';

export default function TerminalStatusBar() {
  const [health, setHealth] = useState<InfraHealthReport>(getHealthReport());
  const [pipeline, setPipeline] = useState<PipelineState>(getPipelineState());
  const [wsState, setWsState] = useState<WsState>(wsManager.getState());
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const un1 = onHealthUpdate(setHealth);
    const un2 = onPipelineState(setPipeline);
    const un3 = wsManager.onStateChange((s, l) => { setWsState(s); setLatency(l); });
    return () => { un1(); un2(); un3(); };
  }, []);

  const uptime = pipeline.startedAt ? Math.floor((Date.now() - pipeline.startedAt) / 1000) : 0;
  const uptimeStr = uptime > 3600 ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : uptime > 60 ? `${Math.floor(uptime / 60)}m ${uptime % 60}s` : `${uptime}s`;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 150,
      height: 22, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
      background: 'var(--bg-panel, #0a0a0f)', borderTop: '1px solid var(--border)',
      fontSize: 7, color: 'var(--text-dim)', letterSpacing: '0.06em', fontWeight: 600,
    }}>
      {/* Pipeline status */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: pipeline.phase === 'running' ? 'var(--green)' : pipeline.phase === 'degraded' ? 'var(--amber)' : 'var(--red)', boxShadow: pipeline.phase === 'running' ? '0 0 4px var(--green)' : 'none' }} />
        {pipeline.phase.toUpperCase()}
      </span>

      {/* WS state */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ color: wsState === 'connected' ? 'var(--green)' : wsState === 'connecting' || wsState === 'reconnecting' ? 'var(--amber)' : 'var(--red)' }}>●</span>
        WS: {wsState.toUpperCase()}
      </span>

      {/* Chain health dots */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {CONFIGURED_CHAINS.map(c => {
          const chainHealth = health.chains.find(ch => ch.chainId === c.id);
          const status = chainHealth?.rpc?.status || 'not_verified';
          return (
            <span key={c.id} title={`${c.name}: ${status}`} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: statusColor(status) }} />
              <span style={{ color: c.color, fontSize: 6 }}>{c.shortName}</span>
            </span>
          );
        })}
      </span>

      {/* Latency */}
      {latency > 0 && <span style={{ color: latency < 100 ? 'var(--green)' : latency < 300 ? 'var(--amber)' : 'var(--red)' }}>{latency}ms</span>}

      {/* Uptime */}
      <span style={{ marginLeft: 'auto' }}>UP {uptimeStr}</span>

      {/* Sequence */}
      <span style={{ color: 'var(--text-muted)' }}>#{pipeline.engines.length}E</span>
    </div>
  );
}