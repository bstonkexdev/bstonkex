import { useState, useEffect } from 'react';
import { CHAINS, explorerTxUrl, formatUsd, shortenAddress } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { onActivity, type MarketEvent, formatRelativeTime, classifyWalletLabel } from '../../lib/engine/activity-engine';
import { useApp } from '../../lib/context';
import ChainIcon from '../ChainIcon';

export default function WhaleActivity() {
  const { setTradeToken } = useApp();
  const [whales, setWhales] = useState<MarketEvent[]>([]);

  useEffect(() => {
    const unsub = onActivity(e => {
      if (e.size === 'whale' || e.size === 'large') {
        setWhales(prev => [e, ...prev].slice(0, 50));
      }
    });
    return unsub;
  }, []);

  if (whales.length === 0) {
    return (
      <div style={{ padding: 30, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
        <div style={{ fontSize: 14, marginBottom: 8, opacity: 0.3 }}>🐋</div>
        NO WHALE ACTIVITY DETECTED
        <div style={{ fontSize: 7, marginTop: 4, color: 'var(--text-muted)' }}>
          Large trades will appear here as they are indexed
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>WHALE ACTIVITY</span>
        <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>{whales.length} EVENTS</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {whales.map(e => {
          const chain = CHAINS[e.chainId];
          const isBuy = e.side === 'buy';
          const walletLabel = classifyWalletLabel(e.wallet, e.amountUsd);
          return (
            <div key={e.id} style={{
              padding: '6px 8px', borderBottom: '1px solid rgba(22,40,72,0.3)',
              display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer',
            }}
              onClick={() => {
                if (e.tokenAddress && e.tokenAddress !== 'NOT INDEXED')
                  setTradeToken({ chainId: e.chainId, address: e.tokenAddress, name: e.tokenSymbol, symbol: e.tokenSymbol });
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Side + Size */}
                <span style={{
                  fontSize: 7, fontWeight: 800, padding: '0 3px',
                  border: `1px solid ${e.size === 'whale' ? 'var(--cyan)' : isBuy ? 'var(--green)' : 'var(--red)'}`,
                  color: e.size === 'whale' ? 'var(--cyan)' : isBuy ? 'var(--green)' : 'var(--red)',
                }}>
                  {e.size === 'whale' ? '🐋 WHALE' : 'LARGE'} {isBuy ? 'BUY' : 'SELL'}
                </span>
                {/* Chain */}
                <ChainIcon chainId={e.chainId as ChainId} size={11} />
                <span style={{ fontSize: 7, color: chain?.color, fontWeight: 700 }}>{chain?.shortName}</span>
                {/* Token */}
                <span style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)' }}>{e.tokenSymbol}</span>
                <div style={{ flex: 1 }} />
                {/* Value */}
                <span style={{ fontWeight: 800, fontSize: 11, color: isBuy ? 'var(--green)' : 'var(--red)' }}>{formatUsd(e.amountUsd)}</span>
                {/* Time */}
                <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>{formatRelativeTime(e.timestamp)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 7, color: 'var(--text-dim)' }}>
                <span>WALLET: {e.wallet === 'NOT INDEXED' ? 'NOT INDEXED' : shortenAddress(e.wallet, 5)}</span>
                <span style={{ padding: '0 3px', border: '1px solid var(--text-muted)', fontSize: 6 }}>{walletLabel}</span>
                <span>DEX: {e.dex}</span>
                {e.txHash && (
                  <a href={explorerTxUrl(e.chainId, e.txHash)} target="_blank" rel="noopener"
                    style={{ color: 'var(--cyan)' }} onClick={ev => ev.stopPropagation()}>VIEW TX ↗</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}