// BSTONKEX Admin Pipeline Monitor — Engine states, data flow, event throughput
import { useState, useEffect } from 'react';
import { getPipelineState, onPipelineState, type PipelineState } from '../../lib/engine/pipeline-orchestrator';
import { getWsGatewayStats } from '../../lib/engine/ws-gateway';
import { getMarketPipelineStatus } from '../../lib/engine/market-pipeline';
import { cacheStats } from '../../lib/engine/cache';
import { statusColor, statusIcon, statusLabel } from '../../lib/engine/infra-health';

export default function PipelineMonitor() {
  const [pipeline, setPipeline] = useState<PipelineState>(getPipelineState());
  const [wsStats, setWsStats] = useState(getWsGatewayStats());
  const [cache, setCache] = useState(cacheStats());
  const [market, setMarket] = useState(getMarketPipelineStatus());

  useEffect(() => {
    const unsub = onPipelineState(setPipeline);
    const iv = setInterval(() => {
      setWsStats(getWsGatewayStats());
      setCache(cacheStats());
      setMarket(getMarketPipelineStatus());
    }, 5000);
    return () => { unsub(); clearInterval(iv); };
  }, []);

  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: statusColor(pipeline.phase === 'running' ? 'live' : pipeline.phase === 'degraded' ? 'delayed' : 'offline') }}>
          {statusIcon(pipeline.phase === 'running' ? 'live' : pipeline.phase === 'degraded' ? 'delayed' : 'offline')}
        </span>
        PIPELINE MONITOR
        <span style={{ marginLeft: 'auto', fontSize: 7, color: 'var(--text-dim)' }}>UPTIME: {pipeline.uptime > 0 ? `${Math.floor(pipeline.uptime / 1000)}s` : '—'}</span>
      </div>

      {/* Engine Status */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 7, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.1em' }}>ENGINES</div>
        {pipeline.engines.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 8 }}>
            <span style={{ color: statusColor(e.status), fontSize: 10 }}>{statusIcon(e.status)}</span>
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{e.name}</span>
            <span style={{ marginLeft: 'auto', color: statusColor(e.status), fontSize: 7 }}>{statusLabel(e.status)}</span>
            {e.error && <span style={{ color: 'var(--red)', fontSize: 7, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.error}>{e.error}</span>}
          </div>
        ))}
      </div>

      {/* Market Pipeline */}
      <div style={{ marginBottom: 8, padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}>
        <div style={{ fontSize: 7, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.1em' }}>MARKET PIPELINE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 8 }}>
          <span style={{ color: market.running ? 'var(--green)' : 'var(--red)' }}>●</span>
          <span>{market.running ? 'RUNNING' : 'STOPPED'}</span>
          {market.error && <span style={{ color: 'var(--red)', marginLeft: 'auto', fontSize: 7 }}>{market.error}</span>}
        </div>
      </div>

      {/* WS Gateway Stats */}
      <div style={{ marginBottom: 8, padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}>
        <div style={{ fontSize: 7, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.1em' }}>WS GATEWAY</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 8 }}>
          <span>Channels: <b>{wsStats.channels}</b></span>
          <span>Subscribers: <b>{wsStats.subscribers}</b></span>
          <span>Sequence: <b>#{wsStats.sequence}</b></span>
        </div>
      </div>

      {/* Cache Stats */}
      <div style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}>
        <div style={{ fontSize: 7, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.1em' }}>CACHE</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 8 }}>
          <span>Size: <b>{cache.size}</b></span>
          <span>Hits: <b>{cache.hits}</b></span>
          <span>Misses: <b>{cache.misses}</b></span>
          <span>Hit Rate: <b>{Math.round(cache.hitRate * 100)}%</b></span>
        </div>
      </div>
    </div>
  );
}