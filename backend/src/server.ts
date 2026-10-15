/**
 * BSTONKEX WebSocket Gateway Server
 * 
 * Production-ready WebSocket server that matches the frontend's WS client protocol.
 * Handles subscriptions, heartbeat, reconnection, sequence tracking, and backpressure.
 * 
 * Protocol matches src/lib/engine/realtime-ws.ts on the frontend.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { healthHandler, readyHandler, wsHealthHandler } from './health.js';
import { MarketPipeline } from './market-pipeline.js';
import { routeDegen } from './degen-routes.js';
import { isDbConfigured, pingDb, closePool, getDbStatus } from './db/pool.js';
import { runMigrations, getMigrationStatus } from './db/migrate.js';
import { routeRewards } from './reward-routes.js';
import { LAUNCHPAD_CONFIG, getAllLaunchpads, getLaunchpad } from './config/launchpads.js';
import { startMultiChainListeners, getListenerHealth, stopMultiChainListeners } from './multi-chain-listener.js';
import { upsertMarketToken, getTokenCount, getTokensByChain, queryTokensPaginated } from './db/market-tokens.js';
import { hsetAll, hgetall, zadd, zrevrange, getStoreStats } from './trenches-store.js';
import { startBootstrapSeed, getSeederHealth, isBootstrapReady, waitForBootstrap } from './bootstrap-seed.js';
import { ingestTrade, getCandles, getLatestCandle, getChartEngineStats, onCandleTick, ALL_INTERVALS, type CandleInterval, type CandleTick } from './chart-engine.js';

// ── Configuration ────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8080');
const HOST = process.env.HOST || '0.0.0.0';
const WS_PATH = process.env.WS_PATH || '/ws';
const WS_MAX_CONNECTIONS = parseInt(process.env.WS_MAX_CONNECTIONS || '1000');
const WS_HEARTBEAT_MS = parseInt(process.env.WS_HEARTBEAT_MS || '15000');
const WS_MAX_SUBS = parseInt(process.env.WS_MAX_SUBSCRIPTIONS_PER_CLIENT || '50');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Rate limiting for public API endpoints (0x quote/swap proxy)
const rateLimitMap = new Map<string, number[]>();

// ── 0x Integrator Fee Configuration ───────────────────────────
// Platform fee: 40 basis points (0.40%). Fee is collected in the buy token.
const SWAP_FEE_BPS = 40;
const SWAP_FEE_RECIPIENT = process.env.SWAP_FEE_RECIPIENT || '0x8c802d64ee2a88a1e312735b6b7db85b9e4fb70a';

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

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // Do NOT respond to WebSocket upgrade requests — let the WS server handle them
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    return;
  }

  // CORS headers
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Service-Key');

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
    readyHandler(req, res, { clients: clients.size, totalConnections, totalMessages }).catch(() => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: false, checks: { websocket: true, marketPipeline: true, rpcConnectivity: true, database: false, rewardProcessing: false } }));
    });
    return;
  }
  if (url.pathname === '/ws/health') {
    wsHealthHandler(req, res, clients);
    return;
  }

  // Degen Mode API routes
  if (url.pathname.startsWith('/degen/')) {
    if (routeDegen(req, res, url)) return;
  }

  // Reward + Auth API routes
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/rewards/')) {
    if (routeRewards(req, res, url)) return;
  }

  // Discovery API routes (Step 5)
  const discoveryRoute = discoveryRoutes[`${req.method} ${url.pathname}`];
  if (discoveryRoute) {
    discoveryRoute(req, res);
    return;
  }

  // Cached token hydration routes (Redis-compatible fast serve)
  const cachedRoute = cachedTokenRoutes[`${req.method} ${url.pathname}`];
  if (cachedRoute) {
    cachedRoute(req, res);
    return;
  }

  // Launchpad registry routes
  const launchpadRoute = launchpadRoutes[`${req.method} ${url.pathname}`];
  if (launchpadRoute) {
    launchpadRoute(req, res);
    return;
  }

  // ── 0x Quote Proxy ─────────────────────────────────────────
  // Proxies 0x Swap API v2 quote requests with server-side ZERO_EX_API_KEY.
  // Supports chains: 56 (BSC), 8453 (Base).
  // Robinhood Chain (4663) is NOT supported by 0x — returns 501.
  // GET /api/quote?chainId=56&src=0x...&dst=0x...&amount=123&slippageBps=100
  //
  // Response is mapped to 1inch-compatible format for frontend compatibility.
  // Security: Rate-limited per IP, parameter-validated, CORS-restricted.
  if (url.pathname === '/api/quote' && req.method === 'GET') {
    // Rate limiting: max 30 requests per minute per IP
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 60_000;
    const maxRequests = 30;
    if (!rateLimitMap.has(clientIp as string)) rateLimitMap.set(clientIp as string, []);
    const requests = rateLimitMap.get(clientIp as string)!.filter(t => now - t < windowMs);
    if (requests.length >= maxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in 60 seconds.' }));
      return;
    }
    requests.push(now);
    rateLimitMap.set(clientIp as string, requests);

    const zeroExKey = process.env.ZERO_EX_API_KEY;
    if (!zeroExKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ZERO_EX_API_KEY not configured on backend. Set server-side env variable.' }));
      return;
    }

    const chainId = url.searchParams.get('chainId');
    const src = url.searchParams.get('src');
    const dst = url.searchParams.get('dst');
    const amount = url.searchParams.get('amount');
    const slippageBps = url.searchParams.get('slippageBps') || '100';
    const taker = url.searchParams.get('taker');

    // 0x-supported chains only
    const allowedChains = ['56', '8453'];
    if (!chainId || !allowedChains.includes(chainId)) {
      const status = chainId === '4663' ? 501 : 400;
      const msg = chainId === '4663'
        ? 'Robinhood Chain (4663) is not supported by 0x Swap API. Chain unavailable.'
        : `Invalid chainId. Allowed: ${allowedChains.join(', ')}`;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
      return;
    }
    if (!src || !dst || !amount || !taker) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required params: src, dst, amount, taker' }));
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(src) || !/^0x[0-9a-fA-F]{40}$/.test(dst) || !/^0x[0-9a-fA-F]{40}$/.test(taker)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid address format' }));
      return;
    }
    if (!/^\d{1,30}$/.test(amount) || amount === '0') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid amount. Must be positive integer ≤ 30 digits.' }));
      return;
    }

    // Proxy to 0x Swap API v2 — with integrator fee (buy token preferred)
    const feeToken = dst; // fee collected in buy token
    const zeroExUrl = `https://api.0x.org/swap/allowance-holder/quote?chainId=${chainId}&sellToken=${src}&buyToken=${dst}&sellAmount=${amount}&slippageBps=${slippageBps}&taker=${taker}&swapFeeRecipient=${SWAP_FEE_RECIPIENT}&swapFeeBps=${SWAP_FEE_BPS}&swapFeeToken=${feeToken}`;
    fetch(zeroExUrl, {
      headers: {
        '0x-api-key': zeroExKey,
        '0x-version': 'v2',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    }).then(async (upstream) => {
      const origin = req.headers.origin || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Provider': '0x',
        'X-Provider-Status': String(upstream.status),
      };
      if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin || '*';
      }

      if (!upstream.ok) {
        const errBody = await upstream.text();
        res.writeHead(upstream.status, headers);
        res.end(errBody);
        return;
      }

      // Map 0x response to 1inch-compatible format for frontend
      const z = await upstream.json();
      const fills = z.route?.fills || [];
      const hops = fills.map((f: any) => [{
        name: f.source || '0x',
        part: parseFloat(f.proportionBps || '10000') / 10000,
        partAddress: f.to || '',
      }]);
      const mapped = {
        dstAmount: z.buyAmount || '0',
        srcAmount: z.sellAmount || amount,
        gas: z.gas?.toString() || '300000',
        priceImpact: parseFloat(z.estimatedPriceImpact || '0'),
        protocols: hops.length > 0 ? [hops] : [[[{ name: '0x', part: 1, partAddress: '' }]]],
        // Pass through 0x-specific data for swap building
        _zeroEx: {
          buyAmount: z.buyAmount,
          sellAmount: z.sellAmount,
          minBuyAmount: z.minBuyAmount,
          gas: z.gas,
          issues: z.issues,
          fees: z.fees,
        },
      };
      res.writeHead(200, headers);
      res.end(JSON.stringify(mapped));
    }).catch((err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `0x upstream error: ${err.message}` }));
    });
    return;
  }

  // ── 0x Swap TX Proxy ───────────────────────────────────────
  // Proxies 0x Swap API v2 swap transaction building.
  // Returns unsigned transaction data for user wallet signing.
  // GET /api/swap?chainId=56&src=0x...&dst=0x...&amount=123&slippageBps=100&from=0x...
  if (url.pathname === '/api/swap' && req.method === 'GET') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 60_000;
    const maxRequests = 30;
    if (!rateLimitMap.has(clientIp as string)) rateLimitMap.set(clientIp as string, []);
    const requests = rateLimitMap.get(clientIp as string)!.filter(t => now - t < windowMs);
    if (requests.length >= maxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded.' }));
      return;
    }
    requests.push(now);
    rateLimitMap.set(clientIp as string, requests);

    const zeroExKey = process.env.ZERO_EX_API_KEY;
    if (!zeroExKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ZERO_EX_API_KEY not configured.' }));
      return;
    }

    const chainId = url.searchParams.get('chainId');
    const src = url.searchParams.get('src');
    const dst = url.searchParams.get('dst');
    const amount = url.searchParams.get('amount');
    const slippageBps = url.searchParams.get('slippageBps') || '100';
    const from = url.searchParams.get('from');

    const allowedChains = ['56', '8453'];
    if (!chainId || !allowedChains.includes(chainId)) {
      const status = chainId === '4663' ? 501 : 400;
      const msg = chainId === '4663'
        ? 'Robinhood Chain (4663) is not supported by 0x Swap API.'
        : `Invalid chainId. Allowed: ${allowedChains.join(', ')}`;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
      return;
    }
    if (!src || !dst || !amount || !from) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required params: src, dst, amount, from' }));
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(src) || !/^0x[0-9a-fA-F]{40}$/.test(dst) || !/^0x[0-9a-fA-F]{40}$/.test(from)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid address format' }));
      return;
    }
    if (!/^\d{1,30}$/.test(amount) || amount === '0') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid amount.' }));
      return;
    }

    // Proxy to 0x Swap API v2 (swap endpoint — POST with JSON body per 0x API contract)
    const feeToken = dst; // fee collected in buy token (same as quote)
    const zeroExSwapBody = JSON.stringify({
      chainId: parseInt(chainId),
      sellToken: src,
      buyToken: dst,
      sellAmount: amount,
      slippageBps: parseInt(slippageBps),
      taker: from,
      swapFeeRecipient: SWAP_FEE_RECIPIENT,
      swapFeeBps: SWAP_FEE_BPS,
      swapFeeToken: feeToken,
    });
    fetch('https://api.0x.org/swap/allowance-holder/swap', {
      method: 'POST',
      headers: {
        '0x-api-key': zeroExKey,
        '0x-version': 'v2',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: zeroExSwapBody,
      signal: AbortSignal.timeout(15000),
    }).then(async (upstream) => {
      const origin = req.headers.origin || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Provider': '0x',
        'X-Provider-Status': String(upstream.status),
      };
      if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin || '*';
      }

      if (!upstream.ok) {
        const errBody = await upstream.text();
        res.writeHead(upstream.status, headers);
        res.end(errBody);
        return;
      }

      const z = await upstream.json();
      // Return the 0x transaction object in a flat format for the frontend
      const tx = z.transaction || {};
      const mapped = {
        to: tx.to || '',
        data: tx.data || '0x',
        value: tx.value || '0',
        gas: tx.gas || '300000',
        gasPrice: tx.gasPrice || '',
        // Include swap details for reference
        buyAmount: z.buyAmount || '0',
        sellAmount: z.sellAmount || amount,
        minBuyAmount: z.minBuyAmount || '0',
        fees: z.fees,
      };
      res.writeHead(200, headers);
      res.end(JSON.stringify(mapped));
    }).catch((err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `0x upstream error: ${err.message}` }));
    });
    return;
  }

  // ── Robinhood Alchemy RPC Proxy ────────────────────────────
  // Proxies JSON-RPC requests to Alchemy using server-side RH_ALCHEMY_API_KEY.
  // The API key is NEVER exposed to the browser bundle.
  if (url.pathname === '/rpc/robinhood' && req.method === 'POST') {
    const alchemyKey = process.env.RH_ALCHEMY_API_KEY;
    if (!alchemyKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Robinhood RPC not configured' } }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const alchemyUrl = `https://robinhood-mainnet.g.alchemy.com/v2/${alchemyKey}`;
        const upstream = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(15000),
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(data);
      } catch (err: any) {
        log('error', `Alchemy proxy error: ${err.message}`);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Upstream RPC error' } }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ── WebSocket Server ─────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
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

  ws.on('message', (data: RawData) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      handleMessage(client, msg);
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    log('info', `Client disconnected (${clients.size} active)`);
  });

  ws.on('error', (err: Error) => {
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

      // Forward market channel subscriptions to the pipeline so it fetches data
      if (channel.startsWith('market:')) {
        const parts = channel.split(':');
        if (parts.length >= 3) {
          const chainId = parts[1];
          const address = parts[2];
          pipeline.addSubscription(chainId, address, address.slice(0, 10));
          log('info', `Pipeline subscription added: ${chainId}:${address}`);
        }
      }

      // Chart channel: send initial candle snapshot on subscribe
      if (channel.startsWith('chart:')) {
        const parts = channel.split(':');
        if (parts.length >= 3) {
          const mint = parts[1];
          const interval = parts[2] as CandleInterval;
          if (ALL_INTERVALS.includes(interval)) {
            const history = getCandles(mint, interval, 200);
            send(client.ws, { type: 'chart_snapshot', channel, candles: history, timestamp: Date.now() });
          }
        }
      }

      // Trade channel: send recent trade history on subscribe
      if (channel.startsWith('trades:')) {
        const mint = channel.split(':')[1];
        if (mint) {
          const tokenData = hgetall(`token:${mint}`);
          send(client.ws, {
            type: 'trades_snapshot',
            channel,
            mint,
            token: tokenData,
            timestamp: Date.now(),
          });
        }
      }

      // Confirm subscription
      send(client.ws, { type: 'subscribed', channel, timestamp: Date.now() });
      break;
    }

    case 'unsubscribe': {
      const channel = msg.channel as string;
      if (!channel) break;
      
      client.subscriptions.delete(channel);

      // Remove pipeline subscription if no other clients need this channel
      if (channel.startsWith('market:')) {
        const hasOther = [...clients.values()].some(
          c => c.ws !== client.ws && c.subscriptions.has(channel)
        );
        if (!hasOther) {
          const parts = channel.split(':');
          if (parts.length >= 3) {
            pipeline.removeSubscription(parts[1], parts[2]);
            log('info', `Pipeline subscription removed: ${parts[1]}:${parts[2]}`);
          }
        }
      }

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

function formatMcap(n: number): string {
  if (!n || isNaN(n)) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

// ── Chart Engine: Broadcast candle ticks to subscribed clients ──

onCandleTick((tick: CandleTick) => {
  const channel = `chart:${tick.mint}:${tick.interval}`;
  broadcast(channel, {
    event: 'candle_tick',
    time: tick.candle.time,
    open: tick.candle.open,
    high: tick.candle.high,
    low: tick.candle.low,
    close: tick.candle.close,
    volume: tick.candle.volume,
    buyVolume: tick.candle.buyVolume,
    sellVolume: tick.candle.sellVolume,
    trades: tick.candle.trades,
    status: tick.candle.status,
    isNew: tick.isNew,
  });

  // Also broadcast individual trade_tick to trades:<mint> subscribers
  broadcast(`trades:${tick.mint}`, {
    type: 'trade_tick',
    channel: `trades:${tick.mint}`,
    mint: tick.mint,
    interval: tick.interval,
    time: tick.candle.time,
    open: tick.candle.open,
    high: tick.candle.high,
    low: tick.candle.low,
    close: tick.candle.close,
    volume: tick.candle.volume,
    side: tick.candle.buyVolume > tick.candle.sellVolume ? 'buy' : 'sell',
    priceUsd: tick.candle.close,
    timestamp: Date.now(),
  });
});

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
  const eventData = event as unknown as Record<string, unknown>;
  broadcast(channel, eventData);
  
  // Also broadcast to wildcard subscribers
  broadcast('*', eventData);
});

// Start market data polling
pipeline.start(parseInt(process.env.POLL_INTERVAL_MS || '15000'));

// ── Discovery Refresh Endpoint (Step 5) ──────────────────────
// POST /api/discovery/refresh — triggers a bounded discovery cycle.
// GET  /api/discovery/status  — returns adapter health and cursor info.
//
// This endpoint allows the frontend (or an external scheduler) to trigger
// discovery without running per-visitor background loops.
// The backend uses its own state — no Gitlawb dependency.

interface DiscoveryState {
  lastRunAt: number | null;
  lastError: string | null;
  tokensDiscovered: number;
  isRunning: boolean;
}

const discoveryState: DiscoveryState = {
  lastRunAt: null,
  lastError: null,
  tokensDiscovered: 0,
  isRunning: false,
};

// Scheduled discovery (server-side) — runs if DISCOVERY_INTERVAL_MS is set
const DISCOVERY_INTERVAL_MS = parseInt(process.env.DISCOVERY_INTERVAL_MS || '0');

// ── Server-Side PumpPortal Stream ──────────────────────────
// Maintains a persistent WebSocket to PumpPortal for real-time token events.
// Stores tokens in memory and serves them via /api/discovery/tokens.

interface ServerToken {
  mint: string; name: string; symbol: string; creator: string;
  virtualSol: number; virtualTokens: number; spotPrice: number;
  bondingCurveProgress: number; createdAt: number;
}

const serverTokens = new Map<string, ServerToken>();
const MAX_SERVER_TOKENS = 500;
let pumpWs: WebSocket | null = null;
let pumpConnected = false;
let pumpReconnects = 0;
let pumpTokensReceived = 0;
let pumpLastError: string | null = null;

function connectPumpPortal(): void {
  if (pumpWs) return;
  try {
    pumpWs = new WebSocket('wss://pumpportal.fun/api/data');

    pumpWs.on('open', () => {
      pumpConnected = true;
      pumpLastError = null;
      log('info', 'PumpPortal WebSocket connected');
      pumpWs!.send(JSON.stringify({ method: 'subscribeNewToken' }));
      pumpWs!.send(JSON.stringify({ method: 'subscribeTokenTrade' })); // ← feeds chart engine!
    });

    pumpWs.on('message', (raw: Buffer) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.txType === 'create' && data.mint) {
          const spotPrice = data.vSolInBondingCurve / data.vTokensInBondingCurve;
          const solInCurve = data.vSolInBondingCurve || 30;
          const progress = Math.min(100, (solInCurve / 85) * 100);

          serverTokens.set(data.mint, {
            mint: data.mint,
            name: data.name || 'Unknown',
            symbol: data.symbol || '???',
            creator: data.traderPublicKey || '',
            virtualSol: data.vSolInBondingCurve || 0,
            virtualTokens: data.vTokensInBondingCurve || 0,
            spotPrice,
            bondingCurveProgress: progress,
            createdAt: Date.now(),
          });

          if (serverTokens.size > MAX_SERVER_TOKENS) {
            const oldest = [...serverTokens.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
            if (oldest) serverTokens.delete(oldest[0]);
          }

          pumpTokensReceived++;

          // Store + enrich via async pipeline (Redis-compatible)
          ingestTokenEvent({
            mint: data.mint,
            symbol: data.symbol,
            name: data.name,
            uri: data.uri || data.metadataUri,
            icon: data.icon || data.image || '',
            chain: 'sol',
            launchpad: 'pumpfun',
            price: String(spotPrice),
          });

          // Broadcast to all connected WebSocket clients
          const tokenData = JSON.stringify({ type: 'NEW_LAUNCHPAD_TOKEN', data: serverTokens.get(data.mint) });
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(tokenData);
            }
          });
        }

        // ── Real buy/sell trades → chart engine ──────────────
        if ((data.txType === 'buy' || data.txType === 'sell') && data.mint) {
          const solUsd = 200; // Approximate SOL price (updated by sol-price module)
          const spotPrice = (data.vSolInBondingCurve || 0) / (data.vTokensInBondingCurve || 1);
          const tradeUsd = (data.solAmount || 0) * solUsd;
          const priceUsd = spotPrice * solUsd;

          ingestTrade({
            mint: data.mint,
            chain: 'solana',
            priceUsd,
            volumeUsd: tradeUsd,
            side: data.txType,
            timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
          });

          // Update server token cache with latest price
          const cached = serverTokens.get(data.mint);
          if (cached) {
            cached.spotPrice = spotPrice;
            cached.virtualSol = data.vSolInBondingCurve || 0;
            cached.virtualTokens = data.vTokensInBondingCurve || 0;
          }
        }
      } catch { /* malformed */ }
    });

    pumpWs.on('error', (err: Error) => {
      pumpLastError = err.message;
      log('error', `PumpPortal WS error: ${err.message}`);
    });

    pumpWs.on('close', () => {
      pumpConnected = false;
      pumpWs = null;
      pumpReconnects++;
      log('warn', 'PumpPortal WS closed — reconnecting in 5s');
      setTimeout(connectPumpPortal, 5000);
    });
  } catch (e: any) {
    pumpLastError = e.message;
    pumpConnected = false;
    pumpWs = null;
    setTimeout(connectPumpPortal, 5000);
  }
}

