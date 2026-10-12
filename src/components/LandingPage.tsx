// Cupcak8 — Landing Page
// Hero → Major Price Cards → Market Discovery → Sections → Footer
import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, formatUsd, formatPct } from '../lib/config';
import type { ChainId } from '../lib/config';
import { getDiscovery, type MarketToken, type DiscoveryCategory } from '../lib/market-discovery';
import {
  MAJOR_ASSETS, fetchMajorQuotes, getMajorRoutes,
} from '../lib/major-assets';
import ChainIcon from './ChainIcon';
import HeroSection from './landing/HeroSection';
import MajorPriceCards from './landing/MajorPriceCards';
import Cupcak8Footer from './landing/Cupcak8Footer';

export default function LandingPage() {
  return (
    <div className="landing-page" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 'auto' }}>
      <HeroSection />
      <MajorPriceCards />
      <MarketDiscovery />
      <Cupcak8Footer />
    </div>
  );
}

// ── Market Discovery ─────────────────────────────────────────
type DiscoveryCat = 'hot' | 'new' | 'gainers' | 'stocks' | 'major';

const DISCOVERY_CATS: { id: DiscoveryCat; label: string; }[] = [
  { id: 'hot', label: 'HOT' },
  { id: 'new', label: 'NEW' },
  { id: 'gainers', label: 'GAINERS' },
  { id: 'stocks', label: 'STOCKS' },
  { id: 'major', label: 'MAJOR ASSETS' },
];

interface EnrichedToken {
  chainId: ChainId;
  address: string;
  symbol: string;
  name: string;
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  icon: string | null;
  cgId?: string | null;
}

function toEnriched(t: MarketToken): EnrichedToken {
  return {
    chainId: t.chainId, address: t.address,
    symbol: t.symbol, name: t.name,
    price: t.price, change24h: t.priceChange24h,
    marketCap: t.marketCap, volume24h: t.volume24h,
    icon: t.icon, cgId: null,
  };
}

