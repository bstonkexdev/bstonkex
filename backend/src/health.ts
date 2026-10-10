/**
 * BSTONKEX Backend Health Endpoints
 * 
 * Provides /health, /ready, and /ws/health endpoints.
 * Never exposes secrets or API keys.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebSocket } from 'ws';
import { getDbStatus, pingDb } from './db/pool.js';

interface HealthContext {
  clients: number;
  totalConnections: number;
  totalMessages: number;
}

interface DependencyStatus {
  name: string;
  status: 'UP' | 'DEGRADED' | 'DOWN' | 'BLOCKED';
  latencyMs?: number;
  detail?: string;
}

interface HealthResponse {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  timestamp: string;
  uptime: number;
  dependencies: DependencyStatus[];
  metrics: {
    activeConnections: number;
    totalConnections: number;
    totalMessages: number;
  };
}

interface ReadyResponse {
  ready: boolean;
  checks: {
    websocket: boolean;
    marketPipeline: boolean;
    rpcConnectivity: boolean;
    database: boolean;
    rewardProcessing: boolean;
  };
}

interface WsHealthResponse {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  connections: number;
  maxConnections: number;
  utilization: number;
  metrics: {
    activeSubscriptions: number;
    avgLatency: number;
    staleClients: number;
  };
}

const startTime = Date.now();

// ── Health Handler ────────────────────────────────────────────

export function healthHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HealthContext
) {
  const dbStatus = getDbStatus();
  const dependencies: DependencyStatus[] = [
    { name: 'WebSocket', status: ctx.clients >= 0 ? 'UP' : 'DOWN' },
    { name: 'Market Pipeline', status: 'UP' },
    { name: 'RPC (BSC)', status: 'UP' },
    { name: 'RPC (Base)', status: 'UP' },
    { name: 'RPC (Solana)', status: 'UP' },
    { name: 'RPC (Robinhood)', status: process.env.ROBINHOOD_RPC_API_KEY ? 'UP' : 'BLOCKED' },
    {
      name: 'PostgreSQL',
      status: !dbStatus.configured ? 'BLOCKED' : dbStatus.connected ? 'UP' : 'DOWN',
      detail: dbStatus.configured
        ? dbStatus.connected ? undefined : 'Connection failed'
        : 'DATABASE_URL not configured',
    },
  ];

  const hasDown = dependencies.some(d => d.status === 'DOWN');
  const hasBlocked = dependencies.some(d => d.status === 'BLOCKED');
  const hasDegraded = dependencies.some(d => d.status === 'DEGRADED');

  const status = hasDown ? 'DOWN' : hasDegraded ? 'DEGRADED' : 'UP';

  const response: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    dependencies,
    metrics: {
      activeConnections: ctx.clients,
      totalConnections: ctx.totalConnections,
      totalMessages: ctx.totalMessages,
    },
  };

  res.writeHead(status === 'DOWN' ? 503 : 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
}

// ── Ready Handler ─────────────────────────────────────────────

export async function readyHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HealthContext
) {
  const dbOk = await pingDb();
  const response: ReadyResponse = {
    ready: true,
    checks: {
      websocket: true,
      marketPipeline: true,
      rpcConnectivity: true,
      database: dbOk,
      rewardProcessing: dbOk,
    },
  };

  // Not ready if database is configured but unreachable
  if (getDbStatus().configured && !dbOk) {
    response.ready = false;
    response.checks.rewardProcessing = false;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
}

// ── WS Health Handler ─────────────────────────────────────────

export function wsHealthHandler(
  req: IncomingMessage,
  res: ServerResponse,
  clients: Map<WebSocket, any>
) {
  const now = Date.now();
  let totalLatency = 0;
  let staleClients = 0;
  let totalSubs = 0;

  for (const [, client] of clients) {
    totalLatency += client.latency || 0;
    totalSubs += client.subscriptions?.size || 0;
    if (now - client.lastPong > 60000) {
      staleClients++;
    }
  }

  const avgLatency = clients.size > 0 ? totalLatency / clients.size : 0;
  const maxConn = parseInt(process.env.WS_MAX_CONNECTIONS || '1000');
  const utilization = clients.size / maxConn;

  let status: WsHealthResponse['status'];
  if (clients.size > 0 && staleClients === clients.size) {
    status = 'DOWN';
  } else if (utilization > 0.9 || staleClients > clients.size * 0.1) {
    status = 'DEGRADED';
  } else {
    status = 'UP';
  }

  const response: WsHealthResponse = {
    status,
    connections: clients.size,
    maxConnections: maxConn,
    utilization: Math.round(utilization * 100),
    metrics: {
      activeSubscriptions: totalSubs,
      avgLatency: Math.round(avgLatency),
      staleClients,
    },
  };

  res.writeHead(status === 'DOWN' ? 503 : 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
}