// Bootstrap existing market data from DexScreener + GeckoTerminal
// Runs non-blocking: populates trenches-store immediately so /api/tokens/cached returns data
startBootstrapSeed();

// Start PumpPortal stream on server boot
connectPumpPortal();

// Start Multi-Chain Factory Event Listeners
startMultiChainListeners(
  // Ingest callback: writes to trenches-store + enriches metadata
  (event) => ingestTokenEvent(event),
  // Broadcast callback: push to all connected WS clients
  (data) => {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  },
);

// Discovery routes now include token data + PumpPortal health
const discoveryRoutes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {
  'GET /api/discovery/status': (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...discoveryState,
      scheduledEnabled: DISCOVERY_INTERVAL_MS > 0,
      scheduledIntervalMs: DISCOVERY_INTERVAL_MS || null,
      pumpportal: {
        connected: pumpConnected,
        tokensReceived: pumpTokensReceived,
        reconnects: pumpReconnects,
        lastError: pumpLastError,
        trackedTokens: serverTokens.size,
      },
    }));
  },
  'GET /api/discovery/tokens': (_req, res) => {
    const tokens = [...serverTokens.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tokens, total: serverTokens.size, pumpConnected }));
  },
  'POST /api/discovery/refresh': (_req, res) => {
    if (!pumpConnected) connectPumpPortal();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, pumpConnected, trackedTokens: serverTokens.size }));
  },
  // GET /api/tokens/trenches/:platform — serve stored tokens (Redis-compatible sorted-set + hash)
  'GET /api/tokens/trenches/pumpfun': (_req, res) => {
    try {
      const mints: string[] = zrevrange('trenches:pumpfun', 0, 49);
      if (!mints || mints.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      const tokens = mints.map((mint: string) => hgetall(`token:${mint}`)).filter((t: any) => t && t.mint);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tokens));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },
  // GET /api/v1/tokens/trending — unified trending endpoint for frontend
  'GET /api/v1/tokens/trending': (_req, res) => {
    try {
      const mints: string[] = zrevrange('trenches:pumpfun', 0, 49);
      if (!mints || mints.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: [] }));
        return;
      }
      const tokens = mints.map((mint: string) => hgetall(`token:${mint}`)).filter((t: any) => t && t.mint);
      const formatted = tokens.map((t: any) => ({
        mint: t.mint,
        chain: t.chain || 'solana',
        name: t.name || 'Unknown',
        symbol: t.symbol || '???',
        image: t.image || t.logo || null,
        priceUsd: parseFloat(t.priceUsd) || 0,
        priceChange24h: parseFloat(t.priceChange24h) || 0,
        volume24h: parseFloat(t.volume24h) || 0,
        mcapFormatted: t.mcapFormatted || formatMcap(parseFloat(t.mcap) || 0),
        mcap: parseFloat(t.mcap) || 0,
        bondingCurveProgress: parseFloat(t.bondingCurveProgress) || 0,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: formatted }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },
  // GET /api/v1/tokens/all — paginated PostgreSQL query (81K+ tokens)
  'GET /api/v1/tokens/all': async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const norm = (v: string | null, fallback: string) =>
        (v || fallback).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      const chain = url.searchParams.get('chain') || undefined;
      const launchpad = url.searchParams.get('launchpad') || undefined;
      const sortBy = norm(url.searchParams.get('sortBy'), 'updated_at') as any;
      const sortDir = norm(url.searchParams.get('sortDir'), 'DESC') as 'DESC' | 'ASC';
      const offset = parseInt(url.searchParams.get('offset') || '0') || 0;
      const limit = parseInt(url.searchParams.get('limit') || '50') || 50;

      const result = await queryTokensPaginated({ chain, launchpad, sortBy, sortDir, offset, limit });

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },
};

