import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { getTokenByAddress, validatePrice, type TokenData, type PriceValidation, getHolders, type HolderData } from '../lib/market';
import { CHAINS, formatUsd, formatPct, formatNum, shortenAddress, explorerTxUrl, explorerAddressUrl } from '../lib/config';
import { checkTokenSafety, type SafetyReport } from '../lib/engine/token-safety';
import { checkChainReadiness, type ChainReadiness } from '../lib/engine/chain-readiness';
import { subscribeToken, onMarketEvent, getStreamState, type MarketStreamEvent } from '../lib/engine/market-stream';
import { processTrade } from '../lib/engine/candle-engine';
import PriceChart, { ChartErrorBoundary } from './PriceChart';
import TradePanel from './TradePanel';
import MarketSidebar from './MarketSidebar';
import PriceFlash from './PriceFlash';
import ChainIcon from './ChainIcon';
import { BuySellPressure, LiquidityPanel, RiskPanel, ContractPanel, HolderConcentration } from './TokenProfile';
import { gitlawb } from '../lib/gitlawb';

type DataTab = 'trades' | 'holders' | 'liquidity' | 'activity' | 'transactions' | 'info';

export default function TokenPage() {
  const { tradeToken, activeChain, wallet } = useApp();
  const [token, setToken] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataTab, setDataTab] = useState<DataTab>('trades');
  const [holders, setHolders] = useState<HolderData[]>([]);
  const [isWatched, setIsWatched] = useState(false);
  const [safety, setSafety] = useState<SafetyReport | null>(null);
  const [priceValidation, setPriceValidation] = useState<PriceValidation | null>(null);
  const [readiness, setReadiness] = useState<ChainReadiness | null>(null);
  const [fullscreenChart, setFullscreenChart] = useState(false);
  const [tradePanelOpen, setTradePanelOpen] = useState(false);

  const chain = CHAINS[activeChain];

  useEffect(() => {
    if (!tradeToken) return;
    setLoading(true);
    getTokenByAddress(tradeToken.chainId, tradeToken.address).then(data => {
      setToken(data);
      setLoading(false);
    }).catch(() => setLoading(false));
    getHolders(tradeToken.chainId, tradeToken.address).then(setHolders).catch(() => {});
    checkTokenSafety(tradeToken.chainId, tradeToken.address).then(setSafety).catch(() => {});
    validatePrice(tradeToken.chainId, tradeToken.address).then(setPriceValidation).catch(() => {});
    checkChainReadiness(tradeToken.chainId).then(setReadiness).catch(() => {});

    const unsub = subscribeToken(tradeToken.chainId, tradeToken.address, tradeToken.symbol);
    return unsub;
  }, [tradeToken]);

  useEffect(() => {
    if (!tradeToken) return;
    const unsub = onMarketEvent((e: MarketStreamEvent) => {
      if (e.tokenAddress !== tradeToken.address || e.chainId !== tradeToken.chainId) return;
      if (e.type === 'price' && e.data.price != null) {
        setToken(prev => prev ? { ...prev, price: e.data.price, priceChange24h: e.data.change24h ?? prev.priceChange24h } : prev);
        processTrade(e.chainId, e.tokenAddress, { price: e.data.price, amountUsd: e.data.volume24h ?? 0, timestamp: e.timestamp, side: 'buy' });
      }
      if (e.type === 'stats') {
        setToken(prev => prev ? { ...prev,
          price: e.data.price ?? prev.price, priceChange24h: e.data.change24h ?? prev.priceChange24h,
          volume24h: e.data.volume24h ?? prev.volume24h, liquidity: e.data.liquidity ?? prev.liquidity,
          marketCap: e.data.marketCap ?? prev.marketCap, fdv: e.data.fdv ?? prev.fdv,
          buys24h: e.data.buys24h ?? prev.buys24h, sells24h: e.data.sells24h ?? prev.sells24h,
          txns24h: e.data.txns24h ?? prev.txns24h,
        } : prev);
      }
    });
    return unsub;
  }, [tradeToken]);

  useEffect(() => {
    if (!tradeToken || !wallet.address) return;
    const check = async () => {
      try {
        const wl = gitlawb.db.collection<{ tokenAddress: string }>('watchlist');
        const { records } = await wl.list({ limit: 100 });
        setIsWatched(records.some(r => r.data.tokenAddress === tradeToken.address));
      } catch { /* ignore */ }
    };
    check();
  }, [tradeToken, wallet.address]);

  const toggleWatchlist = async () => {
    if (!tradeToken || !wallet.address) return;
    try {
      const wl = gitlawb.db.collection<{ tokenAddress: string; chainId: string; symbol: string }>('watchlist');
      const { records } = await wl.list({ limit: 100 });
      const existing = records.find(r => r.data.tokenAddress === tradeToken.address);
      if (existing) { await wl.remove(existing.id); setIsWatched(false); }
      else { await wl.create({ tokenAddress: tradeToken.address, chainId: tradeToken.chainId, symbol: tradeToken.symbol }); setIsWatched(true); }
    } catch { /* ignore */ }
  };

  // ── No token selected ──
  if (!tradeToken) {
    return (
      <div className="page" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: '100%' }}>
          <div style={{ width: 280, borderRight: 'var(--pixel) solid var(--border)', flexShrink: 0 }}>
            <MarketSidebar />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.15em', textAlign: 'center' }}>
              SELECT A TOKEN TO BEGIN TRADING
            </div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', textAlign: 'center' }}>
              Use the sidebar or search to find a market
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="page">
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em' }} className="loading">
              LOADING {tradeToken.symbol} MARKET DATA...
            </div>
          </div>
        </div>
      </div>
    );
  }

  const t = token;
  const isUp = t?.priceChange24h != null && t.priceChange24h >= 0;
  const tradStatus = t?.liquidity && t.liquidity > 1000 ? 'tradable' : 'data_only';

  return (
    <div className="trade-layout">
      {/* ── Sidebar (desktop) ── */}
      <MarketSidebar />

      {/* ── Main Content ── */}
      <div className="trade-main" style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Token Header */}
        <div className="token-header" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flexWrap: 'wrap', borderBottom: 'var(--pixel) solid var(--border)' }}>
          {/* Chain + Identity */}
          <ChainIcon chainId={activeChain} size={18} />
          <span className="badge" style={{ borderColor: chain.color, color: chain.color, fontSize: 7 }}>{chain.shortName}</span>
          {t?.icon && <img src={t.icon} alt="" style={{ width: 18, height: 18, border: '1px solid var(--border)', flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />}
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-bright)' }}>{t?.symbol || tradeToken.symbol}</span>
          <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{t?.name || tradeToken.name}</span>

          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

          {/* Price + Change */}
          <PriceFlash price={t?.price ?? null} style={{ fontSize: 13, fontWeight: 800 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? 'var(--green)' : 'var(--red)' }}>{formatPct(t?.priceChange24h)}</span>

          {/* Tradability */}
          <span style={{ fontSize: 6, fontWeight: 800, padding: '1px 4px', border: `1px solid ${tradStatus === 'tradable' ? 'var(--green)' : 'var(--amber)'}`, color: tradStatus === 'tradable' ? 'var(--green)' : 'var(--amber)' }}>
            {tradStatus === 'tradable' ? 'TRADABLE' : 'DATA ONLY'}
          </span>

          <div style={{ flex: 1, minWidth: 4 }} />

          {/* Stats (desktop) */}
          <div className="token-header-stat desktop-only" style={{ display: 'flex', gap: 10 }}>
            <StatChip label="MCAP" value={formatUsd(t?.marketCap)} />
            <StatChip label="LIQ" value={formatUsd(t?.liquidity)} />
            <StatChip label="VOL" value={formatUsd(t?.volume24h)} />
            <StatChip label="BUYS" value={formatNum(t?.buys24h)} color="var(--green)" />
            <StatChip label="SELLS" value={formatNum(t?.sells24h)} color="var(--red)" />
          </div>

          {/* Stream status */}
          <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 7, color: 'var(--text-dim)', flexShrink: 0 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: getStreamState() === 'connected' ? 'var(--green)' : 'var(--amber)' }} />
            <span>{getStreamState() === 'connected' ? 'LIVE' : 'DELAYED'}</span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            <button className="btn btn-sm" onClick={toggleWatchlist} style={isWatched ? { borderColor: 'var(--amber)', color: 'var(--amber)', fontSize: 8, padding: '2px 6px' } : { fontSize: 8, padding: '2px 6px' }}>
              {isWatched ? '★' : '☆'}
            </button>
            {t?.address && (
              <button className="copy-btn" style={{ fontSize: 7, padding: '2px 5px' }} onClick={() => navigator.clipboard.writeText(t.address)}>
                {shortenAddress(t.address, 4)}
              </button>
            )}
            <button className="btn btn-sm btn-cyan mobile-only" style={{ fontSize: 8, padding: '2px 6px' }} onClick={() => setTradePanelOpen(true)}>
              TRADE
            </button>
          </div>
        </div>

        {/* Mobile stat strip */}
        <div className="mobile-only" style={{ display: 'flex', gap: 0, borderBottom: 'var(--pixel) solid var(--border)', overflowX: 'auto' }}>
          <MobileStat label="MCAP" value={formatUsd(t?.marketCap)} />
          <MobileStat label="LIQ" value={formatUsd(t?.liquidity)} />
          <MobileStat label="VOL" value={formatUsd(t?.volume24h)} />
          <MobileStat label="BUYS" value={formatNum(t?.buys24h)} color="var(--green)" />
          <MobileStat label="SELLS" value={formatNum(t?.sells24h)} color="var(--red)" />
        </div>

        {/* Warnings */}
        {priceValidation?.warning && (
          <div style={{ padding: '3px 10px', fontSize: 8, fontWeight: 700, color: 'var(--amber)', background: 'rgba(255,170,0,0.04)', borderBottom: 'var(--pixel) solid var(--border)' }}>
            {priceValidation.warning}
          </div>
        )}
        {safety && safety.warnings.length > 0 && (
          <div style={{ display: 'flex', gap: 3, padding: '3px 10px', flexWrap: 'wrap', borderBottom: 'var(--pixel) solid var(--border)', background: safety.riskLevel === 'critical' ? 'rgba(255,48,96,0.06)' : 'rgba(255,170,0,0.04)' }}>
            {safety.warnings.map((w, i) => (
              <span key={i} style={{ fontSize: 7, fontWeight: 800, padding: '1px 3px', border: `1px solid ${w.level === 'critical' ? 'var(--red)' : 'var(--amber)'}`, color: w.level === 'critical' ? 'var(--red)' : 'var(--amber)' }}>
                ⚠ {w.label}
              </span>
            ))}
          </div>
        )}

        {/* Chart (wrapped in error boundary) */}
        <div style={{ flex: 1, minHeight: 200 }}>
          <ChartErrorBoundary tokenSymbol={t?.symbol || tradeToken.symbol}>
            <PriceChart chainId={activeChain} poolAddress={t?.pairAddress || null} tokenSymbol={t?.symbol || tradeToken.symbol}
              fullscreen={fullscreenChart} onToggleFullscreen={() => setFullscreenChart(v => !v)} />
          </ChartErrorBoundary>
        </div>

        {/* Bottom Data Tabs */}
        <div className="trade-bottom" style={{ borderTop: 'var(--pixel) solid var(--border)', minHeight: 180, maxHeight: 320 }}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="tabs" style={{ borderBottom: 'var(--pixel) solid var(--border)', flexShrink: 0, display: 'flex', overflowX: 'auto' }}>
              {(['trades', 'holders', 'liquidity', 'activity', 'transactions', 'info'] as DataTab[]).map(tab => (
                <button key={tab} className={`tab ${dataTab === tab ? 'active' : ''}`}
                  style={{ fontSize: 8, padding: '5px 8px', whiteSpace: 'nowrap' }}
                  onClick={() => setDataTab(tab)}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {dataTab === 'trades' && <TradesTab token={t} />}
              {dataTab === 'holders' && <HoldersTab holders={holders} chainId={activeChain} />}
              {dataTab === 'liquidity' && (
                <div style={{ padding: 10 }}>
                  {t ? <LiquidityPanel token={t} /> : <NoData />}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>BUY / SELL PRESSURE</div>
                    <BuySellPressure buys={t?.buys24h ?? null} sells={t?.sells24h ?? null} />
                  </div>
                  {holders.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>HOLDER CONCENTRATION</div>
                      <HolderConcentration holders={holders} />
                    </div>
                  )}
                </div>
              )}
              {dataTab === 'activity' && <ActivityTab token={t} />}
              {dataTab === 'transactions' && <TransactionsTab token={t} />}
              {dataTab === 'info' && (
                <div style={{ padding: 10 }}>
                  {t ? <ContractPanel token={t} chainId={activeChain} /> : <NoData />}
                  {safety && <div style={{ marginTop: 10 }}><RiskPanel safety={safety} chainId={activeChain} /></div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Trade Terminal (desktop right panel) ── */}
      <div className="trade-terminal">
        {readiness?.mode === 'market_data_only' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.1em' }}>MARKET DATA ONLY</div>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
              Trading not enabled for {chain.name}.<br />Checks: {readiness.passedCount}/{readiness.totalCount} passed
            </div>
          </div>
        ) : (
          <TradePanel tokenAddress={tradeToken.address} tokenSymbol={t?.symbol || tradeToken.symbol} tokenPrice={t?.price ?? null} />
        )}
      </div>

      {/* ── Mobile Trade Panel (bottom sheet) ── */}
      {tradePanelOpen && (
        <div className="mobile-only" style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)' }} onClick={() => setTradePanelOpen(false)} />
          <div style={{
            maxHeight: '85vh', overflow: 'auto',
            background: 'var(--bg-panel)', borderTop: 'var(--pixel) solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
              <div style={{ width: 32, height: 3, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            {readiness?.mode === 'market_data_only' ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)' }}>MARKET DATA ONLY</div>
              </div>
            ) : (
              <TradePanel tokenAddress={tradeToken.address} tokenSymbol={t?.symbol || tradeToken.symbol} tokenPrice={t?.price ?? null} />
            )}
          </div>
        </div>
      )}

      {/* ── Fullscreen chart ── */}
      {fullscreenChart && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#040810', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', gap: 8, flexShrink: 0 }}>
            <span style={{ fontWeight: 900, fontSize: 13, color: 'var(--text-bright)' }}>{t?.symbol || tradeToken.symbol}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? 'var(--green)' : 'var(--red)' }}>{formatUsd(t?.price)} {formatPct(t?.priceChange24h)}</span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={() => setFullscreenChart(false)} style={{ fontSize: 8, padding: '3px 8px' }}>✕ EXIT</button>
          </div>
          <div style={{ flex: 1 }}>
            <ChartErrorBoundary>
              <PriceChart chainId={activeChain} poolAddress={t?.pairAddress || null} tokenSymbol={t?.symbol || tradeToken.symbol} fullscreen onToggleFullscreen={() => setFullscreenChart(false)} />
            </ChartErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 3, fontSize: 8 }}>
      <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || 'var(--text)' }}>{value}</span>
    </div>
  );
}

function MobileStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: '0 0 auto', padding: '4px 8px', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
      <div style={{ fontSize: 6, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}

function NoData() {
  return <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>NO DATA AVAILABLE</div>;
}

function TradesTab({ token }: { token: TokenData | null }) {
  if (!token) return <NoData />;
  return (
    <div style={{ padding: 10 }}>
      <div className="info-row"><span className="info-label">PAIR</span><span className="info-value" style={{ fontSize: 9, wordBreak: 'break-all' }}>{token.pairAddress || 'N/A'}</span></div>
      <div className="info-row"><span className="info-label">DEX</span><span className="info-value">{token.dexId || 'N/A'}</span></div>
      <div className="info-row"><span className="info-label">24H TXNS</span><span className="info-value">{formatNum(token.txns24h)}</span></div>
      <div className="info-row"><span className="info-label">24H BUYS</span><span className="info-value" style={{ color: 'var(--green)' }}>{formatNum(token.buys24h)}</span></div>
      <div className="info-row"><span className="info-label">24H SELLS</span><span className="info-value" style={{ color: 'var(--red)' }}>{formatNum(token.sells24h)}</span></div>
      <div style={{ padding: 12, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
        INDIVIDUAL TRADE FEED REQUIRES INDEXER
      </div>
      {token.url && (
        <a href={token.url} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 8, display: 'inline-block', marginTop: 4 }}>
          VIEW ON DEXSCREENER ↗
        </a>
      )}
    </div>
  );
}

function ActivityTab({ token }: { token: TokenData | null }) {
  if (!token) return <NoData />;
  return (
    <div style={{ padding: 10 }}>
      <div className="info-row"><span className="info-label">24H VOLUME</span><span className="info-value">{formatUsd(token.volume24h)}</span></div>
      <div className="info-row"><span className="info-label">1H VOLUME</span><span className="info-value">{formatUsd(token.volume1h)}</span></div>
      <div className="info-row"><span className="info-label">BUY/SELL RATIO</span><span className="info-value">{token.buys24h && token.sells24h ? (token.buys24h / Math.max(token.sells24h, 1)).toFixed(2) : 'N/A'}</span></div>
      <div style={{ padding: 12, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)' }}>
        LIVE ACTIVITY FEED REQUIRES INDEXER
      </div>
    </div>
  );
}

function TransactionsTab({ token }: { token: TokenData | null }) {
  if (!token) return <NoData />;
  return (
    <div style={{ padding: 10 }}>
      <div className="info-row"><span className="info-label">PAIR ADDRESS</span><span className="info-value" style={{ fontSize: 8, wordBreak: 'break-all' }}>{token.pairAddress || 'N/A'}</span></div>
      {token.address && (
        <div style={{ marginTop: 6 }}>
          <a href={explorerAddressUrl((token as any).chainId || 'bsc', token.address)} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 8 }}>
            VIEW ON EXPLORER ↗
          </a>
        </div>
      )}
    </div>
  );
}

function HoldersTab({ holders, chainId }: { holders: HolderData[]; chainId: string }) {
  if (holders.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
        HOLDER DATA UNAVAILABLE — Requires chain indexer
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table compact" style={{ width: '100%', minWidth: 320 }}>
        <thead><tr><th>#</th><th>WALLET</th><th className="right">BALANCE</th><th className="right">%</th><th className="right">VALUE</th></tr></thead>
        <tbody>
          {holders.map((h, i) => (
            <tr key={i}>
              <td className="text-dim">{h.rank}</td>
              <td style={{ wordBreak: 'break-all' }}>
                <a href={explorerAddressUrl(chainId as any, h.address)} target="_blank" rel="noopener" style={{ fontSize: 9 }}>{shortenAddress(h.address)}</a>
                <button className="copy-btn" style={{ marginLeft: 3, fontSize: 7, padding: '1px 3px' }} onClick={() => navigator.clipboard.writeText(h.address)}>C</button>
              </td>
              <td className="right" style={{ fontSize: 9 }}>{h.balance}</td>
              <td className="right" style={{ fontSize: 9 }}>{h.pctSupply.toFixed(2)}%</td>
              <td className="right" style={{ fontSize: 9 }}>{h.value != null ? formatUsd(h.value) : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}