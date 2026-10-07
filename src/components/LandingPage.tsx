// BSTONKEX — Homepage: Digital Stock Exchange Terminal
// Not a dashboard. Not a landing page. A futuristic exchange machine.
import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, CONFIGURED_CHAINS } from '../lib/config';
import { getAllChainReadiness, type ChainReadiness } from '../lib/engine/chain-readiness';
import { getSystemHealth } from '../lib/engine/system-health';
import { getDiscovery, type MarketToken } from '../lib/market-discovery';
import { onActivity, type MarketEvent, startActivityPolling, stopActivityPolling } from '../lib/engine/activity-engine';
import type { HealthStatus } from '../lib/engine/types';

// Landing sub-components
import ExchangeCore from './landing/ExchangeCore';
import MarketTicker from './landing/MarketTicker';
import ExchangeStatus from './landing/ExchangeStatus';
import TodaysMarket from './landing/TodaysMarket';
import WorkflowFlow from './landing/WorkflowFlow';
import ChainNetwork from './landing/ChainNetwork';
import LandingFooter from './landing/LandingFooter';

export default function LandingPage() {
  const { setPage, setTradeToken, wallet } = useApp();

  // ── Market Data ──
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [gainers, setGainers] = useState<MarketToken[]>([]);
  const [losers, setLosers] = useState<MarketToken[]>([]);
  const [trending, setTrending] = useState<MarketToken[]>([]);
  const [newMarkets, setNewMarkets] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Chain Health ──
  const [readiness, setReadiness] = useState<ChainReadiness[]>([]);
  const [health, setHealth] = useState<HealthStatus[]>([]);

  // ── Live Activity ──
  const [events, setEvents] = useState<MarketEvent[]>([]);

  // Load market data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDiscovery('volume'),
      getDiscovery('gainers'),
      getDiscovery('losers'),
      getDiscovery('trending'),
      getDiscovery('new'),
    ]).then(([vol, gn, ls, tr, nw]) => {
      setTokens(vol);
      setGainers(gn.slice(0, 8));
      setLosers(ls.slice(0, 8));
      setTrending(tr.slice(0, 8));
      setNewMarkets(nw.slice(0, 8));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Chain health
  useEffect(() => {
    getAllChainReadiness().then(setReadiness).catch(() => {});
    getSystemHealth().then(setHealth).catch(() => {});
    const iv = setInterval(() => {
      getAllChainReadiness().then(setReadiness).catch(() => {});
      getSystemHealth().then(setHealth).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  // Live activity
  useEffect(() => {
    startActivityPolling(20000);
    const unsub = onActivity(e => setEvents(prev => [e, ...prev].slice(0, 50)));
    return () => { unsub(); stopActivityPolling(); };
  }, []);

  // Computed
  const activeMarkets = tokens.filter(t => t.price != null).length;

  const chainStatuses: Record<string, 'live' | 'delayed' | 'offline'> = {};
  CONFIGURED_CHAINS.forEach(chain => {
    const r = readiness.find(c => c.chainId === chain.id);
    if (!r) chainStatuses[chain.id] = 'offline';
    else if (r.mode === 'trading_enabled') chainStatuses[chain.id] = 'live';
    else if (r.mode === 'market_data_only') chainStatuses[chain.id] = 'delayed';
    else chainStatuses[chain.id] = 'offline';
  });

  return (
    <div className="page landing-page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── HERO: Exchange Terminal ── */}
      <section className="landing-hero" style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--bg-void)',
      }}>
        {/* Scanline overlay */}
        <div className="landing-scanline" />

        {/* Top bar: identity */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          position: 'relative', zIndex: 2,
        }}>
          <span style={{
            fontSize: 14, fontWeight: 900, color: 'var(--text-bright)',
            letterSpacing: '0.2em',
            textShadow: '0 0 12px rgba(0,204,255,0.2)',
          }}>
            BSTONKEX
          </span>
          <span style={{
            fontSize: 7, color: 'var(--cyan)', fontWeight: 700,
            letterSpacing: '0.15em', opacity: 0.6,
          }}>
            // DIGITAL ASSET EXCHANGE
          </span>
          <div style={{ flex: 1 }} />
          {/* Mini status LEDs */}
          <span className="landing-led-dot" style={{ background: 'var(--green)' }} />
          <span className="landing-led-dot" style={{ background: 'var(--cyan)', animationDelay: '0.5s' }} />
          <span className="landing-led-dot" style={{ background: 'var(--amber)', animationDelay: '1s' }} />
        </div>

        {/* Exchange Core animation */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <ExchangeCore events={events} activeMarkets={activeMarkets} />
        </div>

        {/* Hero message overlay */}
        <div style={{
          position: 'absolute', bottom: 24, left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          zIndex: 3, pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 28, fontWeight: 900, color: 'var(--text-bright)',
            letterSpacing: '0.15em', lineHeight: 1.1,
            textShadow: '0 2px 20px rgba(0,0,0,0.8)',
          }}>
            TRADE THE MARKET.
          </div>
          <div style={{
            fontSize: 9, fontWeight: 700, color: 'var(--cyan)',
            letterSpacing: '0.25em', marginTop: 6,
            textShadow: '0 1px 10px rgba(0,0,0,0.8)',
          }}>
            MULTI-CHAIN. REAL-TIME. NON-CUSTODIAL.
          </div>
          <div style={{
            display: 'flex', gap: 10, marginTop: 16,
            pointerEvents: 'auto',
          }}>
            <button
              className="btn btn-lg btn-cyan"
              onClick={() => setPage('trade')}
              style={{ fontSize: 10, padding: '10px 28px', letterSpacing: '0.15em' }}
            >
              OPEN TERMINAL
            </button>
            <button
              className="btn btn-lg"
              onClick={() => setPage('markets')}
              style={{ fontSize: 10, padding: '10px 28px', letterSpacing: '0.15em' }}
            >
              EXPLORE MARKETS
            </button>
          </div>
        </div>
      </section>

      {/* ── TICKER ── */}
      <MarketTicker tokens={tokens} />

      {/* ── STATUS BAR ── */}
      <ExchangeStatus
        readiness={readiness}
        health={health}
        activeMarkets={activeMarkets}
        liveTradesCount={events.length}
      />

      {/* ── TODAY'S MARKET ── */}
      <section style={{ padding: '12px 16px' }}>
        <TodaysMarket
          trending={trending}
          gainers={gainers}
          losers={losers}
          newMarkets={newMarkets}
          loading={loading}
          onClickToken={setTradeToken}
          onViewAll={() => setPage('markets')}
        />
      </section>

      {/* ── WORKFLOW ── */}
      <section style={{ padding: '0 16px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 900, color: 'var(--text-bright)',
            letterSpacing: '0.12em',
          }}>
            HOW IT WORKS
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <WorkflowFlow />
      </section>

      {/* ── CHAIN NETWORK ── */}
      <section style={{ padding: '0 16px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 900, color: 'var(--text-bright)',
            letterSpacing: '0.12em',
          }}>
            CHAIN NETWORK
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <div style={{
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          overflow: 'hidden',
        }}>
          <ChainNetwork chainStatuses={chainStatuses} />
        </div>
      </section>

      {/* ── CONNECT WALLET (if not connected) ── */}
      {!wallet.connected && (
        <section style={{
          padding: '20px 16px', textAlign: 'center',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--text-bright)',
            marginBottom: 4, letterSpacing: '0.1em',
          }}>
            CONNECT YOUR WALLET
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 10 }}>
            Non-custodial trading across 4 chains
          </div>
          <button
            className="btn btn-lg btn-cyan"
            onClick={() => setPage('portfolio')}
            style={{ fontSize: 10, padding: '10px 24px', letterSpacing: '0.1em' }}
          >
            ⬡ CONNECT WALLET
          </button>
        </section>
      )}

      {/* ── FOOTER ── */}
      <LandingFooter />
    </div>
  );
}