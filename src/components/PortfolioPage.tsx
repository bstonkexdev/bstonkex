// Cupcak8 Swap — Portfolio / Wallet Dashboard
// Sweet-meets-strong 8-bit retro financial dashboard
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../lib/context';
import type { TradeToken } from '../lib/context';
import { CHAINS, CONFIGURED_CHAINS, formatUsd, formatPct, shortenAddress, explorerAddressUrl } from '../lib/config';
import type { ChainId } from '../lib/config';
import { getAllChainPortfolios, getTotalPortfolioValue } from '../lib/engine/portfolio-engine';
import { getPositions, enrichPositionsWithPrices, getPnlSummary, type Position } from '../lib/engine/pnl-engine';
import { saveSnapshot } from '../lib/engine/portfolio-snapshots';
import type { WalletBalance } from '../lib/engine/types';
import ChainIcon from './ChainIcon';
import WalletChainBalances from './wallet/WalletChainBalances';
import WalletHoldings from './wallet/WalletHoldings';
import WalletPositions from './wallet/WalletPositions';
import WalletTransactions from './wallet/WalletTransactions';
import PendingTransactions from './portfolio/PendingTransactions';
import TradingPerformance from './portfolio/TradingPerformance';
import MascotLogo from './MascotLogo';

type Tab = 'holdings' | 'positions' | 'transactions' | 'performance';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'holdings', label: 'Holdings', icon: '◈' },
  { id: 'positions', label: 'Positions', icon: '⬡' },
  { id: 'transactions', label: 'Transactions', icon: '◉' },
  { id: 'performance', label: 'Performance', icon: '📊' },
];

