import { useState, useEffect } from 'react';
import TradeTape from './activity/TradeTape';
import WhaleActivity from './activity/WhaleActivity';
import LargeTrades from './activity/LargeTrades';
import MarketEvents from './activity/MarketEvents';
import AlertManager from './activity/AlertManager';
import { getStreamState } from '../lib/engine/market-stream';
import { getActivityStatus } from '../lib/engine/activity-engine';

type Tab = 'live' | 'large' | 'whales' | 'market' | 'alerts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: '⚡ LIVE TRADES' },
  { id: 'large', label: '▲ LARGE TRADES' },
  { id: 'whales', label: '🐋 WHALES' },
  { id: 'market', label: '◈ MARKET EVENTS' },
  { id: 'alerts', label: '🔔 ALERTS' },
];

export default function ActivityPage() {
  const [tab, setTab] = useState<Tab>('live');
  const [streamStatus, setStreamStatus] = useState(getStreamState());
  const [activityStatus, setActivityStatus] = useState(getActivityStatus());

  useEffect(() => {
    const iv = setInterval(() => {
      setStreamStatus(getStreamState());
      setActivityStatus(getActivityStatus());
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const isLive = streamStatus === 'connected' || activityStatus.status === 'live';
  const statusColor = isLive ? 'var(--green)' : streamStatus === 'reconnecting' ? 'var(--amber)' : 'var(--red)';
  const statusLabel = isLive ? 'LIVE' : streamStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE';

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        borderBottom: 'var(--pixel) solid var(--border)',
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          LIVE ACTIVITY
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 7, color: 'var(--text-dim)' }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: statusColor,
            boxShadow: isLive ? `0 0 4px ${statusColor}` : 'none',
            animation: isLive ? 'led-pulse 2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
          <span>MARKET ACTIVITY</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: 'var(--pixel) solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto',
        background: 'var(--bg-panel)',
      }}>
        {TABS.map(t => (
          <button key={t.id} style={{
            padding: '7px 12px', fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
            background: tab === t.id ? 'var(--bg)' : 'transparent',
            border: 'none', borderBottom: tab === t.id ? '2px solid var(--cyan)' : '2px solid transparent',
            color: tab === t.id ? 'var(--cyan)' : 'var(--text-dim)',
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'live' && <TradeTape />}
        {tab === 'large' && <LargeTrades />}
        {tab === 'whales' && <WhaleActivity />}
        {tab === 'market' && <MarketEvents />}
        {tab === 'alerts' && <AlertManager />}
      </div>
    </div>
  );
}