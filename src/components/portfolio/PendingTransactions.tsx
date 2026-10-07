import { useState, useEffect } from 'react';
import { CHAINS, explorerTxUrl, shortenAddress } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { getActiveTrades, onTradeUpdate, type TradeExecution } from '../../lib/engine/trade-engine';
import ChainIcon from '../ChainIcon';

export default function PendingTransactions() {
  const [trades, setTrades] = useState<TradeExecution[]>([]);

  useEffect(() => {
    // Load initial active trades
    setTrades(getActiveTrades().filter(t => t.status !== 'confirmed' && t.status !== 'failed'));

    // Listen for updates
    const unsub = onTradeUpdate((trade) => {
      setTrades(prev => {
        const exists = prev.findIndex(t => t.id === trade.id);
        if (trade.status === 'confirmed' || trade.status === 'failed') {
          // Remove after a brief display
          setTimeout(() => setTrades(p => p.filter(t => t.id !== trade.id)), 5000);
        }
        if (exists >= 0) {
          const next = [...prev];
          next[exists] = trade;
          return next;
        }
        if (trade.status !== 'confirmed' && trade.status !== 'failed') {
          return [...prev, trade];
        }
        return prev;
      });
    });
    return unsub;
  }, []);

  if (trades.length === 0) return null;

  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="panel-header"><span className="led led-amber led-blink" /> PENDING TRANSACTIONS</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table compact">
          <thead><tr><th>ACTION</th><th>TOKEN</th><th>CHAIN</th><th className="right">AMOUNT</th><th>STATUS</th><th>TX</th></tr></thead>
          <tbody>
            {trades.map(t => {
              const chain = CHAINS[t.chainId];
              const elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
              return (
                <tr key={t.id}>
                  <td>
                    <span style={{
                      fontSize: 8, fontWeight: 800, padding: '1px 4px',
                      border: `1px solid ${t.side === 'buy' ? 'var(--green)' : 'var(--red)'}`,
                      color: t.side === 'buy' ? 'var(--green)' : 'var(--red)',
                    }}>{t.side.toUpperCase()}</span>
                  </td>
                  <td className="font-bold" style={{ color: 'var(--text-bright)' }}>{t.tokenSymbol}</td>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ChainIcon chainId={t.chainId as ChainId} size={11} /><span className="badge" style={{ borderColor: chain?.color, color: chain?.color, fontSize: 7 }}>{chain?.shortName}</span></span></td>
                  <td className="right">${t.amountUsd.toFixed(2)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="led-sm led-amber led-blink" />
                      <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--amber)' }}>{formatStatus(t.status)}</span>
                      <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>{elapsed}s</span>
                    </div>
                  </td>
                  <td>
                    {t.hash ? (
                      <a href={explorerTxUrl(t.chainId, t.hash)} target="_blank" rel="noopener"
                        style={{ fontSize: 8, color: 'var(--cyan)' }}>{shortenAddress(t.hash, 4)}</a>
                    ) : <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatStatus(s: TradeExecution['status']): string {
  switch (s) {
    case 'preparing': return 'PREPARING';
    case 'awaiting_approval': return 'APPROVAL NEEDED';
    case 'approving': return 'APPROVING';
    case 'awaiting_signature': return 'SIGN IN WALLET';
    case 'signing': return 'SIGNING';
    case 'submitting': return 'SUBMITTING';
    case 'pending': return 'PENDING';
    case 'confirmed': return 'CONFIRMED';
    case 'failed': return 'FAILED';
    default: return s.toUpperCase();
  }
}