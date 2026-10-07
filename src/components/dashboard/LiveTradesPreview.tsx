import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { CHAINS, formatUsd } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { onActivity, type MarketEvent, formatRelativeTime, startActivityPolling, stopActivityPolling } from '../../lib/engine/activity-engine';
import ChainIcon from '../ChainIcon';

export default function LiveTradesPreview() {
  const { setPage, setTradeToken } = useApp();
  const [events, setEvents] = useState<MarketEvent[]>([]);

  useEffect(() => {
    startActivityPolling(20000);
    const unsub = onActivity(e => setEvents(prev => [e, ...prev].slice(0, 20)));
    return () => { unsub(); };
  }, []);

  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="panel-header">
        <span className="led led-green led-blink" />
        LIVE TRADES
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" style={{ fontSize: 7, padding: '1px 4px' }}
          onClick={() => setPage('activity')}>VIEW ALL</button>
      </div>
      {events.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
          CONNECTING TO MARKET DATA...
        </div>
      )}
      {events.slice(0, 10).map(e => {
        const chain = CHAINS[e.chainId];
        const isBuy = e.side === 'buy';
        return (
          <div key={e.id} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
            borderBottom: '1px solid rgba(22,40,72,0.3)', cursor: 'pointer', fontSize: 9,
          }}
            onClick={() => {
              if (e.tokenAddress && e.tokenAddress !== 'NOT INDEXED')
                setTradeToken({ chainId: e.chainId, address: e.tokenAddress, name: e.tokenSymbol, symbol: e.tokenSymbol });
            }}>
            <span style={{
              fontSize: 7, fontWeight: 800, padding: '0 3px', minWidth: 28, textAlign: 'center',
              border: `1px solid ${isBuy ? 'var(--green)' : 'var(--red)'}`,
              color: isBuy ? 'var(--green)' : 'var(--red)',
            }}>{isBuy ? 'BUY' : 'SELL'}</span>
            <span style={{ fontWeight: 800, color: 'var(--text-bright)', minWidth: 40 }}>{e.tokenSymbol}</span>
            <span style={{ fontWeight: 700, color: isBuy ? 'var(--green)' : 'var(--red)', minWidth: 50, textAlign: 'right' }}>{formatUsd(e.amountUsd)}</span>
            <ChainIcon chainId={e.chainId as ChainId} size={10} />
            <span style={{ fontSize: 7, color: chain?.color, fontWeight: 700, minWidth: 24 }}>{chain?.shortName}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 7, minWidth: 24, textAlign: 'right' }}>{formatRelativeTime(e.timestamp)}</span>
          </div>
        );
      })}
    </div>
  );
}