import { useState, useEffect, useRef, useMemo } from 'react';
import { CHAINS, explorerTxUrl, formatUsd, shortenAddress } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { onActivity, type MarketEvent, formatRelativeTime, sizeColor, sizeLabel, startActivityPolling, stopActivityPolling, getActivityStatus } from '../../lib/engine/activity-engine';
import { useApp } from '../../lib/context';
import ChainIcon from '../ChainIcon';

let eventBuffer: MarketEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_MS = 200;

type Filter = 'all' | 'buys' | 'sells' | 'large' | 'whales';

export default function TradeTape() {
  const { setTradeToken } = useApp();
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [chainFilter, setChainFilter] = useState<ChainId | 'all'>('all');
  const [status, setStatus] = useState(getActivityStatus());

  useEffect(() => {
    startActivityPolling(20000);
    const unsub = onActivity(e => {
      eventBuffer.push(e);
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          const batch = eventBuffer.splice(0);
          flushTimer = null;
          if (batch.length > 0) {
            setEvents(prev => [...batch, ...prev].slice(0, 150));
          }
        }, BATCH_MS);
      }
    });
    const iv = setInterval(() => setStatus(getActivityStatus()), 5000);
    return () => { unsub(); stopActivityPolling(); clearInterval(iv); if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } };
  }, []);

  const filtered = useMemo(() => events.filter(e => {
    if (filter === 'buys' && e.side !== 'buy') return false;
    if (filter === 'sells' && e.side !== 'sell') return false;
    if (filter === 'large' && e.size !== 'large') return false;
    if (filter === 'whales' && e.size !== 'whale') return false;
    if (chainFilter !== 'all' && e.chainId !== chainFilter) return false;
    return true;
  }), [events, filter, chainFilter]);

  const statusColor = status.status === 'live' ? 'var(--green)' : status.status === 'delayed' ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Filters */}
      <div style={{
        display: 'flex', gap: 3, alignItems: 'center',
        padding: '5px 8px', borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>TRADES</span>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, marginLeft: 2 }} />
        <span style={{ fontSize: 7, color: statusColor, fontWeight: 700 }}>{status.status.toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 4 }} />
        {(['all', 'buys', 'sells', 'large', 'whales'] as Filter[]).map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-cyan' : ''}`}
            style={{ fontSize: 7, padding: '1px 4px' }}
            onClick={() => setFilter(f)}>{f.toUpperCase()}</button>
        ))}
        <div style={{ width: 1, height: 10, background: 'var(--border)', margin: '0 1px', flexShrink: 0 }} />
        {(['all', 'bsc', 'solana', 'base', 'robinhood'] as const).map(c => (
          <button key={c} className={`btn btn-sm ${chainFilter === c ? 'btn-cyan' : ''}`}
            style={{ fontSize: 7, padding: '1px 3px' }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
            onClick={() => setChainFilter(c)}>{c === 'all' ? 'ALL' : <><ChainIcon chainId={c} size={10} />{CHAINS[c]?.shortName || c}</>}</button>
        ))}
      </div>

      {/* Trade list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
            {status.status === 'offline' ? 'MARKET DATA OFFLINE' : 'NO TRADES MATCHING FILTERS'}
          </div>
        )}
        {/* Desktop rows */}
        <div className="desktop-only-table">
          {filtered.map(e => {
            const chain = CHAINS[e.chainId];
            const isBuy = e.side === 'buy';
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 6px', borderBottom: '1px solid rgba(22,40,72,0.3)',
                cursor: 'pointer', fontSize: 9,
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
                <ChainIcon chainId={e.chainId as ChainId} size={10} />
                <span style={{ fontSize: 7, color: chain?.color || 'var(--text-dim)', fontWeight: 700, minWidth: 24 }}>{chain?.shortName || '???'}</span>
                <span style={{ fontWeight: 800, color: 'var(--text-bright)', minWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.tokenSymbol}</span>
                <span style={{ fontWeight: 700, minWidth: 56, textAlign: 'right', color: isBuy ? 'var(--green)' : 'var(--red)' }}>{formatUsd(e.amountUsd)}</span>
                <span style={{ color: 'var(--text-dim)', minWidth: 48, textAlign: 'right' }}>{e.priceUsd != null ? formatUsd(e.priceUsd) : 'N/A'}</span>
                {e.size !== 'small' && (
                  <span style={{ fontSize: 6, fontWeight: 800, padding: '0 2px', border: `1px solid ${sizeColor(e.size)}`, color: sizeColor(e.size) }}>
                    {sizeLabel(e.size)}
                  </span>
                )}
                <span style={{ color: 'var(--text-dim)', fontSize: 7, minWidth: 48 }}>{e.wallet === 'NOT INDEXED' ? '—' : shortenAddress(e.wallet, 3)}</span>
                <span style={{ fontSize: 6, color: e.source === 'bstonkex' ? 'var(--cyan)' : 'var(--text-muted)', fontWeight: 700 }}>
                  {e.source === 'bstonkex' ? 'BSTONKEX' : e.dex}
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 7, minWidth: 24, textAlign: 'right' }}>{formatRelativeTime(e.timestamp)}</span>
                {e.txHash && (
                  <a href={explorerTxUrl(e.chainId, e.txHash)} target="_blank" rel="noopener"
                    style={{ fontSize: 6, color: 'var(--cyan)' }} onClick={ev => ev.stopPropagation()}>↗</a>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile cards */}
        <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map(e => {
            const chain = CHAINS[e.chainId];
            const isBuy = e.side === 'buy';
            return (
              <div key={e.id} style={{
                padding: '5px 8px', borderBottom: '1px solid rgba(22,40,72,0.3)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
              }}
                onClick={() => {
                  if (e.tokenAddress && e.tokenAddress !== 'NOT INDEXED')
                    setTradeToken({ chainId: e.chainId, address: e.tokenAddress, name: e.tokenSymbol, symbol: e.tokenSymbol });
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    fontSize: 7, fontWeight: 800, padding: '0 3px',
                    border: `1px solid ${isBuy ? 'var(--green)' : 'var(--red)'}`,
                    color: isBuy ? 'var(--green)' : 'var(--red)',
                  }}>{isBuy ? 'BUY' : 'SELL'}</span>
                  <ChainIcon chainId={e.chainId as ChainId} size={11} />
                  <span style={{ fontSize: 7, color: chain?.color, fontWeight: 700 }}>{chain?.shortName}</span>
                  <span style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.tokenSymbol}</span>
                  {e.size !== 'small' && (
                    <span style={{ fontSize: 6, fontWeight: 800, padding: '0 2px', border: `1px solid ${sizeColor(e.size)}`, color: sizeColor(e.size) }}>
                      {sizeLabel(e.size)}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontWeight: 800, fontSize: 10, color: isBuy ? 'var(--green)' : 'var(--red)' }}>{formatUsd(e.amountUsd)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 7, color: 'var(--text-dim)' }}>
                  <span>{e.priceUsd != null ? formatUsd(e.priceUsd) : 'N/A'}</span>
                  <span>{e.wallet === 'NOT INDEXED' ? '—' : shortenAddress(e.wallet, 4)}</span>
                  <span style={{ color: e.source === 'bstonkex' ? 'var(--cyan)' : 'var(--text-muted)', fontWeight: 700 }}>
                    {e.source === 'bstonkex' ? 'BSTONKEX' : e.dex}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: 'var(--text-muted)' }}>{formatRelativeTime(e.timestamp)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}