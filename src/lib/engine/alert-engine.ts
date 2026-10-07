// BSTONKEX Alert Engine — User alerts via Gitlawb (owner visibility)
// Condition matching, dedup, notification dispatch
import type { ChainId } from '../config';
import { gitlawb } from '../gitlawb';

// ── Types ────────────────────────────────────────────────────

export type AlertType = 'price' | 'percent' | 'volume' | 'whale' | 'liquidity';
export type AlertCondition = 'above' | 'below' | 'change_up' | 'change_down';
export type AlertStatus = 'active' | 'triggered' | 'disabled' | 'expired';

export interface UserAlert {
  id: string;
  type: AlertType;
  tokenSymbol: string;
  tokenAddress: string;
  chainId: ChainId;
  condition: AlertCondition;
  targetValue: number;
  timeframe?: string; // 5m, 1h, 6h, 24h
  status: AlertStatus;
  createdAt: number;
  lastTriggered: number | null;
  message: string;
}

// ── Gitlawb Collection ───────────────────────────────────────

const alertsCol = gitlawb.db.collection<{
  type: string; tokenSymbol: string; tokenAddress: string; chainId: string;
  condition: string; targetValue: number; timeframe: string;
  status: string; message: string; lastTriggered: string | null;
}>('user_alerts');

// ── CRUD ─────────────────────────────────────────────────────

export async function createAlert(params: {
  type: AlertType; tokenSymbol: string; tokenAddress: string;
  chainId: ChainId; condition: AlertCondition; targetValue: number;
  timeframe?: string; message: string;
}): Promise<UserAlert> {
  const data = {
    type: params.type, tokenSymbol: params.tokenSymbol, tokenAddress: params.tokenAddress,
    chainId: params.chainId, condition: params.condition, targetValue: params.targetValue,
    timeframe: params.timeframe || '', status: 'active', message: params.message,
    lastTriggered: null as string | null,
  };
  const record = await alertsCol.create(data);
  return toAlert({ id: record.id, data });
}

export async function getAlerts(): Promise<UserAlert[]> {
  try {
    const { records } = await alertsCol.list({ limit: 100 });
    return records.map(r => toAlert(r)).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function updateAlert(id: string, updates: Partial<{
  status: AlertStatus; lastTriggered: number;
}>) {
  const data: Record<string, any> = {};
  if (updates.status) data.status = updates.status;
  if (updates.lastTriggered) data.lastTriggered = new Date(updates.lastTriggered).toISOString();
  await alertsCol.update(id, data);
}

export async function deleteAlert(id: string) {
  await alertsCol.remove(id);
}

export async function disableAlert(id: string) {
  await alertsCol.update(id, { status: 'disabled' });
}

export async function enableAlert(id: string) {
  await alertsCol.update(id, { status: 'active' });
}

// ── Condition Matching ───────────────────────────────────────

export interface MarketSnapshot {
  tokenAddress: string;
  chainId: ChainId;
  price: number | null;
  priceChange24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
}

/** Check alerts against a market snapshot. Returns triggered alert IDs. */
export function matchAlerts(alerts: UserAlert[], snapshot: MarketSnapshot): UserAlert[] {
  const triggered: UserAlert[] = [];
  for (const alert of alerts) {
    if (alert.status !== 'active') continue;
    if (alert.tokenAddress.toLowerCase() !== snapshot.tokenAddress.toLowerCase()) continue;
    if (alert.chainId !== snapshot.chainId) continue;

    let matched = false;
    switch (alert.type) {
      case 'price':
        if (snapshot.price != null) {
          if (alert.condition === 'above' && snapshot.price >= alert.targetValue) matched = true;
          if (alert.condition === 'below' && snapshot.price <= alert.targetValue) matched = true;
        }
        break;
      case 'percent':
        if (snapshot.priceChange24h != null) {
          if (alert.condition === 'change_up' && snapshot.priceChange24h >= alert.targetValue) matched = true;
          if (alert.condition === 'change_down' && snapshot.priceChange24h <= -alert.targetValue) matched = true;
        }
        break;
      case 'volume':
        if (snapshot.volume24h != null && snapshot.volume24h >= alert.targetValue) matched = true;
        break;
      case 'liquidity':
        if (snapshot.liquidity != null) {
          if (alert.condition === 'below' && snapshot.liquidity <= alert.targetValue) matched = true;
          if (alert.condition === 'above' && snapshot.liquidity >= alert.targetValue) matched = true;
        }
        break;
    }
    if (matched) triggered.push(alert);
  }
  return triggered;
}

// ── Helpers ──────────────────────────────────────────────────

function toAlert(r: { id: string; data: any }): UserAlert {
  return {
    id: r.id,
    type: r.data.type as AlertType,
    tokenSymbol: r.data.tokenSymbol,
    tokenAddress: r.data.tokenAddress,
    chainId: r.data.chainId as ChainId,
    condition: r.data.condition as AlertCondition,
    targetValue: r.data.targetValue,
    timeframe: r.data.timeframe || undefined,
    status: r.data.status as AlertStatus,
    createdAt: 0, // Gitlawb handles createdAt
    lastTriggered: r.data.lastTriggered ? new Date(r.data.lastTriggered).getTime() : null,
    message: r.data.message,
  };
}