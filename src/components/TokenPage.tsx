// Cupcak8 Swap — Responsive token trading page (mobile-first, same design expanded on desktop).
// Order: header → info tabs → price/stats → metadata badges → chart → trade tabs → data panel,
// with the execution panel beside the chart on wide screens and a fixed BUY/SELL bar on mobile.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../lib/context';
import { getTokenByAddress, validatePrice, type TokenData, type PriceValidation } from '../lib/market';
import { getMajorAsset, getMajorRoute, fetchMajorQuotes, type MajorQuote, type ProviderStatus } from '../lib/major-assets';
import { CHAINS, formatUsd, formatPct } from '../lib/config';
import { checkTokenSafety, type SafetyReport } from '../lib/engine/token-safety';
import { checkChainReadiness, type ChainReadiness } from '../lib/engine/chain-readiness';
import { subscribeToken, onMarketEvent, getDataFreshness, type MarketStreamEvent } from '../lib/engine/market-stream';
import { processTrade } from '../lib/engine/candle-engine';
import { useTokenTradeFeed, useMyTrades, useTokenAlert, formatAge } from '../lib/token-page-data';
import PriceChart, { ChartErrorBoundary } from './PriceChart';
import TradePanel from './TradePanel';
import MarketSidebar from './MarketSidebar';
import TokenHeaderBar from './token/TokenHeaderBar';
import { TokenTabBar, TABS_A, TABS_B, type PanelTab } from './token/TokenTabs';
import PriceStats, { type DataStatus } from './token/PriceStats';
import MetaBadges, { type MetaBadge } from './token/MetaBadges';
import TokenDataPanel from './token/TokenDataPanel';
import MobileTradeBar from './token/MobileTradeBar';
import { gitlawb } from '../lib/gitlawb';

