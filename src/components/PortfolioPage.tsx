import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../lib/context';
import type { TradeToken } from '../lib/context';
import { CHAINS, formatUsd } from '../lib/config';
import type { ChainId } from '../lib/config';
import { getAllChainPortfolios, getTotalPortfolioValue } from '../lib/engine/portfolio-engine';
import { getPositions, enrichPositionsWithPrices, getPnlSummary, type Position } from '../lib/engine/pnl-engine';
import { saveSnapshot } from '../lib/engine/portfolio-snapshots';
import type { WalletBalance } from '../lib/engine/types';
import PortfolioOverview from './portfolio/PortfolioOverview';
import PositionsTable from './portfolio/PositionsTable';
import TransactionHistory from './portfolio/TransactionHistory';
import PendingTransactions from './portfolio/PendingTransactions';
import TradingPerformance from './portfolio/TradingPerformance';

type Tab = 'overview' | 'positions' | 'activity' | 'performance';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'positions', label: 'POSITIONS' },
  { id: 'activity', label: 'ACTIVITY' },
  { id: 'performance', label: 'PERFORMANCE' },
];

export default function PortfolioPage() {
  const { wallet, activeChain, connect, setActiveChain, setWalletModal, setTradeToken } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const [allPortfolios, setAllPortfolios] = useState<WalletBalance[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [pnlSummary, setPnlSummary] = useState<{ totalRealized: number; totalUnrealized: number; totalPnl: number; totalCostBasis: number; totalCurrentValue: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hideZeroBalances, setHideZeroBalances] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all chain portfolios
  const fetchPortfolio = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return;
    setLoading(true);
    try {
      const result = await getTotalPortfolioValue(wallet.address);
      setAllPortfolios(result.chains);
      setTotalUsd(result.totalUsd);

      // Get PnL positions
      const pos = await getPositions(wallet.address);
      // Enrich with live prices from portfolio data
      const livePrices: { address: string; symbol: string; priceUsd: number | null }[] = [];
      for (const c of result.chains) {
        livePrices.push({ address: 'native', symbol: c.nativeSymbol, priceUsd: c.nativeBalanceUsd > 0 ? c.nativeBalanceUsd / parseFloat(c.nativeBalance) : null });
        for (const t of c.tokens) livePrices.push({ address: t.address, symbol: t.symbol, priceUsd: t.priceUsd });
      }
      const enriched = enrichPositionsWithPrices(pos, livePrices);
      setPositions(enriched);

      // PnL summary
      const summary = await getPnlSummary(wallet.address);
      setPnlSummary(summary);

      // Save snapshot for history
      const chainValues: Record<string, number> = {};
      for (const c of result.chains) chainValues[c.chainId] = c.totalUsd;
      const snapPositions = enriched.map(p => ({ symbol: p.tokenSymbol, valueUsd: p.currentValueUsd, chainId: p.chainId }));
      await saveSnapshot(wallet.address, {
        totalUsd: result.totalUsd, chainValues, positions: snapPositions,
        pnl24h: summary.totalUnrealized, pnl24hPct: summary.totalCostBasis > 0 ? (summary.totalUnrealized / summary.totalCostBasis) * 100 : 0,
      });
    } catch { /* ignore */ }
    setLoading(false);
  }, [wallet]);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  // Refresh on tab change
  useEffect(() => { if (wallet.connected) fetchPortfolio(); }, [tab]);

  const handleTrade = (t: TradeToken) => { setTradeToken(t); };

  // ── Not connected ──
  if (!wallet.connected) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, minHeight: '60vh' }}>
          <div style={{ fontSize: 28, color: 'var(--text-muted)' }}>⬡</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>CONNECT YOUR WALLET</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>View your portfolio across all supported chains</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-cyan" onClick={() => setWalletModal('evm')}>Connect EVM</button>
            <button className="btn" onClick={() => setWalletModal('solana')}>Connect Solana</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Search filtering for positions ──
  const filteredPositions = positions.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.tokenSymbol.toLowerCase().includes(q) || p.tokenAddress.toLowerCase().includes(q) || p.chainId.includes(q);
  });

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: 'var(--pixel) solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>PORTFOLIO</span>
        <div style={{ flex: 1 }} />
        {/* Search */}
        <input className="input" placeholder="Search holdings..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: 140, fontSize: 9, padding: '3px 6px' }} />
        <button className="btn btn-sm" onClick={fetchPortfolio} style={{ fontSize: 8, padding: '3px 6px' }}>↻ REFRESH</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: 'var(--pixel) solid var(--border)', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`}
            style={{ fontSize: 9, padding: '6px 12px' }}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {loading && allPortfolios.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 10, color: 'var(--text-dim)' }}>
            <span className="led-sm led-amber led-blink" style={{ marginRight: 6 }} />
            SYNCING WALLET DATA...
          </div>
        )}

        {/* Pending transactions always visible at top */}
        <PendingTransactions />

        {tab === 'overview' && (
          <PortfolioOverview
            wallet={wallet} allPortfolios={allPortfolios} totalUsd={totalUsd}
            pnlSummary={pnlSummary} onSetActiveChain={setActiveChain} />
        )}

        {tab === 'positions' && (
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-header"><span className="led" /> POSITIONS</div>
            <div style={{ padding: 8 }}>
              <PositionsTable
                allPortfolios={allPortfolios} activeChain={activeChain}
                positions={filteredPositions} hideZeroBalances={hideZeroBalances}
                onToggleHideZero={() => setHideZeroBalances(h => !h)}
                onTrade={handleTrade} />
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-header"><span className="led" /> TRANSACTION HISTORY</div>
            <div style={{ padding: 8 }}>
              <TransactionHistory wallet={wallet.address} />
            </div>
          </div>
        )}

        {tab === 'performance' && (
          <TradingPerformance wallet={wallet.address} />
        )}
      </div>
    </div>
  );
}