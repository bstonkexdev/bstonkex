# BSTONKEX Backend — Railway Deployment

## Quick Deploy

1. **GitHub repo**: Push the repository to GitHub
2. **Railway**: Create new project → Deploy from GitHub repo
3. **Root Directory**: Set to `/backend` in Railway service settings
4. **Environment Variables**: Set in Railway dashboard (see below)
5. **Deploy**: Railway auto-detects Node.js and runs build/start

## Build & Start Commands

Railway auto-detects these from `backend/package.json` and `backend/railway.json`:

| Step | Command |
|------|---------|
| Install | `npm install` |
| Build | `npm run build` (runs `tsc`) |
| Start | `npm run start` (runs `node dist/server.js`) |

No Dockerfile needed — Nixpacks handles everything.

## Environment Variables

Set in Railway dashboard → Variables tab:

### Required
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` (Railway sets this automatically) |
| `NODE_ENV` | Environment | `production` |

### Optional (RPC Endpoints)
| Variable | Description | Default |
|----------|-------------|---------|
| `BSC_RPC_URL` | BNB Chain RPC | Public Binance endpoint |
| `BASE_RPC_URL` | Base L2 RPC | Public Base endpoint |
| `SOLANA_RPC_URL` | Solana RPC | Public mainnet endpoint |
| `ROBINHOOD_RPC_URL` | Robinhood Chain RPC | Ankr public (rate-limited) |
| `ROBINHOOD_RPC_API_KEY` | Robinhood API key | Not set |

### Optional (WebSocket)
| Variable | Description | Default |
|----------|-------------|---------|
| `WS_PATH` | WebSocket path | `/ws` |
| `WS_MAX_CONNECTIONS` | Max clients | `1000` |
| `WS_HEARTBEAT_MS` | Ping interval | `15000` |

### Optional (CORS)
| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Comma-separated origins | `*` (all) |

### Optional (Market Data)
| Variable | Description | Default |
|----------|-------------|---------|
| `POLL_INTERVAL_MS` | DexScreener poll interval | `15000` |

## Health Endpoints

After deployment, verify:
```
GET https://your-service.railway.app/health
GET https://your-service.railway.app/ready
GET https://your-service.railway.app/ws/health
```

## WebSocket

Connect to:
```
wss://your-service.railway.app/ws
```

## Node.js Version

Pinned to Node.js 20.x via `engines` field in package.json.
Railway respects this automatically.

## Architecture

```
DexScreener API → Market Pipeline → WebSocket Gateway → BSTONKEX Frontend
                         ↓
              Health Endpoints (/health, /ready, /ws/health)
```

## Troubleshooting

### "ExperimentalWarning: --experimental-loader"
Fixed — backend now compiles TypeScript to JavaScript at build time.

### "failed to solve: secret backend not found"
This is a Railway/Nixpacks Docker layer caching issue. Redeploy or clear build cache.

### Port binding errors
Railway sets `PORT` automatically. Do not override it.