export default function TokenPage() {
  const { tradeToken, activeChain, wallet, setPage } = useApp();
  const [token, setToken] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [safety, setSafety] = useState<SafetyReport | null>(null);
  const [priceValidation, setPriceValidation] = useState<PriceValidation | null>(null);
  const [readiness, setReadiness] = useState<ChainReadiness | null>(null);
  const [fullscreenChart, setFullscreenChart] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>('trade');
  const [tradeSheet, setTradeSheet] = useState<null | 'buy' | 'sell'>(null);
  const [majorQuote, setMajorQuote] = useState<MajorQuote | null>(null);
  const [majorStatus, setMajorStatus] = useState<'idle' | 'loading' | ProviderStatus>('idle');
  const [routeMarket, setRouteMarket] = useState<TokenData | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const chain = CHAINS[activeChain];

  // ── Identity: canonical asset id for majors, contract for tokens ──
  const coingeckoId = tradeToken?.coingeckoId ?? null;
  const majorAsset = getMajorAsset(coingeckoId);
  const isMajor = !!majorAsset;
  const majorRoute = majorAsset ? getMajorRoute(coingeckoId, activeChain) : null;
  const watchKey = tradeToken ? (tradeToken.address || tradeToken.coingeckoId || '') : '';

  // Real reference quotes (refreshed every 60s)
  useEffect(() => {
    if (!coingeckoId) { setMajorQuote(null); setMajorStatus('idle'); return; }
    let cancelled = false;
    setMajorQuote(null);
    setMajorStatus('loading');
    const load = () => fetchMajorQuotes().then(res => {
      if (cancelled) return;
      const q = res.quotes[coingeckoId] ?? null;
      setMajorQuote(q);
      setMajorStatus(q ? 'ok' : res.status);
    }).catch(() => { if (!cancelled) setMajorStatus('error'); });
    load();
    const iv = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [coingeckoId]);

  // Token market data + safety + readiness
  useEffect(() => {
    if (!tradeToken) return;
    checkChainReadiness(tradeToken.chainId).then(setReadiness).catch(() => {});
    if (tradeToken.coingeckoId) {
      setToken(null); setLoading(false); setSafety(null); setPriceValidation(null);
      if (majorRoute?.address) {
        checkTokenSafety(majorRoute.chainId, majorRoute.address).then(setSafety).catch(() => {});
        validatePrice(majorRoute.chainId, majorRoute.address).then(setPriceValidation).catch(() => {});
      }
      return;
    }
    if (!tradeToken.address) { setToken(null); setLoading(false); return; }
    setLoading(true);
    getTokenByAddress(tradeToken.chainId, tradeToken.address).then(data => { setToken(data); setLoading(false); }).catch(() => setLoading(false));
    checkTokenSafety(tradeToken.chainId, tradeToken.address).then(setSafety).catch(() => {});
    validatePrice(tradeToken.chainId, tradeToken.address).then(setPriceValidation).catch(() => {});
    const unsub = subscribeToken(tradeToken.chainId, tradeToken.address, tradeToken.symbol);
    return unsub;
  }, [tradeToken, majorRoute?.address, majorRoute?.chainId]);

  // Live market updates (contract tokens only)
  useEffect(() => {
    if (!tradeToken || tradeToken.coingeckoId) return;
    return onMarketEvent((e: MarketStreamEvent) => {
      if (e.tokenAddress !== tradeToken.address || e.chainId !== tradeToken.chainId) return;
      if (e.type === 'price' && e.data.price != null) {
        setToken(prev => prev ? { ...prev, price: e.data.price, priceChange24h: e.data.change24h ?? prev.priceChange24h } : prev);
        processTrade(e.chainId, e.tokenAddress, { price: e.data.price, amountUsd: e.data.volume24h ?? 0, timestamp: e.timestamp, side: 'buy' });
      }
      if (e.type === 'stats') {
        setToken(prev => prev ? {
          ...prev,
          price: e.data.price ?? prev.price, priceChange24h: e.data.change24h ?? prev.priceChange24h,
          volume24h: e.data.volume24h ?? prev.volume24h, liquidity: e.data.liquidity ?? prev.liquidity,
          marketCap: e.data.marketCap ?? prev.marketCap, fdv: e.data.fdv ?? prev.fdv,
          buys24h: e.data.buys24h ?? prev.buys24h, sells24h: e.data.sells24h ?? prev.sells24h,
          txns24h: e.data.txns24h ?? prev.txns24h,
        } : prev);
      }
    });
  }, [tradeToken]);

  // Route market stats for reference assets
  useEffect(() => {
    if (!majorAsset || !majorRoute?.address) { setRouteMarket(null); return; }
    let cancelled = false;
    getTokenByAddress(majorRoute.chainId, majorRoute.address).then(data => { if (!cancelled) setRouteMarket(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [majorAsset?.id, majorRoute?.address, majorRoute?.chainId]);

  // Watchlist (contract or canonical id as identity)
  useEffect(() => {
    if (!tradeToken || !wallet.address) return;
    gitlawb.db.collection<{ tokenAddress: string }>('watchlist').list({ limit: 100 })
      .then(({ records }) => setIsWatched(records.some(r => r.data.tokenAddress === watchKey)))
      .catch(() => {});
  }, [tradeToken, wallet.address, watchKey]);

  const toggleWatchlist = useCallback(async () => {
    if (!tradeToken || !wallet.address || !watchKey) return;
    try {
      const wl = gitlawb.db.collection<{ tokenAddress: string; chainId: string; symbol: string }>('watchlist');
      const { records } = await wl.list({ limit: 100 });
      const existing = records.find(r => r.data.tokenAddress === watchKey);
      if (existing) { await wl.remove(existing.id); setIsWatched(false); }
      else { await wl.create({ tokenAddress: watchKey, chainId: tradeToken.chainId, symbol: tradeToken.symbol }); setIsWatched(true); }
    } catch { /* ignore */ }
  }, [tradeToken, wallet.address, watchKey]);

  // ── Display identity (reference assets use canonical CoinGecko metadata) ──
  // Computed before the early returns so data hooks always run in the same order.
  const t: TokenData | null = token ?? (isMajor ? routeMarket : null);
  const displaySymbol = isMajor ? (majorQuote?.symbol || tradeToken?.symbol || '') : (t?.symbol || tradeToken?.symbol || '');
  const displayName = isMajor ? (majorQuote?.name || tradeToken?.name || '') : (t?.name || tradeToken?.name || '');
  const displayIcon = isMajor ? (majorQuote?.image ?? null) : (t?.icon ?? null);
  const displayPrice = isMajor ? (majorQuote?.price ?? null) : (t?.price ?? null);
  const displayChange = isMajor ? (majorQuote?.change24h ?? null) : (t?.priceChange24h ?? null);
  const displayAddress = isMajor ? (majorRoute?.address ?? '') : (t?.address ?? tradeToken?.address ?? '');

  // Real feeds (hooks — must run on every render, before any early return)
  const tradeFeed = useTokenTradeFeed(activeChain, displayAddress, 60);
  const myTrades = useMyTrades(wallet.address, [displaySymbol, tradeToken?.symbol ?? '']);
  const alert = useTokenAlert(activeChain, displayAddress, displaySymbol);

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

  if (loading) {
    return (
      <div className="page">
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em' }} className="loading">
            LOADING {tradeToken.symbol} MARKET DATA...
          </div>
        </div>
      </div>
    );
  }

  const pairAge = formatAge(t?.pairCreatedAt);

  const tradable = isMajor ? !!majorRoute : !!tradeToken.address;
  const tradingEnabled = tradable && readiness?.mode !== 'market_data_only';
  const disabledReason = !tradable
    ? `NO VERIFIED EXECUTION ROUTE ON ${chain.name.toUpperCase()} — BUY/SELL DISABLED`
    : readiness?.mode === 'market_data_only'
      ? `MARKET DATA ONLY — TRADING NOT ENABLED ON ${chain.name.toUpperCase()}`
      : null;

  const freshness = getDataFreshness();
  const dataStatus: DataStatus = isMajor
    ? (majorStatus === 'ok' ? 'DELAYED' : majorStatus === 'rate_limited' ? 'DATA DELAYED' : majorStatus === 'loading' ? 'DELAYED' : 'DATA UNAVAILABLE')
    : (t ? (freshness === 'LIVE' ? 'LIVE' : freshness === 'DELAYED' ? 'DELAYED' : 'DATA DELAYED') : 'DATA UNAVAILABLE');

  const priceSource = coingeckoId ? `COINGECKO REFERENCE (${coingeckoId})` : 'DEXSCREENER / GECKOTERMINAL';
  const candleSource = coingeckoId ? 'COINGECKO OHLC (REFERENCE)' : 'GECKOTERMINAL POOL OHLCV';

  // Verified metadata badges only — nothing invented
  const badges: MetaBadge[] = [];
  if (t?.liquidity != null) badges.push({ label: 'LIQUIDITY', value: formatUsd(t.liquidity) });
  if (pairAge) badges.push({ label: 'POOL AGE', value: pairAge });
  if (t?.dexId) badges.push({ label: 'DEX', value: t.dexId.toUpperCase() });
  badges.push({ label: 'CHAIN', value: chain.shortName, tone: 'dim' });
  if (majorRoute) badges.push({ label: 'ROUTE', value: `${majorRoute.symbol}`, tone: 'cyan', title: `${majorRoute.label} — ${majorRoute.address}` });
  if (safety) {
    badges.push(safety.warnings.length > 0
      ? { label: 'SAFETY', value: `${safety.warnings.length} WARNING${safety.warnings.length > 1 ? 'S' : ''}`, tone: safety.riskLevel === 'critical' ? 'red' : 'amber' }
      : { label: 'SAFETY', value: 'NO WARNINGS', tone: 'green' });
    if (safety.checks.liquidityOk) badges.push({ label: 'LIQ CHECK', value: 'PASS', tone: 'green' });
  }
  if (priceValidation?.tradeable) badges.push({ label: 'MARKET', value: 'ACTIVE', tone: 'green' });

  const selectTab = (tab: PanelTab) => {
    setPanelTab(tab);
    if (TABS_A.some(x => x.id === tab)) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="token-page">
      {/* Desktop sidebar (existing navigation) */}
      <aside className="token-page-sidebar"><MarketSidebar /></aside>

      {/* Main column — identical component order on mobile and desktop */}
      <div className="token-page-main">
        <TokenHeaderBar
          symbol={displaySymbol} name={displayName} icon={displayIcon}
          chainId={activeChain} address={displayAddress}
          pairCreatedAt={t?.pairCreatedAt ?? null}
          isWatched={isWatched} onToggleWatch={toggleWatchlist}
          onBack={() => setPage('markets')}
          onToggleFullscreen={() => setFullscreenChart(v => !v)}
          alertEnabled={alert.enabled} onToggleAlert={alert.toggle}
        />

        <TokenTabBar tabs={TABS_A} active={panelTab} onSelect={selectTab} label="Token info views" />

        {/* Warnings — real checks only */}
        {priceValidation?.warning && (
          <div className="token-banner amber">{priceValidation.warning}</div>
        )}
        {safety && safety.warnings.length > 0 && (
          <div className="token-banner" style={{ background: safety.riskLevel === 'critical' ? 'var(--red-bg)' : 'var(--lime-bg)' }}>
            {safety.warnings.map((w, i) => (
              <span key={i} style={{
                fontSize: 7, fontWeight: 800, padding: '1px 3px',
                border: `1px solid ${w.level === 'critical' ? 'var(--red)' : 'var(--amber, #FFD700)'}`,
                color: w.level === 'critical' ? 'var(--red)' : 'var(--amber, #FFD700)',
              }}>⚠ {w.label}</span>
            ))}
          </div>
        )}
        {majorAsset && (
          <div className="token-banner">
            <span>REFERENCE PRICE · COINGECKO "{majorAsset.id}"</span>
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            {majorRoute ? (
              <span style={{ color: 'var(--green)' }}>EXECUTION ROUTE: {majorRoute.label} ({majorRoute.symbol}) ON {chain.name.toUpperCase()}</span>
            ) : (
              <span style={{ color: 'var(--amber, #FFD700)' }}>NO VERIFIED EXECUTION ROUTE ON {chain.name.toUpperCase()} — BUY/SELL DISABLED</span>
            )}
          </div>
        )}
        {isMajor && majorStatus === 'rate_limited' && (
          <div className="token-banner amber">PRICE FEED RATE LIMITED — SHOWING LAST KNOWN QUOTE</div>
        )}
        {isMajor && (majorStatus === 'error' || majorStatus === 'unavailable') && !majorQuote && (
          <div className="token-banner amber">REFERENCE QUOTE UNAVAILABLE — DATA PROVIDER ERROR</div>
        )}

        <PriceStats
          price={displayPrice} change24h={displayChange}
          marketCap={isMajor ? (majorQuote?.marketCap ?? null) : (t?.marketCap ?? null)}
          volume24h={isMajor ? (majorQuote?.volume24h ?? null) : (t?.volume24h ?? null)}
          txns24h={t?.txns24h ?? null} buys24h={t?.buys24h ?? null} sells24h={t?.sells24h ?? null}
          high24h={isMajor ? (majorQuote?.high24h ?? null) : null}
          low24h={isMajor ? (majorQuote?.low24h ?? null) : null}
          dataStatus={dataStatus}
        />

        <MetaBadges badges={badges} />

        {/* Chart — primary visual element */}
        <div className="chart-region">
          <ChartErrorBoundary tokenSymbol={displaySymbol}>
            <PriceChart
              chainId={activeChain}
              poolAddress={isMajor ? null : (t?.pairAddress || null)}
              coingeckoId={coingeckoId}
              tokenSymbol={displaySymbol}
              fullscreen={fullscreenChart}
              onToggleFullscreen={() => setFullscreenChart(v => !v)}
            />
          </ChartErrorBoundary>
        </div>

        <TokenTabBar tabs={TABS_B} active={panelTab} onSelect={setPanelTab} label="Token data views" />

        <div ref={panelRef} className="token-data-panel">
          <TokenDataPanel
            tab={panelTab} chainId={activeChain} symbol={displaySymbol}
            token={t} safety={safety}
            trades={tradeFeed.rows} tradeFreshness={tradeFeed.freshness}
            myTrades={myTrades.trades} myTradesLoaded={myTrades.loaded}
            walletAddress={wallet.address}
            priceSource={priceSource} candleSource={candleSource}
            majorAssetId={majorAsset?.id ?? null}
            routeLabel={majorRoute ? majorRoute.label : null}
            routeAddress={majorRoute?.address ?? null}
          />
        </div>
      </div>

      {/* Desktop execution terminal (existing layout) */}
      <aside className="token-page-terminal">
        {majorAsset && !majorRoute ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber, #FFD700)', letterSpacing: '0.1em' }}>REFERENCE MARKET ONLY</div>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.7 }}>
              {displaySymbol} has a live reference price and chart,<br />
              but no verified execution route exists on {chain.name}.<br />BUY / SELL is disabled.
            </div>
          </div>
        ) : readiness?.mode === 'market_data_only' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber, #FFD700)', letterSpacing: '0.1em' }}>MARKET DATA ONLY</div>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
              Trading not enabled for {chain.name}.<br />Checks: {readiness.passedCount}/{readiness.totalCount} passed
            </div>
          </div>
        ) : (
          <TradePanel tokenAddress={displayAddress} tokenSymbol={displaySymbol} tokenPrice={displayPrice} />
        )}
      </aside>

      {/* Mobile BUY/SELL bar — opens the execution panel, never trades on tap */}
      <MobileTradeBar
        symbol={displaySymbol} price={displayPrice}
        canTrade={tradingEnabled && !!displayAddress}
        disabledReason={disabledReason}
        onBuy={() => setTradeSheet('buy')}
        onSell={() => setTradeSheet('sell')}
      />

      {/* Mobile execution sheet (existing TradePanel) */}
      {tradeSheet && (
        <div className="mobile-only" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.7)' }} onClick={() => setTradeSheet(null)} />
          <div style={{ maxHeight: '85vh', overflow: 'auto', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border-bright)' }} />
            </div>
            <TradePanel tokenAddress={displayAddress} tokenSymbol={displaySymbol} tokenPrice={displayPrice} initialSide={tradeSheet} />
          </div>
        </div>
      )}

      {/* Fullscreen chart */}
      {fullscreenChart && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 10, flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 900, fontSize: 14, color: 'var(--text-bright)', fontFamily: 'var(--font)' }}>{displaySymbol}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: (displayChange ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatUsd(displayPrice)} {formatPct(displayChange)}
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={() => setFullscreenChart(false)} style={{ fontSize: 9, padding: '4px 10px' }}>✕ EXIT</button>
          </div>
          <div style={{ flex: 1 }}>
            <ChartErrorBoundary>
              <PriceChart
                chainId={activeChain} poolAddress={isMajor ? null : (t?.pairAddress || null)}
                coingeckoId={coingeckoId} tokenSymbol={displaySymbol} fullscreen
                onToggleFullscreen={() => setFullscreenChart(false)}
              />
            </ChartErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}
