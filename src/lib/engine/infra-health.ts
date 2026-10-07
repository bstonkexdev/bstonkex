// BSTONKEX Infrastructure Health — Production health monitoring for all components
// Tracks: RPC, WebSocket, indexer, cache, market pipeline, quote service, execution

import type { ChainId } from '../config';
import { CHAINS, CONFIGURED_CHAINS } from '../config';
import { wsManager } from './realtime-ws';

// ── Types ────────────────────────────────────────────────────

export type ComponentStatus = 'live' | 'delayed' | 'reconnecting' | 'stale' | 'offline' | 'blocked' | 'not_verified';

export interface ComponentHealth {
  name: string;
  status: ComponentStatus;
  latencyMs: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  errorMessage: string | null;
  metadata: Record<string, any>;
}

export interface ChainHealth {
  chainId: ChainId;
  rpc: ComponentHealth;
  websocket: ComponentHealth;
  indexer: ComponentHealth;
  marketData: ComponentHealth;
  quoteService: ComponentHealth;
}

export interface InfraHealthReport {
  timestamp: number;
  overallStatus: ComponentStatus;
  chains: ChainHealth[];
  cache: ComponentHealth;
  pipeline: ComponentHealth;
  frontend: ComponentHealth;
}

// ── Per-Component Health Trackers ─────────────────────────────

const chainHealthMap = new Map<ChainId, ChainHealth>();
const componentHealth = new Map<string, ComponentHealth>();
let healthListeners: ((report: InfraHealthReport) => void)[] = [];

function makeHealth(name: string, status: ComponentStatus = 'not_verified'): ComponentHealth {
  return {
    name,
    status,
    latencyMs: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    errorMessage: null,
    metadata: {},
  };
}

// ── Health Update API ─────────────────────────────────────────

export function reportSuccess(component: string, latencyMs: number, metadata?: Record<string, any>) {
  const existing = componentHealth.get(component) || makeHealth(component);
  existing.status = 'live';
  existing.latencyMs = latencyMs;
  existing.lastSuccessAt = Date.now();
  existing.errorMessage = null;
  if (metadata) existing.metadata = { ...existing.metadata, ...metadata };
  componentHealth.set(component, existing);
  emitHealthUpdate();
}

export function reportError(component: string, error: string, status: ComponentStatus = 'offline') {
  const existing = componentHealth.get(component) || makeHealth(component);
  existing.status = status;
  existing.lastErrorAt = Date.now();
  existing.errorMessage = error;
  componentHealth.set(component, existing);
  emitHealthUpdate();
}

export function reportStatus(component: string, status: ComponentStatus, metadata?: Record<string, any>) {
  const existing = componentHealth.get(component) || makeHealth(component);
  existing.status = status;
  if (metadata) existing.metadata = { ...existing.metadata, ...metadata };
  componentHealth.set(component, existing);
  emitHealthUpdate();
}

export function reportChainRpc(chainId: ChainId, latencyMs: number, blockNumber?: number) {
  reportSuccess(`rpc:${chainId}`, latencyMs, { blockNumber });
}

export function reportChainRpcError(chainId: ChainId, error: string) {
  reportError(`rpc:${chainId}`, error);
}

export function reportMarketDataFreshness(chainId: ChainId, lastUpdateAge: number) {
  const status: ComponentStatus = lastUpdateAge < 30_000 ? 'live'
    : lastUpdateAge < 120_000 ? 'delayed'
    : lastUpdateAge < 300_000 ? 'stale'
    : 'offline';
  reportStatus(`market:${chainId}`, status, { lastUpdateAge });
}

export function reportIndexerFreshness(chainId: ChainId, lastBlock: number, currentBlock: number) {
  const diff = currentBlock - lastBlock;
  const status: ComponentStatus = diff < 5 ? 'live'
    : diff < 50 ? 'delayed'
    : diff < 200 ? 'stale'
    : 'offline';
  reportStatus(`indexer:${chainId}`, status, { lastBlock, currentBlock, blockDiff: diff });
}