// ── Launchpad Registry Routes ──────────────────────────────────
const launchpadRoutes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {
  // GET /api/launchpads — full registry with chain context
  'GET /api/launchpads': (_req, res) => {
    const launchpads = getAllLaunchpads();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      launchpads,
      storeStats: getStoreStats(),
      pumpportal: {
        connected: pumpConnected,
        tokensReceived: pumpTokensReceived,
        reconnects: pumpReconnects,
      },
      timestamp: Date.now(),
    }));
  },

  // GET /api/launchpads/status — per-chain readiness + token counts + listener health
  'GET /api/launchpads/status': (_req, res) => {
    const health = getListenerHealth();
    const healthMap = new Map<string, typeof health[number]>();
    for (const h of health) healthMap.set(`${h.chain}:${h.launchpad}`, h);

    const status: Record<string, { chainId: string | number; launchpads: Array<{
      id: string; name: string; tokenCount: number; hasData: boolean;
      listenerConnected: boolean; eventsReceived: number; lastError: string | null;
    }> }> = {};

    for (const [chainKey, config] of Object.entries(LAUNCHPAD_CONFIG)) {
      status[chainKey] = {
        chainId: config.chainId,
        launchpads: config.launchpads.map(lp => {
          const flatKey = `trenches:${lp.id}`;
          const mints = zrevrange(flatKey, 0, -1) || [];
          const h = healthMap.get(`${chainKey}:${lp.id}`);
          return {
            id: lp.id,
            name: lp.name,
            tokenCount: mints.length,
            hasData: mints.length > 0,
            listenerConnected: h?.connected || false,
            eventsReceived: h?.eventsReceived || 0,
            lastError: h?.lastError || null,
          };
        }),
      };
    }

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status, seeder: getSeederHealth(), timestamp: Date.now() }));
  },

  // GET /api/tokens/trenches/:launchpadId — generic launchpad token lookup
  'GET /api/tokens/trenches/generic': (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const lp = (url.searchParams.get('launchpad') || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const mints = zrevrange(`trenches:${lp}`, 0, 49) || [];
      const tokens = mints.map((m: string) => hgetall(`token:${m}`)).filter((t: any) => t && t.mint);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(tokens));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },

  // GET /api/launchpads/ready — bootstrap readiness (200=ready, 503=loading)
  'GET /api/launchpads/ready': (_req, res) => {
    const ready = isBootstrapReady();
    const health = getSeederHealth();
    res.writeHead(ready ? 200 : 503, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(JSON.stringify({
      ready,
      tokensSeeded: health.totalTokensSeeded,
      uniqueMints: health.uniqueMints,
    }));
  },

  // GET /api/launchpads/persistence — persistence layer status
  'GET /api/launchpads/persistence': async (_req, res) => {
    const dbConfigured = isDbConfigured();
    const seeder = getSeederHealth();
    let dbStatus: { connected: boolean; tokenCount: number; byChain: Record<string, number> } = {
      connected: false, tokenCount: 0, byChain: {},
    };

    if (dbConfigured) {
      try {
        const connected = await pingDb();
        const tokenCount = connected ? await getTokenCount() : 0;
        const byChain = connected ? await getTokensByChain() : {};
        dbStatus = { connected, tokenCount, byChain };
      } catch { /* swallow */ }
    }

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      postgres: {
        configured: dbConfigured,
        connected: dbStatus.connected,
        tokenCount: dbStatus.tokenCount,
        byChain: dbStatus.byChain,
      },
      jsonSnapshot: {
        active: !dbConfigured || !dbStatus.connected,
        tokensInMemory: seeder.uniqueMints,
      },
      bootstrap: {
        ready: isBootstrapReady(),
        totalSeeded: seeder.totalTokensSeeded,
      },
      persistenceLevel: dbConfigured && dbStatus.connected
        ? 'DURABLE — PostgreSQL, survives Railway restarts'
        : 'EPHEMERAL — JSON snapshot only, lost on Railway restart',
    }));
  },

  // GET /api/v1/chart/history — Historical OHLCV candles
  'GET /api/v1/chart/history': (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const mint = url.searchParams.get('mint') || '';
    const interval = (url.searchParams.get('interval') || '1m') as CandleInterval;
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '500') || 500));

    if (!mint) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Missing required parameter: mint' }));
      return;
    }

    if (!ALL_INTERVALS.includes(interval)) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: `Invalid interval. Valid: ${ALL_INTERVALS.join(', ')}` }));
      return;
    }

    const candles = getCandles(mint, interval, limit);
    const latest = getLatestCandle(mint, interval);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=5' });
    res.end(JSON.stringify({
      mint,
      interval,
      candles,
      latest,
      count: candles.length,
      engine: 'chart-engine-v1',
    }));
  },

  // GET /api/v1/chart/stats — Chart engine diagnostics
  'GET /api/v1/chart/stats': (_req, res) => {
    const stats = getChartEngineStats();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      ...stats,
      memoryFormatted: `${(stats.memoryBytes / 1024 / 1024).toFixed(2)} MB`,
      intervals: ALL_INTERVALS,
    }));
  },
};
const IPFS_GATEWAYS = [
  'https://cf-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
];

