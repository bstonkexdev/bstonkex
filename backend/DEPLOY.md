# BSTONKEX Backend Deployment Guide

## Architecture

```
Blockchain/RPC → Chain Adapter → Indexer → Normalizer → Market Engine → WebSocket Gateway → BSTONKEX Frontend
```

## Components

### 1. WebSocket Gateway (`src/server.ts`)
- Production WebSocket server at `wss://api.bstonkex.xyz/ws`
- Matches frontend protocol in `src/lib/engine/realtime-ws.ts`
- Heartbeat, reconnect, subscriptions, sequence numbers, backpressure

### 2. Health Endpoints (`src/health.ts`)
- `GET /health` — Full health status with dependency checks
- `GET /ready` — Readiness probe for load balancer
- `GET /ws/health` — WebSocket-specific health metrics

### 3. Market Pipeline (`src/market-pipeline.ts`)
- Fetches real DexScreener data
- Normalizes into MarketStreamEvent format
- Broadcasts to subscribed WebSocket clients

## Environment Variables

See `backend/.env.example` for full configuration.

**Critical:**
- `ROBINHOOD_RPC_API_KEY` — Required for Robinhood Chain 4663 RPC access
- `ALLOWED_ORIGINS` — CORS origins (comma-separated)
- `PORT` — Server port (default: 8080)

**Never commit:**
- API keys
- RPC credentials
- Admin keys

## Deployment Steps

### 1. Prerequisites
- Node.js 18+ or Bun 1.0+
- Robinhood Chain API key (from Ankr, Alchemy, or Robinhood)
- DNS configured for `api.bstonkex.xyz`
- TLS certificate for WSS

### 2. Install Dependencies
```bash
cd backend
npm install  # or bun install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with production values
# Set ROBINHOOD_RPC_API_KEY
# Set ALLOWED_ORIGINS
```

### 4. Start Server
```bash
npm start  # or bun run src/server.ts
```

### 5. Verify Health
```bash
curl https://api.bstonkex.xyz/health
curl https://api.bstonkex.xyz/ready
curl https://api.bstonkex.xyz/ws/health
```

### 6. Test WebSocket
```javascript
const ws = new WebSocket('wss://api.bstonkex.xyz/ws');
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'market:bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' }));
};
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## Health Response Format

### `/health`
```json
{
  "status": "UP",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "dependencies": [
    { "name": "WebSocket", "status": "UP" },
    { "name": "RPC (BSC)", "status": "UP", "latencyMs": 45 },
    { "name": "RPC (Robinhood)", "status": "BLOCKED", "detail": "API key not configured" }
  ],
  "metrics": {
    "activeConnections": 42,
    "totalConnections": 150,
    "totalMessages": 12345
  }
}
```

Status values: `UP`, `DEGRADED`, `DOWN`, `BLOCKED`

### `/ws/health`
```json
{
  "status": "UP",
  "connections": 42,
  "maxConnections": 1000,
  "utilization": 4,
  "metrics": {
    "activeSubscriptions": 126,
    "avgLatency": 23,
    "staleClients": 0
  }
}
```

## WebSocket Protocol

Matches frontend `src/lib/engine/realtime-ws.ts`:

### Client → Server
```json
{ "type": "ping", "timestamp": 1234567890 }
{ "type": "subscribe", "channel": "market:bsc:0x..." }
{ "type": "unsubscribe", "channel": "market:bsc:0x..." }
```

### Server → Client
```json
{ "type": "pong", "timestamp": 1234567890, "serverTimestamp": 1234567891 }
{ "type": "subscribed", "channel": "market:bsc:0x...", "timestamp": 1234567890 }
{ "type": "event", "channel": "market:bsc:0x...", "sequence": 1, "timestamp": 1234567890, "data": {...} }
```

### Channels
- `market:{chainId}:{tokenAddress}` — Market events for specific token
- `trades:{chainId}` — All trades on chain
- `*` — Wildcard (all events)

## Backpressure

- Clients with >1MB buffered messages are skipped during broadcast
- Stale clients (no pong for 3x heartbeat) are disconnected
- Subscription limit per client: 50 (configurable)

## Graceful Shutdown

Server handles SIGTERM and SIGINT:
1. Stops market pipeline
2. Closes all WebSocket connections with code 1001
3. Closes HTTP server
4. Exits cleanly

## Production Checklist

- [ ] Robinhood RPC API key configured (`ROBINHOOD_RPC_API_KEY`)
- [ ] Backend deployed and running
- [ ] WebSocket server accessible at `wss://api.bstonkex.xyz/ws`
- [ ] DNS configured for `api.bstonkex.xyz`
- [ ] TLS/WSS working (certificate valid)
- [ ] Health endpoints responding
- [ ] Market events flowing to frontend
- [ ] Connection limits configured
- [ ] Logging configured
- [ ] Monitoring/alerting configured