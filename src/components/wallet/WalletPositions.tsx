// Cupcak8 Swap — Wallet Positions (open positions with P&L)
import { memo } from 'react';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { Position } from '../../lib/engine/pnl-engine';
import ChainIcon from '../ChainIcon';

interface Props {
  positions: Position[];
  activeChain: ChainId;
  showAllChains: boolean;
}

export default memo(function WalletPositions({ positions, activeChain, showAllChains }: Props) {
  const filtered = showAllChains
    ? positions
    : positions.filter(p => p.chainId === activeChain);

  if (filtered.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>No Open Positions</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Positions are tracked from Cupcak8 Swap trades.
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th align="left">Token</Th>
            <Th align="center">Chain</Th>
            <Th align="right">Entry</Th>
            <Th align="right">Current</Th>
            <Th align="right">Size</Th>
            <Th align="right">P&L</Th>
            <Th align="right">P&L %</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p, i) => {
            const chain = CHAINS[p.chainId];
            const isProfit = (p.unrealizedPnl ?? 0) >= 0;

            return (
              <tr key={`${p.chainId}-${p.tokenAddress}-${i}`}
                style={{ transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Td>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)' }}>{p.tokenSymbol}</span>
                </Td>
                <Td align="center">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                    <ChainIcon chainId={p.chainId as ChainId} size={12} />
                    <span style={{ fontSize: 10, color: chain?.color || 'var(--text-muted)', fontWeight: 600 }}>
                      {chain?.shortName}
                    </span>
                  </div>
                </Td>
                <Td align="right">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                    {p.avgEntryPrice != null ? formatUsd(p.avgEntryPrice) : '—'}
                  </span>
                </Td>
                <Td align="right">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-bright)' }}>
                    {formatUsd(p.currentPrice)}
                  </span>
                </Td>
                <Td align="right">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                    {p.quantity.toFixed(4)}
                  </span>
                </Td>
                <Td align="right">
                  {p.unrealizedPnl != null ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: isProfit ? 'var(--lime-dim)' : 'var(--red)' }}>
                      {isProfit ? '+' : ''}{formatUsd(p.unrealizedPnl)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
                  )}
                </Td>
                <Td align="right">
                  {p.unrealizedPct != null ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: isProfit ? 'var(--lime-dim)' : 'var(--red)' }}>
                      {isProfit ? '+' : ''}{p.unrealizedPct.toFixed(2)}%
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
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