function MarketDiscovery() {
  const { setPage, setTradeToken } = useApp();
  const [activeCat, setActiveCat] = useState<DiscoveryCat>('hot');
  const [tokens, setTokens] = useState<EnrichedToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (activeCat === 'major') {
      fetchMajorQuotes().then(result => {
        if (cancelled) return;
        const enriched: EnrichedToken[] = [];
        for (const asset of MAJOR_ASSETS) {
          const q = result.quotes[asset.id];
          const routes = getMajorRoutes(asset.id);
          if (routes.length === 0) {
            enriched.push({
              chainId: asset.nativeChain, address: '',
              symbol: asset.symbol, name: asset.name,
              price: q?.price ?? null, change24h: q?.change24h ?? null,
              marketCap: q?.marketCap ?? null, volume24h: q?.volume24h ?? null,
              icon: q?.image ?? null, cgId: asset.id,
            });
          } else {
            for (const r of routes) {
              enriched.push({
                chainId: r.chainId, address: r.address,
                symbol: r.symbol, name: r.label,
                price: q?.price ?? null, change24h: q?.change24h ?? null,
                marketCap: q?.marketCap ?? null, volume24h: q?.volume24h ?? null,
                icon: q?.image ?? null, cgId: asset.id,
              });
            }
          }
        }
        setTokens(enriched);
        setLoading(false);
      }).catch(() => { if (!cancelled) { setTokens([]); setLoading(false); } });
    } else if (activeCat === 'stocks') {
      setTokens([]);
      setLoading(false);
    } else {
      const catMap: Record<string, DiscoveryCategory> = {
        hot: 'trending', new: 'new', gainers: 'gainers',
      };
      getDiscovery(catMap[activeCat] || 'trending')
        .then(toks => {
          if (cancelled) return;
          setTokens(toks.slice(0, 20).map(toEnriched));
          setLoading(false);
        })
        .catch(() => { if (!cancelled) { setTokens([]); setLoading(false); } });
    }
    return () => { cancelled = true; };
  }, [activeCat]);

  const isEmpty = !loading && tokens.length === 0;

  return (
    <section style={{
      background: 'var(--bg-surface)',
      borderBottom: '2px solid var(--border)',
      flexShrink: 0,
      marginTop: 4,
    }}>
      {/* Category tabs — single horizontal row */}
      <div style={{
        display: 'flex', flexWrap: 'nowrap', overflowX: 'auto',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
      }}>
        <style>{`.disc-cats::-webkit-scrollbar { display: none; }`}</style>
        {DISCOVERY_CATS.map(cat => {
          const active = activeCat === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className="disc-cats"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flex: '1 0 0', minWidth: 0,
                padding: '11px 6px', fontSize: 11, fontWeight: active ? 800 : 700,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                background: active ? 'var(--bg-surface)' : 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #E8547C' : '2px solid transparent',
                color: active ? '#E8547C' : 'var(--text-dim)',
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-bright)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-dim)'; }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Asset list */}
      <div style={{ padding: '12px 16px', maxWidth: 1100, margin: '0 auto' }}>
        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            Loading {DISCOVERY_CATS.find(c => c.id === activeCat)?.label} assets...
          </div>
        )}

        {isEmpty && activeCat === 'stocks' && (
          <div style={{
            padding: 24, textAlign: 'center',
            background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
              Tokenized Stocks
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 300, margin: '0 auto' }}>
              No tokenized stock assets are currently available. Check back as new tokenized securities are listed.
            </div>
          </div>
        )}

        {isEmpty && activeCat !== 'stocks' && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            No assets found for this category.
          </div>
        )}

        {!loading && tokens.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Header row — desktop only */}
            <div className="desktop-only" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', fontSize: 10, fontWeight: 600,
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              <span style={{ width: 20 }}></span>
              <span style={{ flex: 1 }}>Asset</span>
              <span style={{ width: 100, textAlign: 'right' }}>Price</span>
              <span style={{ width: 80, textAlign: 'right' }}>24H</span>
              <span style={{ width: 100, textAlign: 'right' }}>Mkt Cap</span>
              <span style={{ width: 90, textAlign: 'right' }}>Volume</span>
            </div>
            {tokens.map((t, i) => {
              const isUp = (t.change24h ?? 0) >= 0;
              return (
                <div
                  key={`${t.chainId}-${t.address}-${i}`}
                  onClick={() => {
                    if (t.cgId) {
                      const asset = MAJOR_ASSETS.find(a => a.id === t.cgId);
                      if (asset) {
                        const routes = getMajorRoutes(asset.id);
                        const r = routes[0];
                        if (r) {
                          setTradeToken({
                            chainId: r.chainId, address: r.address,
                            name: asset.name, symbol: r.symbol,
                            coingeckoId: asset.id,
                            routeAddress: r.address, routeSymbol: r.symbol,
                          });
                        }
                      }
                    } else {
                      setTradeToken({
                        chainId: t.chainId, address: t.address,
                        name: t.name, symbol: t.symbol,
                      });
                    }
                    setPage('token');
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer', transition: 'border-color 0.12s, background 0.12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#E8547C';
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--bg-elevated)';
                  }}
                >
                  <span style={{
                    width: 20, fontSize: 10, color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontWeight: 600, textAlign: 'center',
                    flexShrink: 0,
                  }}>{i + 1}</span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    {t.icon ? (
                      <img src={t.icon} alt="" width={22} height={22}
                        style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <ChainIcon chainId={t.chainId as ChainId} size={22} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 800, fontSize: 12, color: 'var(--text-bright)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{t.symbol}</div>
                      <div style={{
                        fontSize: 9, color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{t.name}</div>
                    </div>
                    <span style={{
                      fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                      border: `1px solid ${CHAINS[t.chainId]?.color ?? 'var(--border)'}`,
                      color: CHAINS[t.chainId]?.color ?? 'var(--text-dim)',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {CHAINS[t.chainId]?.shortName ?? t.chainId}
                    </span>
                  </div>

                  <div style={{
                    width: 100, textAlign: 'right', flexShrink: 0,
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12,
                    color: 'var(--text-bright)',
                  }}>{formatUsd(t.price)}</div>

                  <div style={{
                    width: 80, textAlign: 'right', flexShrink: 0,
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11,
                    color: isUp ? '#22C55E' : '#EF5350',
                  }}>{formatPct(t.change24h)}</div>

                  <div className="desktop-only" style={{
                    width: 100, textAlign: 'right', flexShrink: 0,
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--text-dim)',
                  }}>{t.marketCap != null ? formatUsd(t.marketCap) : '—'}</div>

                  <div className="desktop-only" style={{
                    width: 90, textAlign: 'right', flexShrink: 0,
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--text-dim)',
                  }}>{t.volume24h != null ? formatUsd(t.volume24h) : '—'}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}