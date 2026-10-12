// Cupcak8 Swap — Trading Chart Pane
// Wraps PriceChart with Cupcak8-themed timeframe and chart controls
import { useState } from 'react';
import PriceChart from '../PriceChart';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';

interface Props {
  token: MarketToken | null;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'];
const CHART_TYPES = ['Candles', 'Line'];

export default function TradingChartPane({ token, fullscreen, onToggleFullscreen }: Props) {
  const [activeTf, setActiveTf] = useState('1h');
  const [chartType, setChartType] = useState('Candles');

  if (!token) {
    return (
      <div className="terminal-pane" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
            Select a Pair
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Choose a trading pair from the market overview to view the chart
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-pane">
      {/* Chart header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, background: 'var(--bg-elevated)',
      }}>
        {/* Timeframes */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TIMEFRAMES.map(tf => {
            const isActive = tf === activeTf;
            return (
              <button key={tf} onClick={() => setActiveTf(tf)} style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 700,
                background: isActive ? 'var(--green-bg)' : 'transparent',
                border: `1px solid ${isActive ? '#E8547C' : 'transparent'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: isActive ? '#E8547C' : 'var(--text-dim)',
                transition: 'all 0.12s',
              }}>
                {tf}
              </button>
            );
          })}
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Chart type */}
        <div style={{ display: 'flex', gap: 2 }}>
          {CHART_TYPES.map(ct => {
            const isActive = ct === chartType;
            return (
              <button key={ct} onClick={() => setChartType(ct)} style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 700,
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: isActive ? 'var(--text-bright)' : 'var(--text-dim)',
                transition: 'color 0.12s',
              }}>
                {ct}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Indicators */}
        <button style={{
          padding: '4px 10px', fontSize: 10, fontWeight: 600,
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          color: 'var(--text-dim)', transition: 'border-color 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#B8A9E8'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          Indicators
        </button>
        <button onClick={onToggleFullscreen} style={{
          padding: '4px 10px', fontSize: 12, fontWeight: 600,
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          color: 'var(--text-dim)', transition: 'border-color 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#E8547C'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          {fullscreen ? '⊟' : '⊞'}
        </button>
      </div>

      {/* Chart canvas */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <PriceChart
          chainId={token.chainId as ChainId}
          poolAddress={token.address}
          tokenSymbol={token.symbol}
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      </div>
    </div>
  );
}