function extractIpfsHash(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) return uri.replace('ipfs://', '').replace(/^ipfs\//, '');
  const match = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function sanitizeUri(uri: string | undefined | null): string {
  if (!uri) return '';
  const hash = extractIpfsHash(uri);
  if (hash) return 'https://cf-ipfs.com/ipfs/' + hash;
  return uri; // Already HTTPS non-IPFS — keep as-is
}

function buildGatewayUrls(uri: string): string[] {
  const hash = extractIpfsHash(uri);
  if (!hash) return [uri]; // Already HTTPS — single attempt
  return IPFS_GATEWAYS.map(gw => gw + hash);
}

async function fetchWithGatewayRotation(urls: string[], timeoutMs = 4000): Promise<any | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) return await response.json();
      if (response.status === 429) continue; // Rate limited — try next gateway
    } catch { /* Try next gateway */ }
  }
  return null;
}

// ── Async Metadata Enrichment (multi-gateway IPFS + Socials) ───
// Matches BullMQ metadata-enrichment worker pattern with concurrency control
const metadataQueue: Array<{ mint: string; uri: string; chain: string; attempts: number }> = [];
let metadataInFlight = 0;
const METADATA_CONCURRENCY = 10;
const METADATA_MAX_ATTEMPTS = 3;

function enqueueMetadata(mint: string, uri: string, chain: string): void {
  if (!uri) return;
  metadataQueue.push({ mint, uri, chain, attempts: 0 });
  drainMetadataQueue();
}

