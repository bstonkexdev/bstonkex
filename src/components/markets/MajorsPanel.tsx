// Cupcak8 Swap — Major Assets Panel
// Real reference markets from CoinGecko, warm vanilla cream styling
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MAJOR_ASSETS, fetchMajorQuotes, getMajorRoutes,
  type MajorAsset, type MajorQuote, type MajorQuotesResult,
} from '../../lib/major-assets';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';

interface Props {
  onSelect: (asset: MajorAsset) => void;
}

export default function MajorsPanel({ onSelect }: Props) {
  const [result, setResult] = useState<MajorQuotesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | null>(null);

  const load = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true);
    fetchMajorQuotes()
      .then(res => { setResult(res); setLoading(false); })
      .catch(() => {
        setResult(prev => prev ? { ...prev, status: 'unavailable' } : { status: 'unavailable', quotes: {}, error: 'Data provider unreachable', fetchedAt: null });
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load(true);
    timerRef.current = window.setInterval(() => load(false), 60_000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [load]);

  const quotes = result?.quotes ?? {};
  const hasQuotes = Object.keys(quotes).length > 0;
  const statusBanner =
    result && result.status === 'rate_limited' ? 'Rate limited by data provider — showing last known quotes.'
    : result && result.status !== 'ok' && hasQuotes ? `Price feed ${result.status.replace('_', ' ')} — showing last known quotes.`
    : null;

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 16px 6px',
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.04em' }}>
          Major Assets
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, color: '#E8547C',
          border: '1px solid #E8547C', padding: '1px 6px', borderRadius: 4,
        }}>
          Live · CoinGecko
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          Reference prices — click to open asset page
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => load(true)}
          disabled={loading}
          style={{
            padding: '5px 12px', fontSize: 10, fontWeight: 700,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            cursor: loading ? 'wait' : 'pointer', color: 'var(--text-dim)',
            transition: 'border-color 0.12s',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = '#E8547C'; }}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          {loading ? '⏳ Loading...' : '↻ Refresh'}
        </button>
      </div>

      {/* Status banner */}
      {statusBanner && (
        <div style={{
          margin: '0 16px 8px', padding: '6px 12px', fontSize: 10, fontWeight: 600,
          color: '#92400E', background: 'var(--yellow-bg)', border: '1px solid var(--yellow)', borderRadius: 'var(--radius-sm)',
        }}>
          {statusBanner}
        </div>
      )}

      {/* Loading (first load) */}
      {loading && !hasQuotes && (
        <div style={{ padding: '18px 16px', fontSize: 11, color: 'var(--text-dim)' }}>
          Loading major asset market data...
        </div>
      )}

      {/* Full error state */}
      {!loading && !hasQuotes && (
        <div style={{ padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>
            {result?.status === 'rate_limited' ? 'Rate Limited by Data Provider' : 'Market Data Unavailable'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
            {result?.status === 'rate_limited'
              ? 'CoinGecko request limit reached — retry in a minute. No prices are fabricated.'
              : (result?.error || 'The data provider did not respond.')}
          </div>
          <button onClick={() => load(true)} style={{
            padding: '8px 20px', background: '#E8547C', border: 'none',
            borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>
            Retry
          </button>
        </div>
      )}

      {/* Assets table */}
      {hasQuotes && (
        <div style={{ overflowX: 'auto', padding: '0 16px 12px' }}>
          <table style={{
            width: '100%', minWidth: 680, borderCollapse: 'collapse',
            fontSize: 11,
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th align="left">#</Th>
                <Th align="left">Asset</Th>
                <Th align="right">Price</Th>
                <Th align="right">24H</Th>
                <Th align="right">7D</Th>
                <Th align="right">Market Cap</Th>
                <Th align="right">Volume</Th>
                <Th align="left">Routes</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {MAJOR_ASSETS.map((asset, i) => {
                const q: MajorQuote | undefined = quotes[asset.id];
                const routes = getMajorRoutes(asset.id);
                return (
                  <tr
                    key={asset.id}
                    onClick={() => onSelect(asset)}
                    style={{
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      background: 'transparent', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{i + 1}</Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {q?.image ? (
                          <img src={q.image} alt="" width={22} height={22}
                            style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
                            onError={e => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 800, color: '#E8547C',
                          }}>{asset.symbol.charAt(0)}</div>
                        )}
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--text-bright)' }}>{asset.symbol}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                            {asset.name} · {asset.nativeCoin ? 'Native' : 'Token'}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td align="right" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-bright)' }}>
                      {q?.price != null ? formatUsd(q.price) : '—'}
                    </Td>
                    <Td align="right" style={{
                      fontFamily: 'var(--font-mono)', fontWeight: 700,
                      color: (q?.change24h ?? 0) >= 0 ? 'var(--lime-dim)' : 'var(--red)',
                    }}>
                      {q?.change24h != null ? formatPct(q.change24h) : '—'}
                    </Td>
                    <Td align="right" style={{
                      fontFamily: 'var(--font-mono)', fontWeight: 700,
                      color: (q?.change7d ?? 0) >= 0 ? 'var(--lime-dim)' : 'var(--red)',
                    }}>
                      {q?.change7d != null ? formatPct(q.change7d) : '—'}
                    </Td>
                    <Td align="right" style={{ fontFamily: 'var(--font-mono)' }}>
                      {q?.marketCap != null ? formatUsd(q.marketCap) : '—'}
                    </Td>
                    <Td align="right" style={{ fontFamily: 'var(--font-mono)' }}>
                      {q?.volume24h != null ? formatUsd(q.volume24h) : '—'}
                    </Td>
                    <Td>
                      {routes.length === 0 ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>Reference Only</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {routes.map(r => (
                            <span key={r.chainId} title={`${r.label} (${r.symbol}) — ${r.address}`} style={{
                              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                              border: `1px solid ${CHAINS[r.chainId]?.color ?? 'var(--border)'}`,
                              color: CHAINS[r.chainId]?.color ?? 'var(--text-dim)',
                              whiteSpace: 'nowrap',
                            }}>
                              {CHAINS[r.chainId]?.shortName ?? r.chainId.toUpperCase()} · {r.symbol}
                            </span>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td align="right">
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: '#E8547C', whiteSpace: 'nowrap',
                      }}>
                        Chart →
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Reference prices from CoinGecko. Trading enabled only where a verified on-chain execution route exists.
            {result?.fetchedAt && ` · Updated: ${new Date(result.fetchedAt).toLocaleTimeString()}`}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: string }) {
  return (
    <th style={{
      textAlign: (align as any) ?? 'left', padding: '8px 8px',
      fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
      letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>{children}</th>
  );
}

function Td({ children, align, style }: { children: React.ReactNode; align?: string; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: '8px 8px', textAlign: (align as any) ?? 'left', ...style }}>{children}</td>
  );
}