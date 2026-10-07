// BSTONKEX — Exchange status bar with actual system state
import type { ChainReadiness } from '../../lib/engine/chain-readiness';
import type { HealthStatus } from '../../lib/engine/types';

interface Props {
  readiness: ChainReadiness[];
  health: HealthStatus[];
  activeMarkets: number;
  liveTradesCount: number;
}

export default function ExchangeStatus({ readiness, health, activeMarkets, liveTradesCount }: Props) {
  const chainsReady = readiness.filter(r => r.mode === 'trading_enabled').length;
  const chainsTotal = readiness.length;
  const healthOk = health.filter(h => h.status === 'UP').length;

  const streamOk = healthOk > 0;
  const liquidityOk = chainsReady > 0;
  const tradingOk = chainsReady > 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto',
    }}>
      <StatusItem label="MARKETS" value={`${activeMarkets}`} ok={activeMarkets > 0} />
      <StatusItem label="DATA STREAM" value={streamOk ? 'LIVE' : 'OFF'} ok={streamOk} />
      <StatusItem label="CHAINS" value={`${chainsReady}/${chainsTotal}`} ok={chainsReady > 0} />
      <StatusItem label="LIQUIDITY" value={liquidityOk ? 'ACTIVE' : 'N/A'} ok={liquidityOk} />
      <StatusItem label="TRADING" value={tradingOk ? 'ENABLED' : 'PENDING'} ok={tradingOk} />
      <StatusItem label="LIVE FEED" value={`${liveTradesCount}`} ok={liveTradesCount > 0} />
    </div>
  );
}

function StatusItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 14px',
      borderRight: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: ok ? 'var(--green)' : 'var(--red)',
        boxShadow: ok ? '0 0 4px var(--green)' : 'none',
      }} />
      <span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <span style={{ fontSize: 8, fontWeight: 800, color: ok ? 'var(--text-bright)' : 'var(--text-dim)' }}>
        {value}
      </span>
    </div>
  );
}