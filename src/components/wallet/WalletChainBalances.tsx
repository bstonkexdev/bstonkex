// Cupcak8 Swap — Wallet Chain Balances
// Warm cream cards with pink selected state
import { memo } from 'react';
import { CHAINS, formatUsd } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { WalletBalance } from '../../lib/engine/types';
import ChainIcon from '../ChainIcon';

interface Props {
  portfolios: WalletBalance[];
  activeChain: ChainId;
  onChainSelect: (chain: ChainId) => void;
}

export default memo(function WalletChainBalances({ portfolios, activeChain, onChainSelect }: Props) {
  if (portfolios.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>
        No chain data available. Connect a wallet to view balances.
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: 8,
    }}>
      {portfolios.map(p => {
        const chain = CHAINS[p.chainId];
        if (!chain) return null;
        const bal = parseFloat(p.nativeBalance);
        const isActive = p.chainId === activeChain;

        return (
          <div key={p.chainId} onClick={() => onChainSelect(p.chainId as ChainId)}
            style={{
              border: `1px solid ${isActive ? '#E8547C' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: 12, cursor: 'pointer',
              background: isActive ? 'var(--green-bg)' : 'var(--bg-surface)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border-bright)'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <ChainIcon chainId={p.chainId as ChainId} size={16} />
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: isActive ? '#E8547C' : 'var(--text-bright)',
              }}>
                {chain.shortName}
              </span>
            </div>
            <div style={{
              fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-bright)', marginBottom: 2,
            }}>
              {bal > 0 ? bal.toFixed(4) : '0'} {chain.nativeSymbol}
            </div>
            <div style={{
              fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600,
              color: p.nativeBalanceUsd > 0 ? 'var(--text)' : 'var(--text-muted)',
            }}>
              {formatUsd(p.nativeBalanceUsd)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {p.tokens.length} token{p.tokens.length !== 1 ? 's' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
});