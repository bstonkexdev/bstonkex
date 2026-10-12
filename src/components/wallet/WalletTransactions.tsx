// Cupcak8 Swap — Wallet Transactions with filter tabs
import { useState, useEffect, memo } from 'react';
import { CHAINS, formatUsd, explorerTxUrl } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { getWalletTrades, type TrackedTrade } from '../../lib/engine/tx-tracker';
import ChainIcon from '../ChainIcon';

type TxFilter = 'all' | 'buy' | 'sell' | 'receive' | 'send' | 'approval' | 'pending' | 'confirmed' | 'failed';

const TX_TABS: { id: TxFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'buy', label: 'Buys' },
  { id: 'sell', label: 'Sells' },
  { id: 'receive', label: 'Receives' },
  { id: 'send', label: 'Sends' },
  { id: 'approval', label: 'Approvals' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'failed', label: 'Failed' },
];

interface Props {
  wallet: string | null;
  activeChain: ChainId;
  showAllChains: boolean;
}

export default memo(function WalletTransactions({ wallet, activeChain, showAllChains }: Props) {
  const [trades, setTrades] = useState<TrackedTrade[]>([]);
  const [filter, setFilter] = useState<TxFilter>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    getWalletTrades(wallet).then(t => { setTrades(t); setLoading(false); }).catch(() => setLoading(false));
  }, [wallet]);

  const filtered = trades.filter(t => {
    if (filter === 'buy' && t.side !== 'buy') return false;
    if (filter === 'sell' && t.side !== 'sell') return false;
    if (filter === 'receive' && t.side !== 'receive' && t.side !== 'deposit') return false;
    if (filter === 'send' && t.side !== 'send' && t.side !== 'withdraw') return false;
    if (filter === 'approval' && t.side !== 'approval') return false;
    if (filter === 'pending' && t.status !== 'pending') return false;
    if (filter === 'confirmed' && t.status !== 'confirmed') return false;
    if (filter === 'failed' && t.status !== 'failed') return false;
    if (!showAllChains && t.chainId !== activeChain) return false;
    return true;
  });

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>Loading transactions...</div>;
  }

  return (
    <div>
      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 12,
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}>
        {TX_TABS.map(t => {
          const isActive = filter === t.id;
          return (
            <button key={t.id} onClick={() => setFilter(t.id)} style={{
              padding: '7px 12px', fontSize: 10, fontWeight: 700,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: isActive ? '#E8547C' : 'var(--text-dim)',
              borderBottom: isActive ? '2px solid #E8547C' : '2px solid transparent',
              letterSpacing: '0.02em', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Transactions list */}
      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>No Transactions</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filter === 'all' ? 'No transaction history found.' : `No ${filter} transactions found.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.slice(0, 50).map((t, i) => {
            const chain = CHAINS[t.chainId];
            const time = new Date(t.timestamp);
            const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
            const statusColor = t.status === 'confirmed' ? 'var(--lime-dim)' : t.status === 'pending' ? 'var(--yellow-dim)' : 'var(--red)';
            const statusBg = t.status === 'confirmed' ? 'var(--lime-bg)' : t.status === 'pending' ? 'var(--yellow-bg)' : 'var(--red-bg)';

            const sideLabel = t.side === 'receive' || t.side === 'deposit' ? 'Receive'
              : t.side === 'send' || t.side === 'withdraw' ? 'Send'
              : t.side === 'approval' ? 'Approve'
              : t.side.charAt(0).toUpperCase() + t.side.slice(1);
            const sideColor = t.side === 'buy' || t.side === 'receive' || t.side === 'deposit' ? 'var(--lime-dim)'
              : t.side === 'approval' ? 'var(--yellow-dim)'
              : 'var(--red)';
            const sideBg = t.side === 'buy' || t.side === 'receive' || t.side === 'deposit' ? 'var(--lime-bg)'
              : t.side === 'approval' ? 'var(--yellow-bg)'
              : 'var(--red-bg)';

            return (
              <div key={`${t.id}-${i}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', background: 'var(--bg-surface)',
                transition: 'border-color 0.12s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-bright)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                    background: sideBg, color: sideColor,
                  }}>
                    {sideLabel}
                  </span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)' }}>{t.tokenSymbol}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ChainIcon chainId={t.chainId as ChainId} size={10} />
                      {chain?.shortName} · {timeStr}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-bright)' }}>
                    {formatUsd(t.amountUsd)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                      background: statusBg, color: statusColor,
                    }}>
                      {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                    </span>
                    {t.txHash && (
                      <a href={explorerTxUrl(t.chainId as ChainId, t.txHash)}
                        target="_blank" rel="noopener"
                        style={{
                          fontSize: 9, fontWeight: 700, color: '#E8547C',
                          textDecoration: 'none', padding: '2px 6px',
                          background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)',
                        }}>
                        TX ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});