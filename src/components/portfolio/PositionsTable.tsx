import { useState } from 'react';
import { CHAINS, CONFIGURED_CHAINS, formatUsd, formatPct, formatNum } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { WalletBalance, TokenBalance } from '../../lib/engine/types';
import type { Position } from '../../lib/engine/pnl-engine';
import type { TradeToken } from '../../lib/context';
import ChainIcon from '../ChainIcon';

interface Props {
  allPortfolios: WalletBalance[];
  activeChain: ChainId;
  positions: Position[];
  hideZeroBalances: boolean;
  onToggleHideZero: () => void;
  onTrade: (t: TradeToken) => void;
}

interface FlatPosition {
  symbol: string; name: string; chainId: ChainId; address: string;
  balance: number; priceUsd: number | null; valueUsd: number | null;
  avgEntry: number | null; unrealizedPnl: number | null; unrealizedPct: number | null;
  change24h: number | null;
}

export default function PositionsTable({ allPortfolios, activeChain, positions, hideZeroBalances, onToggleHideZero, onTrade }: Props) {
  const [showAllChains, setShowAllChains] = useState(true);

  // Flatten all positions from portfolio data
  const flat: FlatPosition[] = [];
  const chains = showAllChains ? allPortfolios : allPortfolios.filter(c => c.chainId === activeChain);

  for (const c of chains) {
    // Native asset
    if (!hideZeroBalances || parseFloat(c.nativeBalance) > 0) {
      const pos = positions.find(p => p.chainId === c.chainId && p.tokenSymbol === c.nativeSymbol);
      flat.push({
        symbol: c.nativeSymbol, name: `${CHAINS[c.chainId]?.name || c.chainId} Native`, chainId: c.chainId,
        address: 'native', balance: parseFloat(c.nativeBalance), priceUsd: c.nativeBalanceUsd > 0 ? c.nativeBalanceUsd / parseFloat(c.nativeBalance) : null,
        valueUsd: c.nativeBalanceUsd, avgEntry: pos?.avgEntryPrice ?? null,
        unrealizedPnl: pos?.unrealizedPnl ?? null, unrealizedPct: pos?.unrealizedPct ?? null,
        change24h: null,
      });
    }
    // Token balances
    for (const t of c.tokens) {
      if (hideZeroBalances && t.balanceFormatted <= 0) continue;
      const pos = positions.find(p => p.chainId === c.chainId && p.tokenAddress.toLowerCase() === t.address.toLowerCase());
      flat.push({
        symbol: t.symbol, name: t.name, chainId: c.chainId, address: t.address,
        balance: t.balanceFormatted, priceUsd: t.priceUsd, valueUsd: t.valueUsd,
        avgEntry: pos?.avgEntryPrice ?? null, unrealizedPnl: pos?.unrealizedPnl ?? null,
        unrealizedPct: pos?.unrealizedPct ?? null, change24h: null,
      });
    }
  }

  // Sort by value descending
  flat.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const totalValue = flat.reduce((s, p) => s + (p.valueUsd ?? 0), 0);

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${showAllChains ? 'btn-cyan' : ''}`}
          style={{ fontSize: 8, padding: '2px 6px' }}
          onClick={() => setShowAllChains(true)}>ALL CHAINS</button>
        {!showAllChains && (
          <button className="btn btn-sm btn-cyan" style={{ fontSize: 8, padding: '2px 6px' }}
            onClick={() => setShowAllChains(false)}><ChainIcon chainId={activeChain} size={10} /> {CHAINS[activeChain]?.shortName}</button>
        )}
        {showAllChains && CONFIGURED_CHAINS.map(c => (
          <button key={c.id} className="btn btn-sm" style={{ fontSize: 7, padding: '2px 5px', borderColor: c.color, color: c.color }}
            onClick={() => { setShowAllChains(false); }}><ChainIcon chainId={c.id as ChainId} size={10} />{c.shortName}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" style={{ fontSize: 7, padding: '2px 5px' }}
          onClick={onToggleHideZero}>{hideZeroBalances ? 'SHOW ALL' : 'HIDE ZEROS'}</button>
        <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{flat.length} ASSETS · {formatUsd(totalValue)}</span>
      </div>

      {/* Desktop table */}
      <table className="data-table compact">
        <thead>
          <tr>
            <th>TOKEN</th><th>CHAIN</th><th className="right">BALANCE</th>
            <th className="right">PRICE</th><th className="right">VALUE</th>
            <th className="right">AVG ENTRY</th><th className="right">P&L</th>
            <th className="right">P&L %</th><th></th>
          </tr>
        </thead>
        <tbody>
          {flat.length === 0 && (
            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, fontSize: 9, color: 'var(--text-dim)' }}>
              {hideZeroBalances ? 'NO POSITIONS — Try showing all balances' : 'NO POSITIONS DETECTED'}
            </td></tr>
          )}
          {flat.map((p, i) => {
            const chain = CHAINS[p.chainId];
            const pnlColor = (p.unrealizedPnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
            return (
              <tr key={`${p.chainId}-${p.address}-${i}`}>
                <td>
                  <span style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)' }}>{p.symbol}</span>
                  <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>{p.name}</div>
                </td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <ChainIcon chainId={p.chainId as ChainId} size={11} />
                    <span className="badge" style={{ borderColor: chain?.color, color: chain?.color, fontSize: 7 }}>{chain?.shortName}</span>
                  </span>
                </td>
                <td className="right" style={{ fontWeight: 700 }}>{p.balance.toFixed(4)}</td>
                <td className="right">{p.priceUsd != null ? formatUsd(p.priceUsd) : 'PRICE UNAVAILABLE'}</td>
                <td className="right" style={{ fontWeight: 800, color: 'var(--text-bright)' }}>{p.valueUsd != null ? formatUsd(p.valueUsd) : '—'}</td>
                <td className="right">{p.avgEntry != null ? formatUsd(p.avgEntry) : '—'}</td>
                <td className="right" style={{ color: pnlColor, fontWeight: 700 }}>{p.unrealizedPnl != null ? formatUsd(p.unrealizedPnl) : '—'}</td>
                <td className="right" style={{ color: pnlColor }}>{p.unrealizedPct != null ? formatPct(p.unrealizedPct) : '—'}</td>
                <td>
                  <button className="btn btn-sm btn-green" style={{ fontSize: 7, padding: '2px 5px' }}
                    onClick={() => onTrade({ chainId: p.chainId, address: p.address, name: p.name, symbol: p.symbol })}>
                    TRADE
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {flat.map((p, i) => {
          const chain = CHAINS[p.chainId];
          return (
            <div key={`m-${p.chainId}-${p.address}-${i}`}
              style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}
              onClick={() => onTrade({ chainId: p.chainId, address: p.address, name: p.name, symbol: p.symbol })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 11, color: 'var(--text-bright)' }}>{p.symbol}</span>
                  <ChainIcon chainId={p.chainId as ChainId} size={12} />
                  <span className="badge" style={{ borderColor: chain?.color, color: chain?.color, fontSize: 7 }}>{chain?.shortName}</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 11 }}>{formatUsd(p.valueUsd)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 8, color: 'var(--text-dim)' }}>
                <span>{p.balance.toFixed(4)} @ {formatUsd(p.priceUsd)}</span>
                {p.unrealizedPnl != null && (
                  <span style={{ color: p.unrealizedPnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                    {formatUsd(p.unrealizedPnl)} ({formatPct(p.unrealizedPct)})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}