async function drainMetadataQueue(): Promise<void> {
  while (metadataQueue.length > 0 && metadataInFlight < METADATA_CONCURRENCY) {
    const job = metadataQueue.shift()!;
    metadataInFlight++;
    fetchMetadataAndEnrich(job.mint, job.uri, job.chain)
      .catch(() => {
        // Retry on failure
        if (job.attempts < METADATA_MAX_ATTEMPTS) {
          job.attempts++;
          metadataQueue.push(job);
        }
      })
      .finally(() => { metadataInFlight--; drainMetadataQueue(); });
  }
}

async function fetchMetadataAndEnrich(mint: string, uri: string, _chain?: string) {
  try {
    const urls = buildGatewayUrls(uri);
    const meta = await fetchWithGatewayRotation(urls);
    if (!meta) return;

    const rawImage = meta.image || meta.image_uri || meta.image_url || '';

    // Always store as cf-ipfs.com HTTPS URL (fast, non-rate-limited)
    const imageUrl = sanitizeUri(rawImage);

    hsetAll(`token:${mint}`, {
      image: imageUrl,
      twitter: meta.twitter || meta.extensions?.twitter || '',
      telegram: meta.telegram || meta.extensions?.telegram || '',
      website: meta.website || meta.extensions?.website || '',
    });
  } catch {
    // Silent fail — metadata enrichment is best-effort
  }
}

