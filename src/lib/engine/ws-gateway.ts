// BSTONKEX WS Gateway — WebSocket channel management for frontend subscriptions
// Subscribes to engine events, broadcasts to frontend channels
// Channels: market:*, token:*, activity:*, portfolio:*, health:*

import type { ChainId } from '../config';
import { onMarketPipelineEvent, type MarketPipelineEvent } from './market-pipeline';
import { onHealthUpdate, type InfraHealthReport } from './infra-health';
import { onPipelineState, type PipelineState } from './pipeline-orchestrator';

// ── Channel Types ────────────────────────────────────────────

export type WsChannel =
  | `market:${ChainId}`
  | `token:${ChainId}:${string}`
  | 'activity:all'
  | 'activity:whale'
  | 'portfolio:update'
  | 'health:update'
  | 'pipeline:state';

export interface WsMessage<T = any> {
  channel: WsChannel;
  event: string;
  data: T;
  timestamp: number;
  sequence: number;
}

// ── Subscription Manager ─────────────────────────────────────

type Subscriber = (msg: WsMessage) => void;
const subscriptions = new Map<string, Set<Subscriber>>();
let sequence = 0;
let unsubscribeFns: (() => void)[] = [];

function broadcast(channel: WsChannel, event: string, data: any) {
  sequence++;
  const msg: WsMessage = { channel, event, data, timestamp: Date.now(), sequence };
  const subs = subscriptions.get(channel);
  if (subs) subs.forEach(cb => { try { cb(msg); } catch {} });
  // Also broadcast to wildcard subscribers
  const wildcardSubs = subscriptions.get('*' as any);
  if (wildcardSubs) wildcardSubs.forEach(cb => { try { cb(msg); } catch {} });
}

// ── Subscribe / Unsubscribe ──────────────────────────────────

export function subscribe(channel: WsChannel | '*', cb: Subscriber): () => void {
  if (!subscriptions.has(channel)) subscriptions.set(channel, new Set());
  subscriptions.get(channel)!.add(cb);
  return () => { subscriptions.get(channel)?.delete(cb); };
}

// ── Engine Event Forwarding ───────────────────────────────────

export function startWsGateway() {
  // Forward market pipeline events
  unsubscribeFns.push(onMarketPipelineEvent((event: MarketPipelineEvent) => {
    const chainId = event.chainId;
    broadcast(`market:${chainId}`, event.type, event.data);
    // Also broadcast to token-specific channels if applicable
    if (Array.isArray(event.data)) {
      for (const item of event.data) {
        const addr = item?.pair?.baseAddress || item?.tokenAddress;
        if (addr) {
          broadcast(`token:${chainId}:${addr}`, event.type, item);
        }
      }
    }
  }));

  // Forward health updates
  unsubscribeFns.push(onHealthUpdate((report: InfraHealthReport) => {
    broadcast('health:update', 'health', report);
  }));

  // Forward pipeline state
  unsubscribeFns.push(onPipelineState((state: PipelineState) => {
    broadcast('pipeline:state', 'state', state);
  }));
}

export function stopWsGateway() {
  unsubscribeFns.forEach(fn => fn());
  unsubscribeFns = [];
  subscriptions.clear();
}

// ── Stats ─────────────────────────────────────────────────────

export function getWsGatewayStats() {
  let totalSubs = 0;
  subscriptions.forEach(set => { totalSubs += set.size; });
  return { channels: subscriptions.size, subscribers: totalSubs, sequence };
}