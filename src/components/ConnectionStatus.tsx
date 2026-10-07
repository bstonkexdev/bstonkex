import { useState, useEffect } from 'react';
import { wsManager, type WsState } from '../lib/engine/realtime-ws';
import { getStreamState, getLastPollTime, getDataFreshness, getDataSource } from '../lib/engine/market-stream';

const STATE_COLORS: Record<WsState, string> = {
  connecting: 'var(--amber)',
  connected: 'var(--green)',
  reconnecting: 'var(--amber)',
  degraded: 'var(--amber)',
  disconnected: 'var(--red)',
};

const STATE_LABELS: Record<WsState, string> = {
  connecting: 'CONNECTING',
  connected: 'LIVE',
  reconnecting: 'RECONNECTING',
  degraded: 'DELAYED',
  disconnected: 'OFFLINE',
};

export default function ConnectionStatus() {
  const [wsState, setWsState] = useState<WsState>(wsManager.getState());
  const [latency, setLatency] = useState(wsManager.getLatency());
  const [streamState, setStreamState] = useState(getStreamState());
  const [lastPoll, setLastPoll] = useState(getLastPollTime());
  const [expanded, setExpanded] = useState(false);

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
  const freshnessColor: Record<string, string> = { LIVE: 'var(--green)', DELAYED: 'var(--amber)', RECONNECTING: 'var(--amber)', OFFLINE: 'var(--red)' };
  const color = freshnessColor[freshness] || STATE_COLORS[effectiveState];
  const label = freshness;
  const age = lastPoll > 0 ? Math.floor((Date.now() - lastPoll) / 1000) : null;

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setExpanded(v => !v)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4,
        fontFamily: 'var(--font)', fontSize: 7, color, padding: '2px 4px',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: color,
          boxShadow: effectiveState === 'connected' ? `0 0 4px ${color}` : 'none',
          animation: effectiveState === 'reconnecting' ? 'blink 1s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
        {age != null && age < 120 && <span style={{ color: 'var(--text-muted)' }}>· {age}s</span>}
      </button>

      {expanded && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          padding: 8, zIndex: 160, minWidth: 180,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 6, letterSpacing: '0.1em' }}>
            CONNECTION STATUS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>WEBSOCKET</span>
              <span style={{ color: STATE_COLORS[wsState], fontWeight: 700 }}>{STATE_LABELS[wsState]}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>DATA STREAM</span>
              <span style={{ color: STATE_COLORS[streamState], fontWeight: 700 }}>{STATE_LABELS[streamState]}</span>
            </div>
            {latency > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>LATENCY</span>
                <span style={{ fontWeight: 700 }}>{latency}ms</span>
              </div>
            )}
            {lastPoll > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>LAST POLL</span>
                <span style={{ fontWeight: 700 }}>{age}s ago</span>
              </div>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 4, fontSize: 7, color: 'var(--text-muted)' }}>
            {wsState === 'disconnected' && streamState === 'disconnected'
              ? 'MARKET DATA UNAVAILABLE'
              : wsState === 'disconnected' && streamState === 'connected'
              ? 'USING POLLING FALLBACK'
              : wsState === 'reconnecting'
              ? 'RECONNECTING TO STREAM...'
              : 'REAL-TIME MARKET DATA'}
          </div>
        </div>
      )}
    </div>
  );
}