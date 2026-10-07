import { useState, useEffect } from 'react';
import { CHAINS, explorerTxUrl, formatUsd, shortenAddress } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { onActivity, type MarketEvent, formatRelativeTime, sizeColor, sizeLabel } from '../../lib/engine/activity-engine';
import { useApp } from '../../lib/context';
import ChainIcon from '../ChainIcon';

export default function LargeTrades() {
  const { setTradeToken } = useApp();
  const [events, setEvents] = useState<MarketEvent[]>([]);

  useEffect(() => {
    const unsub = onActivity(e => {
      if (e.size === 'large' || e.size === 'whale') {
        setEvents(prev => [e, ...prev].slice(0, 80));
      }
    });
    return unsub;
  }, []);

  if (events.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
        NO LARGE TRADES DETECTED
        <div style={{ fontSize: 7, marginTop: 4, color: 'var(--text-muted)' }}>
          Large trades will appear here as they are indexed
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>LARGE TRADES</span>
        <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>{events.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Desktop table */}
        <div className="desktop-only-table">
          <table className="data-table compact" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>SIDE</th>
                <th>TOKEN</th>
                <th>CHAIN</th>
                <th className="right">USD VALUE</th>
                <th className="right">PRICE</th>
                <th>WALLET</th>
                <th>DEX</th>
                <th className="right">TIME</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => {
                const chain = CHAINS[e.chainId];
                const isBuy = e.side === 'buy';
                return (
                  <tr key={e.id} style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (e.tokenAddress && e.tokenAddress !== 'NOT INDEXED')
                        setTradeToken({ chainId: e.chainId, address: e.tokenAddress, name: e.tokenSymbol, symbol: e.tokenSymbol });
                    }}>
                    <td>
                      <span style={{
                        fontSize: 7, fontWeight: 800, padding: '0 3px',
                        border: `1px solid ${isBuy ? 'var(--green)' : 'var(--red)'}`,
                        color: isBuy ? 'var(--green)' : 'var(--red)',
                      }}>{isBuy ? 'BUY' : 'SELL'}</span>
                    </td>
                    <td style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)' }}>{e.tokenSymbol}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ChainIcon chainId={e.chainId as ChainId} size={10} /><span style={{ fontSize: 7, color: chain?.color, fontWeight: 700 }}>{chain?.shortName}</span></span></td>
                    <td className="right" style={{ fontWeight: 700, color: isBuy ? 'var(--green)' : 'var(--red)' }}>{formatUsd(e.amountUsd)}</td>
                    <td className="right" style={{ fontSize: 9 }}>{e.priceUsd != null ? formatUsd(e.priceUsd) : 'N/A'}</td>
                    <td style={{ fontSize: 8, color: 'var(--text-dim)' }}>{e.wallet === 'NOT INDEXED' ? '—' : shortenAddress(e.wallet, 3)}</td>
                    <td style={{ fontSize: 7, color: 'var(--text-muted)' }}>{e.dex}</td>
                    <td className="right" style={{ fontSize: 7, color: 'var(--text-muted)' }}>{formatRelativeTime(e.timestamp)}</td>
                    <td>
                      {e.size !== 'small' && (
                        <span style={{ fontSize: 6, fontWeight: 800, padding: '0 2px', border: `1px solid ${sizeColor(e.size)}`, color: sizeColor(e.size) }}>
                          {sizeLabel(e.size)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column' }}>
          {events.map(e => {
            const chain = CHAINS[e.chainId];
            const isBuy = e.side === 'buy';
            return (
              <div key={e.id} style={{
                padding: '6px 8px', borderBottom: '1px solid rgba(22,40,72,0.3)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3,
              }}
                onClick={() => {
                  if (e.tokenAddress && e.tokenAddress !== 'NOT INDEXED')
                    setTradeToken({ chainId: e.chainId, address: e.tokenAddress, name: e.tokenSymbol, symbol: e.tokenSymbol });
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 7, fontWeight: 800, padding: '0 3px',
                    border: `1px solid ${e.size === 'whale' ? 'var(--cyan)' : isBuy ? 'var(--green)' : 'var(--red)'}`,
                    color: e.size === 'whale' ? 'var(--cyan)' : isBuy ? 'var(--green)' : 'var(--red)',
                  }}>
                    {e.size === 'whale' ? '🐋' : '▲'} {isBuy ? 'BUY' : 'SELL'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ChainIcon chainId={e.chainId as ChainId} size={10} /><span style={{ fontSize: 7, color: chain?.color, fontWeight: 700 }}>{chain?.shortName}</span></span>
                  <span style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)' }}>{e.tokenSymbol}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontWeight: 800, fontSize: 10, color: isBuy ? 'var(--green)' : 'var(--red)' }}>{formatUsd(e.amountUsd)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 7, color: 'var(--text-dim)' }}>
                  <span>{e.wallet === 'NOT INDEXED' ? '—' : shortenAddress(e.wallet, 4)}</span>
                  <span>{e.dex}</span>
                  <span>{formatRelativeTime(e.timestamp)}</span>
                  {e.txHash && (
                    <a href={explorerTxUrl(e.chainId, e.txHash)} target="_blank" rel="noopener"
                      style={{ color: 'var(--cyan)' }} onClick={ev => ev.stopPropagation()}>TX ↗</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}