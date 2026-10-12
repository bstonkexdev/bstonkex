// Cupcak8 Swap — Pending Transactions (live tracking)
import { useState, useEffect } from 'react';
import { CHAINS, explorerTxUrl, shortenAddress } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { getActiveTrades, onTradeUpdate, type TradeExecution } from '../../lib/engine/trade-engine';
import ChainIcon from '../ChainIcon';

export default function PendingTransactions() {
  const [trades, setTrades] = useState<TradeExecution[]>([]);

  useEffect(() => {
    setTrades(getActiveTrades().filter(t => t.status !== 'confirmed' && t.status !== 'failed'));

    const unsub = onTradeUpdate((trade) => {
      setTrades(prev => {
        const exists = prev.findIndex(t => t.id === trade.id);
        if (trade.status === 'confirmed' || trade.status === 'failed') {
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
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: 'var(--yellow-bg)',
    }}>
      <div style={{
        padding: '10px 20px', fontSize: 11, fontWeight: 700,
        color: 'var(--yellow-dim)', display: 'flex', alignItems: 'center', gap: 6,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--yellow)', animation: 'pulse-dot 1.5s ease-in-out infinite',
        }} />
        Pending Transactions
      </div>
      <div style={{ overflowX: 'auto', padding: '8px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {trades.map(t => {
            const chain = CHAINS[t.chainId];
            const elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '2px 8px',
                    border: `1px solid ${t.side === 'buy' ? '#E8547C' : 'var(--red)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: t.side === 'buy' ? '#E8547C' : 'var(--red)',
                  }}>{t.side.toUpperCase()}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)' }}>{t.tokenSymbol}</span>
                  <ChainIcon chainId={t.chainId as ChainId} size={12} />
                  <span style={{ fontSize: 10, color: chain?.color || 'var(--text-muted)', fontWeight: 600 }}>
                    {chain?.shortName}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-bright)' }}>
                    ${t.amountUsd.toFixed(2)}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--yellow-dim)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'var(--yellow)', animation: 'pulse-dot 1.5s ease-in-out infinite',
                    }} />
                    {formatStatus(t.status)} · {elapsed}s
                  </span>
                  {t.hash && (
                    <a href={explorerTxUrl(t.chainId, t.hash)} target="_blank" rel="noopener"
                      style={{
                        fontSize: 10, fontWeight: 700, color: '#E8547C',
                        textDecoration: 'none', padding: '2px 8px',
                        background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)',
                      }}>
                      {shortenAddress(t.hash, 4)} ↗
                    </a>
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

function formatStatus(s: TradeExecution['status']): string {
  switch (s) {
    case 'preparing': return 'Preparing';
    case 'awaiting_approval': return 'Approval Needed';
    case 'approving': return 'Approving';
    case 'awaiting_signature': return 'Sign in Wallet';
    case 'signing': return 'Signing';
    case 'submitting': return 'Submitting';
    case 'pending': return 'Pending';
    case 'confirmed': return 'Confirmed';
    case 'failed': return 'Failed';
    default: return s.charAt(0).toUpperCase() + s.slice(1);
  }
}