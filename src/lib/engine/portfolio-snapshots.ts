// BSTONKEX Portfolio Snapshots — Historical portfolio value tracking via Gitlawb
import { gitlawb } from '../gitlawb';

// ── Collection ───────────────────────────────────────────────
const snapshots = gitlawb.db.collection<{
  wallet: string; totalUsd: number; chainValues: Record<string, number>;
  positions: { symbol: string; valueUsd: number; chainId: string }[];
  pnl24h: number; pnl24hPct: number;
  timestamp: string;
}>('portfolio_snapshots');

export interface PortfolioSnapshot {
  id: string;
  wallet: string;
  totalUsd: number;
  chainValues: Record<string, number>;
  positions: { symbol: string; valueUsd: number; chainId: string }[];
  pnl24h: number;
  pnl24hPct: number;
  timestamp: number;
}

/** Save a snapshot of the current portfolio state. */
export async function saveSnapshot(wallet: string, data: {
  totalUsd: number;
  chainValues: Record<string, number>;
  positions: { symbol: string; valueUsd: number; chainId: string }[];
  pnl24h: number;
  pnl24hPct: number;
}): Promise<void> {
  try {
    await snapshots.create({
      wallet: wallet.toLowerCase(),
      totalUsd: data.totalUsd,
      chainValues: data.chainValues,
      positions: data.positions,
      pnl24h: data.pnl24h,
      pnl24hPct: data.pnl24hPct,
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-critical */ }
}

/** Get snapshots for chart data. Returns sorted by timestamp ascending. */
export async function getSnapshots(wallet: string, limit = 100): Promise<PortfolioSnapshot[]> {
  try {
    const { records } = await snapshots.list({ limit });
    return records
      .filter(r => r.data.wallet === wallet.toLowerCase())
      .map(r => ({
        id: r.id, wallet: r.data.wallet, totalUsd: r.data.totalUsd,
        chainValues: r.data.chainValues, positions: r.data.positions,
        pnl24h: r.data.pnl24h, pnl24hPct: r.data.pnl24hPct,
        timestamp: new Date(r.data.timestamp).getTime(),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

/** Get latest snapshot. */
export async function getLatestSnapshot(wallet: string): Promise<PortfolioSnapshot | null> {
  const snaps = await getSnapshots(wallet, 1);
  return snaps.length > 0 ? snaps[snaps.length - 1] : null;
}

/** Generate chart data points from snapshots. */
export function snapshotsToChartData(snapshots: PortfolioSnapshot[]): {
  time: number; value: number; pnl: number; pnlPct: number;
}[] {
  if (snapshots.length === 0) return [];
  const baseValue = snapshots[0].totalUsd;
  return snapshots.map(s => ({
    time: s.timestamp,
    value: s.totalUsd,
    pnl: s.totalUsd - baseValue,
    pnlPct: baseValue > 0 ? ((s.totalUsd - baseValue) / baseValue) * 100 : 0,
  }));
}