export default function PortfolioPage() {
  const { wallet, activeChain, connect, disconnect, setActiveChain, setWalletModal, setTradeToken } = useApp();
  const [tab, setTab] = useState<Tab>('holdings');
  const [allPortfolios, setAllPortfolios] = useState<WalletBalance[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [pnlSummary, setPnlSummary] = useState<{
    totalRealized: number; totalUnrealized: number; totalPnl: number;
    totalCostBasis: number; totalCurrentValue: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hideZero, setHideZero] = useState(true);
  const [showAllChains, setShowAllChains] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return;
    setLoading(true);
    try {
      const result = await getTotalPortfolioValue(wallet.address);
      setAllPortfolios(result.chains);
      setTotalUsd(result.totalUsd);

      const pos = await getPositions(wallet.address);
      const livePrices: { address: string; symbol: string; priceUsd: number | null }[] = [];
      for (const c of result.chains) {
        livePrices.push({
          address: 'native', symbol: c.nativeSymbol,
          priceUsd: c.nativeBalanceUsd > 0 ? c.nativeBalanceUsd / parseFloat(c.nativeBalance) : null,
        });
        for (const t of c.tokens) livePrices.push({ address: t.address, symbol: t.symbol, priceUsd: t.priceUsd });
      }
      const enriched = enrichPositionsWithPrices(pos, livePrices);
      setPositions(enriched);

      const summary = await getPnlSummary(wallet.address);
      setPnlSummary(summary);

      const chainValues: Record<string, number> = {};
      for (const c of result.chains) chainValues[c.chainId] = c.totalUsd;
      const snapPositions = enriched.map(p => ({ symbol: p.tokenSymbol, valueUsd: p.currentValueUsd, chainId: p.chainId }));
      await saveSnapshot(wallet.address, {
        totalUsd: result.totalUsd, chainValues, positions: snapPositions,
        pnl24h: summary.totalUnrealized,
        pnl24hPct: summary.totalCostBasis > 0 ? (summary.totalUnrealized / summary.totalCostBasis) * 100 : 0,
      });
    } catch { /* ignore */ }
    setLoading(false);
  }, [wallet]);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  const handleTrade = (t: TradeToken) => setTradeToken(t);

  const copyAddr = () => {
    navigator.clipboard.writeText(wallet.address || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Not connected state
  if (!wallet.connected) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 20, minHeight: '60vh',
        background: 'var(--bg-deep)',
      }}>
        <MascotLogo size={64} color="#E8547C" />
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-pixel)', fontSize: 14, color: '#3D2B1F',
            marginBottom: 8, letterSpacing: '0.04em',
          }}>Connect Your Wallet</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', maxWidth: 360, lineHeight: 1.6 }}>
            View your portfolio across all supported networks, track positions, and monitor trading performance.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setWalletModal('evm')} style={{
            padding: '12px 28px', background: '#E8547C', border: 'none',
            borderRadius: 'var(--radius)', color: '#fff', fontSize: 13, fontWeight: 800,
            cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#D14068'}
            onMouseLeave={e => e.currentTarget.style.background = '#E8547C'}
          >Connect EVM</button>
          <button onClick={() => setWalletModal('solana')} style={{
            padding: '12px 28px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border-bright)', borderRadius: 'var(--radius)',
            color: 'var(--text-dim)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#E8547C'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-bright)'}
          >Connect Solana</button>
        </div>
      </div>
    );
  }

  const pnl24h = pnlSummary?.totalUnrealized ?? 0;
  const pnl24hPct = pnlSummary?.totalCostBasis ? (pnl24h / pnlSummary.totalCostBasis) * 100 : null;
  const isProfit = pnl24h >= 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-deep)',
      paddingBottom: 70,
    }}>

      {/* Wallet Header */}
      <section style={{
        padding: '16px 20px', borderBottom: '2px solid var(--border)',
        background: 'linear-gradient(180deg, #FFF8F0 0%, #FFFFFF 100%)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10, flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MascotLogo size={28} color="#E8547C" />
            <span style={{
              fontFamily: 'var(--font-pixel)', fontSize: 12, color: '#3D2B1F',
              letterSpacing: '0.04em',
            }}>Portfolio</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: 'var(--lime-bg)', color: 'var(--lime-dim)',
            }}>Connected</span>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--lime)', boxShadow: '0 0 6px rgba(74,222,128,0.4)',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setTradeToken(null)} style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 700,
              background: '#E8547C', border: 'none', borderRadius: 'var(--radius-sm)',
              color: '#fff', cursor: 'pointer', transition: 'background 0.12s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#D14068'}
              onMouseLeave={e => e.currentTarget.style.background = '#E8547C'}
            >Trade</button>
            <button onClick={fetchPortfolio} style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 700,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer',
              transition: 'border-color 0.12s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#E8547C'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >↻ Refresh</button>
            <button onClick={() => disconnect()} style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 700,
              background: 'var(--red-bg)', border: '1px solid var(--red)',
              borderRadius: 'var(--radius-sm)', color: 'var(--red)', cursor: 'pointer',
            }}>Disconnect</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)',
            color: 'var(--text-bright)', letterSpacing: '-0.02em',
          }}>
            {shortenAddress(wallet.address || '', 8)}
          </span>
          <button onClick={copyAddr} style={{
            fontSize: 10, padding: '3px 10px', background: copied ? 'var(--lime-bg)' : 'var(--bg-elevated)',
            border: `1px solid ${copied ? 'var(--lime-dim)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: copied ? 'var(--lime-dim)' : 'var(--text-dim)', fontWeight: 700,
            transition: 'all 0.15s',
          }}>
            {copied ? '✓ Copied' : '📋 Copy Address'}
          </button>
          <a href={explorerAddressUrl(activeChain, wallet.address || '')}
            target="_blank" rel="noopener"
            style={{
              fontSize: 10, padding: '3px 10px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              color: 'var(--text-dim)', fontWeight: 700, textDecoration: 'none',
              transition: 'border-color 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#B8A9E8'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >View Explorer ↗</a>
        </div>
      </section>

      {/* Portfolio Overview Cards */}
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
      }}>
        <OverviewCard label="Total Portfolio Value" value={loading ? '...' : formatUsd(totalUsd)} large accent />
        <OverviewCard label="24H P&L"
          value={pnlSummary ? `${isProfit ? '+' : ''}${formatUsd(pnl24h)}` : '—'}
          sub={pnl24hPct != null ? `${isProfit ? '+' : ''}${pnl24hPct.toFixed(2)}%` : undefined}
          color={pnlSummary ? (isProfit ? 'var(--lime-dim)' : 'var(--red)') : 'var(--text-muted)'}
        />
        <OverviewCard label="Total P&L"
          value={pnlSummary ? `${(pnlSummary.totalPnl ?? 0) >= 0 ? '+' : ''}${formatUsd(pnlSummary.totalPnl)}` : '—'}
          color={pnlSummary ? ((pnlSummary.totalPnl ?? 0) >= 0 ? 'var(--lime-dim)' : 'var(--red)') : 'var(--text-muted)'}
        />
        <OverviewCard label="Available Balance" value={loading ? '...' : formatUsd(totalUsd)} />
      </section>

      {/* Chain Balances */}
      <section style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', letterSpacing: '0.04em' }}>
            Chain Balances
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setShowAllChains(true)} style={{
              padding: '4px 10px', fontSize: 10, fontWeight: 700,
              background: showAllChains ? 'var(--green-bg)' : 'transparent',
              border: `1px solid ${showAllChains ? '#E8547C' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: showAllChains ? '#E8547C' : 'var(--text-dim)',
              transition: 'all 0.12s',
            }}>All</button>
            {CONFIGURED_CHAINS.map(c => (
              <button key={c.id} onClick={() => { setActiveChain(c.id as ChainId); setShowAllChains(false); }} style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 700,
                background: !showAllChains && activeChain === c.id ? 'var(--green-bg)' : 'transparent',
                border: `1px solid ${!showAllChains && activeChain === c.id ? '#E8547C' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: !showAllChains && activeChain === c.id ? '#E8547C' : 'var(--text-dim)',
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all 0.12s',
              }}>
                <ChainIcon chainId={c.id as ChainId} size={12} />
                {c.shortName}
              </button>
            ))}
          </div>
        </div>
        <WalletChainBalances
          portfolios={allPortfolios}
          activeChain={activeChain}
          onChainSelect={(c) => { setActiveChain(c); setShowAllChains(false); }}
        />
      </section>

      {/* Pending Transactions */}
      <PendingTransactions />

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '2px solid var(--border)',
        padding: '0 20px', flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        {TABS.map(t => {
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 16px', fontSize: 11, fontWeight: 700,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: isActive ? '#E8547C' : 'var(--text-dim)',
              borderBottom: isActive ? '2px solid #E8547C' : '2px solid transparent',
              letterSpacing: '0.04em', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 12 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <section style={{ flex: 1, overflow: 'auto', padding: '14px 20px' }}>
        {loading && allPortfolios.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Syncing wallet data...</div>
          </div>
        )}

        {tab === 'holdings' && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)' }}>Token Holdings</span>
              <button onClick={() => setHideZero(h => !h)} style={{
                fontSize: 10, fontWeight: 600, background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                padding: '4px 10px', cursor: 'pointer', color: 'var(--text-dim)',
                transition: 'border-color 0.12s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#B8A9E8'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                {hideZero ? 'Show Zero' : 'Hide Zero'}
              </button>
            </div>
            <WalletHoldings
              portfolios={allPortfolios} activeChain={activeChain}
              showAllChains={showAllChains} hideZero={hideZero}
              onTrade={handleTrade}
            />
          </div>
        )}

        {tab === 'positions' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 10 }}>
              Open Positions
            </div>
            <WalletPositions
              positions={positions} activeChain={activeChain}
              showAllChains={showAllChains}
            />
          </div>
        )}

        {tab === 'transactions' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 10 }}>
              Transaction History
            </div>
            <WalletTransactions
              wallet={wallet.address} activeChain={activeChain}
              showAllChains={showAllChains}
            />
          </div>
        )}

        {tab === 'performance' && (
          <TradingPerformance wallet={wallet.address} />
        )}
      </section>
    </div>
  );
}

function OverviewCard({ label, value, sub, large, accent, color }: {
  label: string; value: string; sub?: string;
  large?: boolean; accent?: boolean; color?: string;
}) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: 14, background: 'var(--bg-surface)',
    }}>
      <div style={{
        fontSize: 10, color: 'var(--text-muted)', marginBottom: 4,
        letterSpacing: '0.04em', fontWeight: 600,
      }}>{label}</div>
      <div style={{
        fontSize: large ? 22 : 16, fontWeight: 800,
        fontFamily: 'var(--font-mono)', lineHeight: 1.2,
        color: accent ? 'var(--text-bright)' : (color || 'var(--text-bright)'),
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color, marginTop: 2, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}