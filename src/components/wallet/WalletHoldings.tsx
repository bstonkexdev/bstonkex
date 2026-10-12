// Cupcak8 Swap — Wallet Holdings Table + Mobile Cards
import { memo, useState } from 'react';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { WalletBalance } from '../../lib/engine/types';
import ChainIcon from '../ChainIcon';

type SortKey = 'value' | 'pnl' | '24h' | 'name';

interface FlatHolding {
  symbol: string; name: string; chainId: ChainId; address: string;
  balance: number; priceUsd: number | null; valueUsd: number;
  change24h: number | null; pnl: number | null;
}

interface Props {
  portfolios: WalletBalance[];
  activeChain: ChainId;
  showAllChains: boolean;
  hideZero: boolean;
  onTrade: (t: { chainId: ChainId; address: string; name: string; symbol: string }) => void;
}

export default memo(function WalletHoldings({ portfolios, activeChain, showAllChains, hideZero, onTrade }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('value');

  const chains = showAllChains ? portfolios : portfolios.filter(c => c.chainId === activeChain);
  const holdings: FlatHolding[] = [];

  for (const c of chains) {
    const nativeBal = parseFloat(c.nativeBalance);
    if (!hideZero || nativeBal > 0) {
      holdings.push({
        symbol: c.nativeSymbol, name: `${CHAINS[c.chainId]?.name || c.chainId} Native`,
        chainId: c.chainId as ChainId, address: 'native',
        balance: nativeBal, priceUsd: c.nativeBalanceUsd > 0 ? c.nativeBalanceUsd / nativeBal : null,
        valueUsd: c.nativeBalanceUsd, change24h: null, pnl: null,
      });
    }
    for (const t of c.tokens) {
      const bal = parseFloat(t.balance);
      if (!hideZero || bal > 0) {
        holdings.push({
          symbol: t.symbol, name: t.symbol, chainId: c.chainId as ChainId,
          address: t.address, balance: bal, priceUsd: t.priceUsd,
          valueUsd: t.balanceUsd, change24h: null, pnl: null,
        });
      }
    }
  }

  holdings.sort((a, b) => {
    if (sortBy === 'value') return b.valueUsd - a.valueUsd;
    if (sortBy === 'name') return a.symbol.localeCompare(b.symbol);
    if (sortBy === '24h') return (b.change24h ?? 0) - (a.change24h ?? 0);
    if (sortBy === 'pnl') return (b.pnl ?? 0) - (a.pnl ?? 0);
    return 0;
  });

  if (holdings.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>No Holdings</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {showAllChains ? 'No tokens found across connected chains.' : 'No tokens found on this chain.'}
        </div>
      </div>
    );
  }

  const totalValue = holdings.reduce((s, h) => s + h.valueUsd, 0);

  return (
    <div>
      {/* Sort selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Sort:</span>
        {([['value', 'Value'], ['name', 'Name'], ['24h', '24H'], ['pnl', 'P&L']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSortBy(k)} style={{
            padding: '3px 10px', fontSize: 10, fontWeight: 700,
            background: sortBy === k ? 'var(--green-bg)' : 'transparent',
            border: `1px solid ${sortBy === k ? '#E8547C' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: sortBy === k ? '#E8547C' : 'var(--text-dim)',
            transition: 'all 0.12s',
          }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{holdings.length} assets</span>
      </div>

      {/* Desktop table */}
      <div style={{ overflowX: 'auto' }} className="wallet-desktop-table">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th align="left">Token</Th>
              <Th align="center">Chain</Th>
              <Th align="right">Price</Th>
              <Th align="right">Balance</Th>
              <Th align="right">Value</Th>
              <Th align="right">24H</Th>
              <Th align="right">Alloc</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => {
              const chain = CHAINS[h.chainId];
              const isUp = (h.change24h ?? 0) >= 0;
              const alloc = totalValue > 0 ? (h.valueUsd / totalValue) * 100 : 0;

              return (
                <tr key={`${h.chainId}-${h.address}-${i}`}
                  style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)' }}>{h.symbol}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h.name}</span>
                    </div>
                  </Td>
                  <Td align="center">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                      <ChainIcon chainId={h.chainId} size={12} />
                      <span style={{ fontSize: 10, color: chain?.color || 'var(--text-muted)', fontWeight: 600 }}>
                        {chain?.shortName}
                      </span>
                    </div>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                      {formatUsd(h.priceUsd)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                      {h.balance > 0 ? h.balance.toFixed(4) : '0'}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-bright)' }}>
                      {formatUsd(h.valueUsd)}
                    </span>
                  </Td>
                  <Td align="right">
                    {h.change24h != null ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? 'var(--lime-dim)' : 'var(--red)' }}>
                        {isUp ? '+' : ''}{formatPct(h.change24h)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
                    )}
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                      {alloc.toFixed(1)}%
                    </span>
                  </Td>
                  <Td>
                    <button onClick={e => {
                      e.stopPropagation();
                      onTrade({ chainId: h.chainId, address: h.address, name: h.name, symbol: h.symbol });
                    }} style={{
                      padding: '4px 12px', background: '#E8547C', border: 'none',
                      borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 10, fontWeight: 700,
                      cursor: 'pointer', transition: 'background 0.12s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#D14068'}
                      onMouseLeave={e => e.currentTarget.style.background = '#E8547C'}
                    >Trade</button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="wallet-mobile-cards" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {holdings.map((h, i) => {
          const chain = CHAINS[h.chainId];
          const isUp = (h.change24h ?? 0) >= 0;
          const alloc = totalValue > 0 ? (h.valueUsd / totalValue) * 100 : 0;

          return (
            <div key={`m-${h.chainId}-${h.address}-${i}`}
              onClick={() => onTrade({ chainId: h.chainId, address: h.address, name: h.name, symbol: h.symbol })}
              style={{
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: 12, background: 'var(--bg-surface)', cursor: 'pointer',
                transition: 'border-color 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#E8547C'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ChainIcon chainId={h.chainId} size={14} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)' }}>{h.symbol}</span>
                  <span style={{ fontSize: 10, color: chain?.color || 'var(--text-muted)' }}>{chain?.shortName}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-bright)' }}>
                  {formatUsd(h.valueUsd)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                  {h.balance.toFixed(4)} @ {formatUsd(h.priceUsd)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {h.change24h != null && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: isUp ? 'var(--lime-dim)' : 'var(--red)' }}>
                      {isUp ? '+' : ''}{formatPct(h.change24h)}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{alloc.toFixed(1)}%</span>
                </div>
              </div>
              <button onClick={e => {
                e.stopPropagation();
                onTrade({ chainId: h.chainId, address: h.address, name: h.name, symbol: h.symbol });
              }} style={{
                width: '100%', padding: '8px', marginTop: 8,
                background: '#E8547C', border: 'none', borderRadius: 'var(--radius-sm)',
                color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.12s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#D14068'}
                onMouseLeave={e => e.currentTarget.style.background = '#E8547C'}
              >Trade</button>
            </div>
          );
        })}
      </div>

      <style>{`
        @media (max-width: 768px) { .wallet-desktop-table { display: none !important; } }
        @media (min-width: 769px) { .wallet-mobile-cards { display: none !important; } }
      `}</style>
    </div>
  );
});

function Th({ children, align }: { children: React.ReactNode; align?: string }) {
  return (
    <th style={{
      textAlign: (align as any) || 'left',
      padding: '8px 10px', fontSize: 10, fontWeight: 700,
      color: 'var(--text-muted)', textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)', letterSpacing: '0.04em',
    }}>{children}</th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: string }) {
  return (
    <td style={{
      textAlign: (align as any) || 'left',
      padding: '8px 10px', borderBottom: '1px solid var(--border)',
    }}>{children}</td>
  );
}