// ── Token Event Ingestion with Async Metadata ──────────────────
function ingestTokenEvent(event: {
  mint: string; symbol?: string; name?: string; uri?: string;
  chain?: string; launchpad?: string; price?: string; icon?: string;
}) {
  const { mint, symbol, name, uri, chain, launchpad, price, icon } = event;
  const ch = (chain || 'sol').toLowerCase();
  const lp = (launchpad || 'pumpfun').toLowerCase();

  // Resolve image: use direct icon if provided, else sanitize from IPFS URI
  const directImage = icon ? sanitizeUri(icon) : '';

  // A. Immediate base record (image from icon or pending enrichment)
  hsetAll(`token:${mint}`, {
    mint,
    symbol: symbol || 'TOKEN',
    name: name || 'Unknown Token',
    chain: ch,
    launchpad: lp,
    uri: sanitizeUri(uri),
    image: directImage,
    twitter: '', telegram: '', website: '',
    spotPrice: price || '0.0000',
    virtualMcap: price ? String(parseFloat(price) * 1e9) : '6000',
    priceChange24h: '0.00',
    bondingCurveProgress: '0',
    holders: '0',
    createdAt: String(Date.now()),
  });

  // B. Index into ALL sorted sets (including tokens:{chain} for fallback)
  const now = Date.now();
  zadd(`trenches:${ch}:${lp}:new`, now, mint);
  zadd(`trenches:${ch}:${lp}:trending`, now, mint);
  zadd(`trenches:${ch}:${lp}`, now, mint);
  zadd(`trenches:${lp}`, now, mint);
  zadd(`tokens:${ch}`, now, mint);
  zadd('trenches:pumpfun', now, mint);

  // C. Persist to PostgreSQL (durable — survives restarts)
  upsertMarketToken({
    mint, name: name || 'Unknown Token', symbol: symbol || 'TOKEN',
    image: directImage, chain: ch, launchpad: lp,
    spotPrice: price || '0', virtualMcap: price ? String(parseFloat(price) * 1e9) : '6000',
    priceChange24h: '0', bondingCurveProgress: '0', holders: '0',
    volume24h: '0', liquidity: '0', buys24h: '0', sells24h: '0',
    uri: sanitizeUri(uri), twitter: '', telegram: '', website: '',
    dexId: '', pairAddress: '', txHash: '', source: 'live',
    createdAt: String(Date.now()),
  }).catch(() => {}); // non-blocking

  // D. Feed chart engine with initial price point (generates seed candles)
  const priceNum = parseFloat(price || '0');
  if (priceNum > 0 && isFinite(priceNum)) {
    ingestTrade({
      mint, chain: ch,
      priceUsd: priceNum,
      volumeUsd: priceNum * 1e3, // Synthetic volume for initial candle
      side: 'buy',
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  // E. Async metadata enrichment (only if no direct icon)
  if (!directImage) {
    const cleanUri = sanitizeUri(uri);
    if (cleanUri) {
      enqueueMetadata(mint, cleanUri, ch);
    }
  }

  // F. Async security audit (RugCheck honeypot/LP/dev holding check)
  try {
    import('./security-auditor.js').then(({ auditTokenSecurity }) => {
      auditTokenSecurity(mint, ch).catch(() => {});
    }).catch(() => {});
  } catch { /* non-critical */ }
}

// ── Cached Token Hydration Endpoint ────────────────────────────
const cachedTokenRoutes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {
  'GET /api/tokens/cached': (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      // Normalize: strip non-alphanumeric, lowercase so PUMPFUN → pumpfun
      const norm = (v: string | null, fallback: string) =>
        (v || fallback).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const chain = norm(url.searchParams.get('chain'), 'sol');
      const launchpad = norm(url.searchParams.get('launchpad'), 'pumpfun');
      const filter = norm(url.searchParams.get('subFilter'), 'trending');

      // Priority 1: trenches:{chain}:{launchpad}:{filter}
      let mints: string[] = zrevrange(`trenches:${chain}:${launchpad}:${filter}`, 0, 49) || [];

      // Priority 2: trenches:{chain}:{launchpad} (no filter)
      if (mints.length === 0) {
        mints = zrevrange(`trenches:${chain}:${launchpad}`, 0, 49) || [];
      }

      // Priority 3: tokens:{chain} (chain-level token index)
      if (mints.length === 0) {
        mints = zrevrange(`tokens:${chain}`, 0, 49) || [];
      }

      // Priority 4: flat launchpad key trenches:{launchpad}
      if (mints.length === 0) {
        mints = zrevrange(`trenches:${launchpad}`, 0, 49) || [];
      }

      // Priority 5: scan all known launchpads on that chain
      if (mints.length === 0) {
        const chainLaunchpads = ['pumpfun', 'bags', 'stonkfun', 'flap', 'fourmeme', 'genius',
          'o1exchange', 'stonk', 'openlaunch', 'pons', 'longpad', 'inkypump',
          'archway', 'stablefun', 'sunpump'];
        for (const lp of chainLaunchpads) {
          if (lp === launchpad) continue;
          for (const key of [`trenches:${chain}:${lp}:${filter}`, `trenches:${chain}:${lp}`, `trenches:${lp}`]) {
            mints = zrevrange(key, 0, 49) || [];
            if (mints.length > 0) break;
          }
          if (mints.length > 0) break;
        }
      }

      // Priority 6: global fallback — any tokens at all
      if (mints.length === 0) {
        mints = zrevrange('trenches:pumpfun', 0, 49) || [];
      }

      if (!mints || mints.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify([]));
        return;
      }

      const tokens = mints
        .map((mint: string) => hgetall(`token:${mint}`))
        .filter((t: any) => t && t.mint);

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(tokens));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message }));
    }
  },
};

