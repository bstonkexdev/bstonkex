# Ave.ai Real-Time Trade & Wallet Tracking — Build Plan

## Already Built (backend)
- ✅ Solana Geyser gRPC Stream (solana-trade-stream.ts)
- ✅ PumpPortal WebSocket (pumpportal-stream.ts)
- ✅ Trade Normalizer (chart-engine.ts — ingestTrade)
- ✅ Redis Hot Trades (trenches-store.ts — HSET/ZADD)
- ✅ OHLCV Materialized Views (chart-engine.ts — 1s/1m/5m/15m/1h/4h/1d)
- ✅ WebSocket Gateway (server.ts — WS subscriptions)
- ✅ Security Auditor (security-auditor.ts — RugCheck)
- ✅ Limit Order Engine (limit-order-engine.ts)
- ✅ Metadata Worker (server.ts — async queue)
- ✅ ClickHouse Schema (004_clickhouse_ohlcv.sql)

## New Files To Build (frontend — real-time trade terminal)

### Batch 1: Trade Stream & Wallet Tags
1. `src/lib/engine/trade-stream.ts` — Unified trade stream (WS + PumpPortal → normalized UTP)
2. `src/lib/engine/wallet-profiler.ts` — Wallet tag engine (SmartMoney, KOL, Sniper, Cabal)
3. `src/lib/engine/wallet-tags-store.ts` — Wallet tags cache (localStorage + gitlawb persistence)

### Batch 2: Real-Time Trade Terminal Components
4. `src/components/activity/RealTimeTradeFeed.tsx` — Live trade feed with wallet tags
5. `src/components/activity/WalletTagBadge.tsx` — Tag badge component (🍃 SmartMoney, ⚡ Sniper, etc.)
6. `src/components/activity/TradeFilters.tsx` — Tab filters (All | KOL | SmartMoney | Sniper | Cabal)

### Batch 3: Token Page Integration
7. Update `src/components/TokenPage.tsx` — Wire trade feed + wallet tags
8. Update `src/components/token/TradeList.tsx` — Show wallet tags on trades

### Batch 4: Activity Page
9. Update `src/components/ActivityPage.tsx` — Real-time activity with wallet tags

## Architecture
```
[PumpPortal WS] → trade-stream.ts (normalize) → wallet-profiler.ts (tag)
  → RealTimeTradeFeed.tsx (render with tags)
  → TokenPage.tsx (wire into trade list)
```