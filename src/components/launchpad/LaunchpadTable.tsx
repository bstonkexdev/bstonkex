// Cupcak8 Swap — Launchpad Token Table
// Shows real indexed tokens from market discovery
// Cupcak8 themed with strawberry pink accents
import { memo, useState } from 'react';
import { CHAINS, formatUsd, formatPct, shortenAddress } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import type { Launchpad } from '../../lib/launchpads';
import ChainIcon from '../ChainIcon';
import LaunchpadCard from './LaunchpadCard';

type SortKey = 'volume' | 'price' | 'change' | 'liquidity' | 'mc' | 'age';

interface Props {
  tokens: MarketToken[];
  launchpads: Launchpad[];
  loading: boolean;
  onTrade: (t: MarketToken) => void;
}

export default memo(function LaunchpadTable({ tokens, launchpads, loading, onTrade }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('volume');
  const [view, setView] = useState<'table' | 'cards'>('table');

  const sorted = [...tokens].sort((a, b) => {
    switch (sortBy) {
      case 'price': return (b.price ?? 0) - (a.price ?? 0);
      case 'change': return (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0);
      case 'liquidity': return (b.liquidity ?? 0) - (a.liquidity ?? 0);
      case 'mc': return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      case 'age': return (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0);
      case 'volume':
      default: return (b.volume24h ?? 0) - (a.volume24h ?? 0);
    }
  });

  if (sorted.length === 0 && !loading) {
    return (
      <div>
        {/* Factory registry status */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Factory Registry Status
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Launchpad', 'Chain', 'Type', 'Status', 'Verified', 'Source'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '6px 10px', fontSize: 9, fontWeight: 700,
                      color: 'var(--text-muted)', textTransform: 'uppercase',
                      letterSpacing: '0.04em', borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {launchpads.map(lp => {
                  const chain = CHAINS[lp.chainId];
                  return (
                    <tr key={lp.id} style={{ opacity: lp.enabled ? 1 : 0.6 }}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-bright)' }}>{lp.name}</span>
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ChainIcon chainId={lp.chainId} size={10} />
                          <span style={{ fontSize: 10, color: 'var(--text)' }}>{chain?.shortName || lp.chainId}</span>
                        </div>
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{lp.dataSource}</span>
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                          background: lp.enabled ? 'var(--lime-bg)' : 'var(--bg-elevated)',
                          color: lp.enabled ? 'var(--lime-dim)' : 'var(--text-muted)',
                        }}>
                          {lp.enabled ? 'ACTIVE' : lp.status === 'not_configured' ? 'NOT CONFIGURED' : 'DISABLED'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                          background: lp.verified ? 'var(--lime-bg)' : 'var(--yellow-bg)',
                          color: lp.verified ? 'var(--lime-dim)' : 'var(--yellow-dim)',
                        }}>
                          {lp.verified ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {lp.trackingMethod}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Empty state */}
        <div style={{
          textAlign: 'center', padding: '32px 20px',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          background: 'var(--bg-surface)',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>⛓</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
            No Launchpad Tokens Found
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
            The indexer pipeline will display tokens here as they are created on verified factory contracts.
            {launchpads.filter(lp => lp.enabled).length > 0 && (
              <span style={{ display: 'block', marginTop: 6, color: 'var(--lime-dim)', fontWeight: 600 }}>
                {launchpads.filter(lp => lp.enabled).length} factory contracts are actively monitored.
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Sort controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Sort:</span>
        {([['volume', 'Volume'], ['price', 'Price'], ['change', '24H'], ['liquidity', 'Liquidity'], ['mc', 'MCap'], ['age', 'Age']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSortBy(k)} style={{
            padding: '3px 10px', fontSize: 10, fontWeight: 700,
            background: sortBy === k ? 'var(--yellow-bg)' : 'transparent',
            border: `1px solid ${sortBy === k ? 'var(--yellow)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: sortBy === k ? 'var(--yellow-dim)' : 'var(--text-dim)',
            transition: 'all 0.12s',
          }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
          {sorted.length} token{sorted.length !== 1 ? 's' : ''}
        </span>
        {loading && (
          <span style={{ fontSize: 10, color: 'var(--yellow-dim)', fontWeight: 600 }}>Updating...</span>
        )}
      </div>

      {/* Desktop table */}
      <div className="launchpad-desktop-table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th align="left">Token</Th>
              <Th align="center">Chain</Th>
              <Th align="right">Price</Th>
              <Th align="right">24H</Th>
              <Th align="right">Volume</Th>
              <Th align="right">Liquidity</Th>
              <Th align="right">MCap</Th>
              <Th align="right">Buys/Sells</Th>
              <Th align="center">Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 100).map((t, i) => {
              const chain = CHAINS[t.chainId];
              const isUp = (t.priceChange24h ?? 0) >= 0;
              const statusColor = t.tradability === 'tradable' ? 'var(--lime-dim)' :
                t.tradability === 'data_only' ? 'var(--yellow-dim)' : 'var(--text-muted)';
              const statusLabel = t.tradability === 'tradable' ? 'TRADEABLE' :
                t.tradability === 'data_only' ? 'DATA' :
                t.tradability === 'no_liquidity' ? 'NO LIQ' : 'NO ROUTE';

              return (
                <tr key={`${t.chainId}-${t.address}-${i}`}
                  style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => onTrade(t)}
                >
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.icon ? (
                        <img src={t.icon} alt={t.symbol} width={20} height={20}
                          style={{ borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-elevated)' }}
                          onError={e => (e.currentTarget.style.display = 'none')}
                        />
                      ) : (
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'rgba(232,84,124,0.1)', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 800, color: '#E8547C',
                        }}>{t.symbol.charAt(0)}</div>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)' }}>{t.symbol}</span>
                          {t.launchpadName && (
                            <span style={{
                              fontSize: 7, fontWeight: 600, padding: '1px 4px',
                              background: 'rgba(232,84,124,0.08)', borderRadius: 'var(--radius-sm)',
                              color: '#E8547C',
                            }}>{t.launchpadName}</span>
                          )}
                        </div>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{t.name}</span>
                      </div>
                    </div>
                  </Td>
                  <Td align="center">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                      <ChainIcon chainId={t.chainId as ChainId} size={12} />
                      <span style={{ fontSize: 10, color: chain?.color || 'var(--text-muted)', fontWeight: 600 }}>
                        {chain?.shortName}
                      </span>
                    </div>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-bright)', fontWeight: 700 }}>
                      {t.price != null ? (t.price < 0.01 ? t.price.toExponential(4) : formatUsd(t.price)) : '—'}
                    </span>
                  </Td>
                  <Td align="right">
                    {t.priceChange24h != null ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? 'var(--lime-dim)' : 'var(--red)' }}>
                        {isUp ? '+' : ''}{formatPct(t.priceChange24h)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
                    )}
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                      {formatUsd(t.volume24h)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                      {formatUsd(t.liquidity)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>
                      {formatUsd(t.marketCap)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ fontSize: 10 }}>
                      <span style={{ color: 'var(--lime-dim)', fontWeight: 700 }}>{t.buys24h ?? 0}</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>/</span>
                      <span style={{ color: 'var(--red)', fontWeight: 700 }}>{t.sells24h ?? 0}</span>
                    </span>
                  </Td>
                  <Td align="center">
                    <span style={{
                      fontSize: 8, fontWeight: 700, padding: '2px 6px',
                      borderRadius: 'var(--radius-sm)',
                      background: statusColor === 'var(--lime-dim)' ? 'var(--lime-bg)' :
                        statusColor === 'var(--yellow-dim)' ? 'var(--yellow-bg)' : 'var(--bg-elevated)',
                      color: statusColor,
                    }}>
                      {statusLabel}
                    </span>
                  </Td>
                  <Td>
                    <button onClick={e => { e.stopPropagation(); onTrade(t); }} style={{
                      padding: '4px 12px', background: '#E8547C', border: 'none',
                      borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 10, fontWeight: 700,
                      cursor: 'pointer', transition: 'background 0.12s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#D14068'}
                      onMouseLeave={e => e.currentTarget.style.background = '#E8547C'}
                    >
                      Trade
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="launchpad-mobile-cards" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.slice(0, 50).map((t, i) => (
          <LaunchpadCard
            key={`${t.chainId}-${t.address}-${i}`}
            token={t}
            onTrade={() => onTrade(t)}
          />
        ))}
      </div>

      <style>{`
        @media (max-width: 768px) { .launchpad-desktop-table { display: none !important; } }
        @media (min-width: 769px) { .launchpad-mobile-cards { display: none !important; } }
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