// ── Database Initialization ───────────────────────────────────

async function initDatabase(): Promise<void> {
  if (!isDbConfigured()) {
    log('warn', '═══════════════════════════════════════════════════════════════');
    log('warn', '  DATABASE_URL not set — PostgreSQL DISABLED');
    log('warn', '  Market data will use JSON snapshot fallback only.');
    log('warn', '  Tokens will NOT survive Railway restarts.');
    log('warn', '  Add DATABASE_URL in Railway Variables to enable persistence.');
    log('warn', '═══════════════════════════════════════════════════════════════');
    return;
  }

  log('info', 'PostgreSQL configured — checking connection...');
  const reachable = await pingDb();
  if (!reachable) {
    log('error', 'PostgreSQL unreachable — market data will NOT persist across restarts');
    log('error', 'Check DATABASE_URL in Railway Variables');
    return;
  }

  log('info', 'PostgreSQL connected');
  try {
    const { applied, skipped } = await runMigrations();
    if (applied.length > 0) {
      log('info', `Migrations applied: ${applied.join(', ')}`);
    }
    if (skipped.length > 0) {
      log('info', `Migrations already applied: ${skipped.join(', ')}`);
    }
    const status = await getMigrationStatus();
    log('info', `Schema status: ${status.applied}/${status.total} migrations applied, ${status.pending} pending`);
    log('info', '═══ PostgreSQL PERSISTENCE ACTIVE ═══');
    log('info', '  Market tokens, trades, and rewards will survive restarts.');
    log('info', '═════════════════════════════════════');
  } catch (err: any) {
    log('error', `Migration failed: ${err.message}`);
    log('error', 'Market data will NOT persist until migrations succeed');
  }
}

// ── Start Server ─────────────────────────────────────────────

initDatabase().then(() => {
  httpServer.listen(PORT, HOST, () => {
    log('info', `BSTONKEX WebSocket Gateway listening on ${HOST}:${PORT}`);
    log('info', `WebSocket path: ${WS_PATH}`);
    log('info', `Max connections: ${WS_MAX_CONNECTIONS}`);
    log('info', `Heartbeat: ${WS_HEARTBEAT_MS}ms`);
    log('info', `Allowed origins: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'all'}`);
    const db = getDbStatus();
    log('info', `Database: ${db.configured ? (db.connected ? 'connected' : 'disconnected') : 'not configured'}`);
  });
});

// ── Graceful Shutdown ────────────────────────────────────────

process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down...');
  pipeline.stop();
  for (const [ws] of clients) {
    ws.close(1001, 'Server shutting down');
  }
  wss.close();
  closePool().catch(() => {});
  httpServer.close(() => {
    log('info', 'Server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('info', 'SIGINT received, shutting down...');
  process.exit(0);
});