// ── Aggregate Health Report ───────────────────────────────────

function getChainHealth(chainId: ChainId): ChainHealth {
  const get = (key: string) => componentHealth.get(key) || makeHealth(key, 'not_verified');
  const wsState = wsManager.getState();
  const wsHealth: ComponentHealth = {
    name: `ws:${chainId}`,
    status: wsState === 'connected' ? 'live' : wsState === 'connecting' || wsState === 'reconnecting' ? 'reconnecting' : 'offline',
    latencyMs: wsManager.getLatency(),
    lastSuccessAt: wsState === 'connected' ? Date.now() : null,
    lastErrorAt: null,
    errorMessage: null,
    metadata: { wsState },
  };
  return {
    chainId,
    rpc: get(`rpc:${chainId}`),
    websocket: wsHealth,
    indexer: get(`indexer:${chainId}`),
    marketData: get(`market:${chainId}`),
    quoteService: get(`quote:${chainId}`),
  };
}

export function getHealthReport(): InfraHealthReport {
  const chains = CONFIGURED_CHAINS.map(c => getChainHealth(c.id));
  const cache = componentHealth.get('cache') || makeHealth('cache', 'not_verified');
  const pipeline = componentHealth.get('pipeline') || makeHealth('pipeline', 'not_verified');
  const frontend = componentHealth.get('frontend') || makeHealth('frontend', 'not_verified');

  // Determine overall status
  const allComponents = [...chains.flatMap(c => [c.rpc, c.websocket, c.indexer, c.marketData]), cache, pipeline];
  const hasBlocked = allComponents.some(c => c.status === 'blocked');
  const hasOffline = allComponents.some(c => c.status === 'offline');
  const hasStale = allComponents.some(c => c.status === 'stale');
  const hasReconnecting = allComponents.some(c => c.status === 'reconnecting');

  const overallStatus: ComponentStatus = hasBlocked ? 'blocked'
    : hasOffline ? 'offline'
    : hasReconnecting ? 'reconnecting'
    : hasStale ? 'stale'
    : 'live';

  return { timestamp: Date.now(), overallStatus, chains, cache, pipeline, frontend };
}

// ── Cache Stats ───────────────────────────────────────────────

export function reportCacheStats(hits: number, misses: number, size: number) {
  const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
  reportStatus('cache', hitRate > 0.5 ? 'live' : hitRate > 0.2 ? 'delayed' : 'stale', {
    hits, misses, hitRate: Math.round(hitRate * 100), size,
  });
}

// ── Listeners ─────────────────────────────────────────────────

let lastEmit = 0;
function emitHealthUpdate() {
  const now = Date.now();
  if (now - lastEmit < 1000) return; // Throttle to 1s
  lastEmit = now;
  const report = getHealthReport();
  healthListeners.forEach(l => l(report));
}

export function onHealthUpdate(cb: (report: InfraHealthReport) => void): () => void {
  healthListeners.push(cb);
  return () => { healthListeners = healthListeners.filter(l => l !== cb); };
}

// ── Status Badge Helpers ──────────────────────────────────────

export function statusColor(status: ComponentStatus): string {
  switch (status) {
    case 'live': return 'var(--green)';
    case 'delayed': return 'var(--amber)';
    case 'reconnecting': return 'var(--amber)';
    case 'stale': return 'var(--amber)';
    case 'offline': return 'var(--red)';
    case 'blocked': return 'var(--red)';
    case 'not_verified': return 'var(--text-dim)';
    default: return 'var(--text-dim)';
  }
}

export function statusIcon(status: ComponentStatus): string {
  switch (status) {
    case 'live': return '●';
    case 'delayed': return '◐';
    case 'reconnecting': return '↻';
    case 'stale': return '◑';
    case 'offline': return '○';
    case 'blocked': return '⊘';
    case 'not_verified': return '?';
    default: return '?';
  }
}

export function statusLabel(status: ComponentStatus): string {
  return status.replace(/_/g, ' ').toUpperCase();
}