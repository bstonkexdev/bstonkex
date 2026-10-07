/**
 * BSTONKEX WebSocket Gateway Server
 * 
 * Production-ready WebSocket server that matches the frontend's WS client protocol.
 * Handles subscriptions, heartbeat, reconnection, sequence tracking, and backpressure.
 * 
 * Protocol matches src/lib/engine/realtime-ws.ts on the frontend.
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { healthHandler, readyHandler, wsHealthHandler } from './health.js';
import { MarketPipeline } from './market-pipeline.js';

// ── Configuration ────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8080');
const HOST = process.env.HOST || '0.0.0.0';
const WS_PATH = process.env.WS_PATH || '/ws';
const WS_MAX_CONNECTIONS = parseInt(process.env.WS_MAX_CONNECTIONS || '1000');
const WS_HEARTBEAT_MS = parseInt(process.env.WS_HEARTBEAT_MS || '15000');
const WS_MAX_SUBS = parseInt(process.env.WS_MAX_SUBSCRIPTIONS_PER_CLIENT || '50');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// ── Types ────────────────────────────────────────────────────

interface Client {
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: number;
  lastPong: number;
  latency: number;
  sequence: Map<string, number>;
  messageCount: number;
  connectedAt: number;
}

// ── State ────────────────────────────────────────────────────

const clients = new Map<WebSocket, Client>();
let totalConnections = 0;
let totalMessages = 0;

// ── Logging ──────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', ...args: unknown[]) {
  const levels = { info: 0, warn: 1, error: 2 };
  if (levels[level] >= levels[LOG_LEVEL as keyof typeof levels] || level === 'error') {
    const ts = new Date().toISOString();
    console[level](`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

// ── HTTP Server ──────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  
  // CORS headers
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health endpoints
  if (url.pathname === '/health') {
    healthHandler(req, res, { clients: clients.size, totalConnections, totalMessages });
    return;
  }
  if (url.pathname === '/ready') {
    readyHandler(req, res, { clients: clients.size, totalConnections });
    return;
  }
  if (url.pathname === '/ws/health') {
    wsHealthHandler(req, res, clients);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ── WebSocket Server ─────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });

wss.on('connection', (ws, req) => {
  // Connection limit
  if (clients.size >= WS_MAX_CONNECTIONS) {
    ws.close(1013, 'Server at capacity');
    log('warn', `Connection rejected: at capacity (${WS_MAX_CONNECTIONS})`);
    return;
  }

  // Origin check
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    ws.close(4403, 'Origin not allowed');
    log('warn', `Connection rejected: invalid origin ${origin}`);
    return;
  }

  const client: Client = {
    ws,
    subscriptions: new Set(),
    lastPing: Date.now(),
    lastPong: Date.now(),
    latency: 0,
    sequence: new Map(),
    messageCount: 0,
    connectedAt: Date.now(),
  };

  clients.set(ws, client);
  totalConnections++;
  log('info', `Client connected (${clients.size} active)`);

  // Send welcome
  send(ws, { type: 'connected', timestamp: Date.now() });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(client, msg);
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    log('info', `Client disconnected (${clients.size} active)`);
  });

  ws.on('error', (err) => {
    log('error', `Client error: ${err.message}`);
    clients.delete(ws);
  });
});

// ── Message Handler ──────────────────────────────────────────

function handleMessage(client: Client, msg: Record<string, unknown>) {
  client.messageCount++;
  totalMessages++;

  switch (msg.type) {
    case 'ping':
      // Respond with pong — matches frontend heartbeat protocol
      send(client.ws, { type: 'pong', timestamp: msg.timestamp, serverTimestamp: Date.now() });
      client.lastPing = Date.now();
      break;

    case 'subscribe': {
      const channel = msg.channel as string;
      if (!channel) break;
      
      // Subscription limit
      if (client.subscriptions.size >= WS_MAX_SUBS) {
        send(client.ws, { type: 'error', message: 'Subscription limit reached', channel });
        break;
      }

      client.subscriptions.add(channel);
      log('info', `Subscribed: ${channel} (${client.subscriptions.size} subs)`);
      
      // Confirm subscription
      send(client.ws, { type: 'subscribed', channel, timestamp: Date.now() });
      break;
    }

    case 'unsubscribe': {
      const channel = msg.channel as string;
      if (!channel) break;
      
      client.subscriptions.delete(channel);
      send(client.ws, { type: 'unsubscribed', channel, timestamp: Date.now() });
      break;
    }

    default:
      // Unknown message type — ignore
      break;
  }
}

// ── Broadcast ────────────────────────────────────────────────

function broadcast(channel: string, data: Record<string, unknown>) {
  const msg = JSON.stringify({
    type: 'event',
    channel,
    ...data,
  });

  for (const [ws, client] of clients) {
    if (client.subscriptions.has(channel) || client.subscriptions.has('*')) {
      if (ws.readyState === WebSocket.OPEN) {
        // Backpressure: skip if client has too many buffered messages
        if (ws.bufferedAmount > 1024 * 1024) {
          log('warn', `Skipping broadcast to slow client (buffered: ${ws.bufferedAmount})`);
          continue;
        }
        
        // Assign sequence number per channel
        const seq = (client.sequence.get(channel) || 0) + 1;
        client.sequence.set(channel, seq);
        
        ws.send(JSON.stringify({
          type: 'event',
          channel,
          sequence: seq,
          timestamp: Date.now(),
          ...data,
        }));
      }
    }
  }
}

function send(ws: WebSocket, data: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ── Heartbeat ────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [ws, client] of clients) {
    // Check pong staleness (3x heartbeat interval)
    if (client.lastPong > 0 && now - client.lastPong > WS_HEARTBEAT_MS * 3) {
      log('info', `Closing stale client (no pong for ${now - client.lastPong}ms)`);
      ws.close(1000, 'Heartbeat timeout');
      clients.delete(ws);
      continue;
    }

    // Send ping
    if (ws.readyState === WebSocket.OPEN) {
      send(ws, { type: 'ping', timestamp: now });
      client.lastPing = now;
    }
  }
}, WS_HEARTBEAT_MS);

// ── Market Pipeline ──────────────────────────────────────────

const pipeline = new MarketPipeline();

// Forward market events to subscribed clients
pipeline.onEvent((event) => {
  const channel = `market:${event.chainId}:${event.tokenAddress}`;
  broadcast(channel, event);
  
  // Also broadcast to wildcard subscribers
  broadcast('*', event);
});

// Start market data polling
pipeline.start(parseInt(process.env.POLL_INTERVAL_MS || '15000'));

// ── Start Server ─────────────────────────────────────────────

httpServer.listen(PORT, HOST, () => {
  log('info', `BSTONKEX WebSocket Gateway listening on ${HOST}:${PORT}`);
  log('info', `WebSocket path: ${WS_PATH}`);
  log('info', `Max connections: ${WS_MAX_CONNECTIONS}`);
  log('info', `Heartbeat: ${WS_HEARTBEAT_MS}ms`);
  log('info', `Allowed origins: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'all'}`);
});

// ── Graceful Shutdown ────────────────────────────────────────

process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down...');
  pipeline.stop();
  for (const [ws] of clients) {
    ws.close(1001, 'Server shutting down');
  }
  wss.close();
  httpServer.close(() => {
    log('info', 'Server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('info', 'SIGINT received, shutting down...');
  process.exit(0);
});