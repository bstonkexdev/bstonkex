import { useState, useEffect } from 'react';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { onActivity, type MarketEvent, formatRelativeTime } from '../../lib/engine/activity-engine';
import { useApp } from '../../lib/context';
import ChainIcon from '../ChainIcon';

type EventCategory = 'all' | 'volume' | 'price' | 'liquidity' | 'new_market';

export default function MarketEvents() {
  const { setTradeToken } = useApp();
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [filter, setFilter] = useState<EventCategory>('all');

  useEffect(() => {
    // Collect all market events (not just trades)
    const unsub = onActivity(e => {
      // Include all event types — trades, price movements, volume spikes, liquidity events
      setEvents(prev => [e, ...prev].slice(0, 100));
    });
    return unsub;
  }, []);

  // Derive market events from activity feed
  const marketEvents = events.map(e => ({
    ...e,
    eventType: classifyEvent(e),
  }));

  const filtered = marketEvents.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'volume') return e.eventType === 'volume_spike';
    if (filter === 'price') return e.eventType === 'price_movement';
    if (filter === 'liquidity') return e.eventType === 'liquidity_change';
    if (filter === 'new_market') return e.eventType === 'new_market';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>MARKET EVENTS</span>
        <div style={{ flex: 1 }} />
        {(['all', 'volume', 'price', 'liquidity', 'new_market'] as EventCategory[]).map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-cyan' : ''}`}
            style={{ fontSize: 7, padding: '1px 4px' }}
            onClick={() => setFilter(f)}>
            {f === 'new_market' ? 'NEW' : f.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
            NO MARKET EVENTS
            <div style={{ fontSize: 7, marginTop: 4, color: 'var(--text-muted)' }}>
              Events will appear as market data is indexed
            </div>
          </div>
        )}

        {filtered.map(e => {
          const chain = CHAINS[e.chainId];
          return (
            <div key={e.id} style={{
              padding: '5px 8px', borderBottom: '1px solid rgba(22,40,72,0.3)',
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 9,
            }}
              onClick={() => {
                if (e.tokenAddress && e.tokenAddress !== 'NOT INDEXED')
                  setTradeToken({ chainId: e.chainId, address: e.tokenAddress, name: e.tokenSymbol, symbol: e.tokenSymbol });
              }}>
              {/* Event type badge */}
              <span style={{
                fontSize: 6, fontWeight: 800, padding: '0 3px', minWidth: 36, textAlign: 'center',
                border: `1px solid ${eventColor(e.eventType)}`,
                color: eventColor(e.eventType),
              }}>
                {eventLabel(e.eventType)}
              </span>
              {/* Chain */}
              <ChainIcon chainId={e.chainId as ChainId} size={10} />
              <span style={{ fontSize: 7, color: chain?.color, fontWeight: 700, minWidth: 24 }}>{chain?.shortName || '???'}</span>
              {/* Token */}
              <span style={{ fontWeight: 800, color: 'var(--text-bright)', minWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.tokenSymbol}</span>
              {/* Value */}
              <span style={{ fontWeight: 700, minWidth: 50, textAlign: 'right' }}>{formatUsd(e.amountUsd)}</span>
              {/* Side */}
              <span style={{ fontSize: 7, color: e.side === 'buy' ? 'var(--green)' : 'var(--red)', fontWeight: 700, minWidth: 24, textAlign: 'right' }}>
                {e.side === 'buy' ? 'BUY' : 'SELL'}
              </span>
              {/* Size */}
              {e.size !== 'small' && (
                <span style={{ fontSize: 6, fontWeight: 800, padding: '0 2px', border: `1px solid var(--cyan)`, color: 'var(--cyan)' }}>
                  {e.size.toUpperCase()}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {/* Time */}
              <span style={{ color: 'var(--text-muted)', fontSize: 7 }}>{formatRelativeTime(e.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function classifyEvent(e: MarketEvent): 'volume_spike' | 'price_movement' | 'liquidity_change' | 'new_market' | 'trade' {
  if (e.size === 'whale' || e.size === 'large') return 'volume_spike';
  if (e.amountUsd > 10000) return 'volume_spike';
  return 'trade';
}

function eventColor(type: string): string {
  switch (type) {
    case 'volume_spike': return 'var(--amber)';
    case 'price_movement': return 'var(--cyan)';
    case 'liquidity_change': return 'var(--green)';
    case 'new_market': return 'var(--text-bright)';
    default: return 'var(--text-dim)';
  }
}

function eventLabel(type: string): string {
  switch (type) {
    case 'volume_spike': return 'VOL';
    case 'price_movement': return 'PRICE';
    case 'liquidity_change': return 'LIQ';
    case 'new_market': return 'NEW';
    default: return 'TRADE';
  }
}