// Cupcak8 Swap — Order Book Pane
// Shows order book and recent trades with honest empty states
import { useState } from 'react';
import type { MarketToken } from '../../lib/market-discovery';
import { formatUsd } from '../../lib/config';

interface Props {
  token: MarketToken | null;
}

type Tab = 'book' | 'trades';

interface BookRow {
  price: number;
  amount: number;
  total: number;
  pct: number;
}

export default function OrderBookPane({ token }: Props) {
  const [tab, setTab] = useState<Tab>('book');
  const [precision, setPrecision] = useState(4);

  // Real order book data would come from WebSocket subscription.
  // Currently showing empty state until WebSocket order book is connected.
  const asks: BookRow[] = [];
  const bids: BookRow[] = [];
  const spread = '—';

  return (
    <div className="terminal-pane">
      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
        flexShrink: 0, background: 'var(--bg-elevated)',
      }}>
        {([['book', 'Order Book'], ['trades', 'Recent Trades']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as Tab)} style={{
            flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 700,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: tab === id ? '#E8547C' : 'var(--text-dim)',
            borderBottom: tab === id ? '2px solid #E8547C' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Precision controls */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '5px 8px',
        borderBottom: '1px solid var(--border)', alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600 }}>
          {token ? `${token.symbol}/USDT` : 'SELECT TOKEN'}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {[2, 4, 6, 8].map(p => (
            <button key={p} onClick={() => setPrecision(p)} style={{
              padding: '2px 6px', fontSize: 9, fontWeight: 700,
              background: precision === p ? 'var(--yellow-bg)' : 'transparent',
              border: `1px solid ${precision === p ? 'var(--yellow)' : 'var(--border)'}`,
              borderRadius: 4, cursor: 'pointer',
              color: precision === p ? 'var(--yellow-dim)' : 'var(--text-dim)',
              transition: 'all 0.12s',
            }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {tab === 'book' ? (
        <>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            padding: '5px 8px', borderBottom: '1px solid var(--border)',
            fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
            letterSpacing: '0.04em', background: 'var(--bg-elevated)',
          }}>
            <span>PRICE</span>
            <span style={{ textAlign: 'right' }}>AMOUNT</span>
            <span style={{ textAlign: 'right' }}>TOTAL</span>
          </div>

          {/* Asks (sells) */}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {asks.length > 0 ? (
              asks.slice(0, 12).map((row, i) => (
                <div key={`ask-${i}`} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  padding: '2px 8px', fontSize: 10, fontFamily: 'var(--font-mono)',
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: `${row.pct}%`, background: 'var(--red-bg)', opacity: 0.3,
                  }} />
                  <span style={{ color: 'var(--red)', position: 'relative' }}>{row.price.toFixed(precision)}</span>
                  <span style={{ textAlign: 'right', position: 'relative' }}>{row.amount.toFixed(4)}</span>
                  <span style={{ textAlign: 'right', color: 'var(--text-dim)', position: 'relative' }}>{row.total.toFixed(4)}</span>
                </div>
              ))
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24, textAlign: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>
                    {token ? 'Order Book Unavailable' : 'Select a Token'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {token ? 'Real-time order book data will appear here when a WebSocket feed is connected.' : 'Choose a pair from the market overview.'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Spread */}
          <div style={{
            padding: '6px 8px', borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
            background: 'var(--bg-elevated)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>
              {spread}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>SPREAD</span>
          </div>

          {/* Bids (buys) */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {bids.length > 0 ? (
              bids.slice(0, 12).map((row, i) => (
                <div key={`bid-${i}`} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  padding: '2px 8px', fontSize: 10, fontFamily: 'var(--font-mono)',
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: `${row.pct}%`, background: 'var(--lime-bg)', opacity: 0.3,
                  }} />
                  <span style={{ color: 'var(--lime-dim)', position: 'relative' }}>{row.price.toFixed(precision)}</span>
                  <span style={{ textAlign: 'right', position: 'relative' }}>{row.amount.toFixed(4)}</span>
                  <span style={{ textAlign: 'right', color: 'var(--text-dim)', position: 'relative' }}>{row.total.toFixed(4)}</span>
                </div>
              ))
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24, fontSize: 10, color: 'var(--text-muted)',
              }}>
                {token ? 'Bid data unavailable' : '—'}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Recent Trades tab */
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {token ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 6 }}>
                Recent Trades — {token.symbol}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.6 }}>
                Trade data is sourced from indexed blockchain activity.
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Volume 24h</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>
                    {token.volume24h ? formatUsd(token.volume24h) : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Trades 24h</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>
                    {(token.buys24h ?? 0) + (token.sells24h ?? 0) > 0
                      ? `${(token.buys24h ?? 0) + (token.sells24h ?? 0)}`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, fontSize: 11, color: 'var(--text-dim)' }}>
              Select a token to view trades
            </div>
          )}
        </div>
      )}
    </div>
  );
}