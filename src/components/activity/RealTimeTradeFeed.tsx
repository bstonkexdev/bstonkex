// Cupcak8 Swap — Real-Time Trade Feed
// Live trade terminal with wallet tags, tab filters, and sub-second updates.
// Matches ave.ai trade terminal: prepend incoming trades, filter by tags.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  subscribeTrades,
  initTradeStream,
  getTradeHistory,
  type UniversalTradePayload,
} from '../../lib/engine/trade-stream';
import {
  updateWalletProfile,
  evaluateWalletTags,
  checkCabal,
} from '../../lib/engine/wallet-profiler';
import WalletTagBadge from './WalletTagBadge';
import TradeFilters from './TradeFilters';
import { formatUsd } from '../../lib/config';

interface Props {
  /** Filter to specific mint (token page) or show all (activity page) */
  mint?: string;
  maxItems?: number;
  compact?: boolean;
}

const BG = '#12161f';
const BORDER = 'rgba(255,255,255,0.06)';
const GREEN = '#10b981';
const RED = '#ef4444';
const TEXT_DIM = 'rgba(255,255,255,0.35)';

// ── Main Component ──────────────────────────────────────────

export default function RealTimeTradeFeed({ mint, maxItems = 50, compact }: Props) {
  const [trades, setTrades] = useState<UniversalTradePayload[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize trade stream on mount
  useEffect(() => {
    initTradeStream();
  }, []);

  // Subscribe to trades
  useEffect(() => {
    // Load existing history
    if (mint) {
      const history = getTradeHistory(mint);
      if (history.length > 0) {
        setTrades(history.slice(-maxItems));
      }
    }

    const unsub = subscribeTrades((trade: UniversalTradePayload) => {
      // Filter by mint if specified
      if (mint && trade.mint !== mint) return;

      // Update wallet profile
      updateWalletProfile(trade.traderFull, {
        mint: trade.mint,
        side: trade.side,
        priceUsd: trade.priceUsd,
        timestamp: trade.timestamp,
      });

      // Evaluate wallet tags
      trade.tags = evaluateWalletTags(trade.traderFull, trade.mint, trade.timestamp);

      // Check cabal
      if (checkCabal(trade.mint, trade.traderFull, trade.timestamp)) {
        trade.tags.isCabal = true;
      }

      // Prepend to trades
      setTrades(prev => {
        const updated = [trade, ...prev];
        if (updated.length > maxItems) updated.splice(maxItems);
        return updated;
      });

      // Update filter counts
      setFilterCounts(prev => {
        const counts = { ...prev };
        counts.all = (counts.all || 0) + 1;
        if (trade.tags.isKOL) counts.kol = (counts.kol || 0) + 1;
        if (trade.tags.isSmartMoney) counts.smart = (counts.smart || 0) + 1;
        if (trade.tags.isSniper) counts.sniper = (counts.sniper || 0) + 1;
        if (trade.tags.isCabal) counts.cabal = (counts.cabal || 0) + 1;
        if (trade.tags.isFollowed) counts.followed = (counts.followed || 0) + 1;
        if (trade.tags.isCreator) counts.creator = (counts.creator || 0) + 1;
        return counts;
      });
    });

    return unsub;
  }, [mint, maxItems]);

  // Filter trades
  const filteredTrades = useCallback(() => {
    if (activeFilter === 'all') return trades;
    return trades.filter(t => {
      switch (activeFilter) {
        case 'kol': return t.tags.isKOL;
        case 'smart': return t.tags.isSmartMoney;
        case 'sniper': return t.tags.isSniper;
        case 'cabal': return t.tags.isCabal;
        case 'followed': return t.tags.isFollowed;
        case 'creator': return t.tags.isCreator;
        default: return true;
      }
    });
  }, [trades, activeFilter])();

  return (
    <div style={{ background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          {mint ? 'TRADES' : 'LIVE TRADES'}
        </span>
        <span style={{ fontSize: 8, color: TEXT_DIM }}>
          {filteredTrades.length} trades
        </span>
      </div>

      {/* Filters */}
      <div style={{ padding: '4px 8px', borderBottom: `1px solid ${BORDER}` }}>
        <TradeFilters active={activeFilter} onSelect={setActiveFilter} counts={filterCounts} />
      </div>

      {/* Trade List */}
      <div ref={containerRef} style={{ maxHeight: compact ? 200 : 400, overflowY: 'auto' }}>
        {filteredTrades.length === 0 ? (
          <div style={{ padding: '20px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: TEXT_DIM }}>No trades yet</div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
              Waiting for real-time data...
            </div>
          </div>
        ) : (
          filteredTrades.map((trade, i) => (
            <div key={`${trade.txHash}-${i}`} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: compact ? '4px 8px' : '6px 12px',
              borderBottom: `1px solid ${BORDER}`,
              background: i === 0 ? 'rgba(139,92,246,0.03)' : 'transparent',
              transition: 'background 0.2s ease',
            }}>
              {/* Left: Time + Side + Token */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 8, color: TEXT_DIM, fontFamily: 'monospace', minWidth: 50 }}>
                  {trade.time}
                </span>
                <span style={{
                  fontSize: 8,
                  fontWeight: 800,
                  padding: '1px 4px',
                  borderRadius: 3,
                  background: trade.side === 'buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: trade.side === 'buy' ? GREEN : RED,
                  minWidth: 30,
                  textAlign: 'center',
                }}>
                  {trade.side.toUpperCase()}
                </span>
                {!mint && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ${trade.symbol}
                  </span>
                )}
              </div>

              {/* Center: Wallet Tags */}
              <div style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
                <WalletTagBadge
                  tags={trade.tags}
                  trader={trade.trader}
                  tradeCount={trade.tradesCountForWalletOnToken}
                  compact={compact}
                />
              </div>

              {/* Right: Amount + Price */}
              <div style={{ textAlign: 'right', minWidth: 80 }}>
                <div style={{
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: trade.side === 'buy' ? GREEN : RED,
                }}>
                  {formatUsd(trade.volumeUsd)}
                </div>
                {!compact && (
                  <div style={{ fontSize: 7, color: TEXT_DIM, fontFamily: 'monospace' }}>
                    {trade.tokenAmount.toLocaleString()} tokens
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}