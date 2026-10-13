# Cupcak8 Trenches Terminal — Build Plan

## Architecture Overview
Transform into a real-time launchpad tracking terminal (Ave.ai / GMGN parity).
Browser-first architecture: PumpPortal WS is the primary event source; backend provides
server-side PumpPortal relay + security audits + BSC listeners. No Socket.io or Redis
needed — native WebSocket + in-memory sorted sets deliver the same latency profile.

## Build Order

### Batch 1 — Data Layer
1. **`backend/src/trenches-store.ts`** — Redis-like in-memory store (hashes, sorted sets, TTL cache). API: `hset`, `zadd`, `zrange`, `zrevrange`, `hgetall`, `getCached`, `setCached`.
2. **`src/lib/engine/trenches-types.ts`** — Shared TypeScript types: `TrenchesToken`, `SecurityFlags`, `MarketPhase` ('inner'|'migrating'|'graduated'), `TrenchesTab`, `SwapRoute`.

### Batch 2 — Security & BSC
3. **`backend/src/security-worker.ts`** — Background RugCheck (Solana) + GoPlus (EVM) audit worker. Debounced, cached 5min, attaches `SecurityFlags` to token records.
4. **`src/lib/engine/bsc-listener.ts`** — Four.meme (`0x5c952063...`) + GraFun factory `TokenCreated` event poller. Fetches via public BSC RPC `eth_getLogs`, normalizes to `TrenchesToken`.

### Batch 3 — Swap Routing
5. **`src/lib/engine/dual-router.ts`** — Routes swaps: `progress < 100%` → direct bonding curve `buy()`/`sell()` instruction (Pump.fun program); `progress === 100%` → AMM router (Raydium/PancakeSwap). Returns `SwapRoute` with priority fee + anti-MEV slippage config.

### Batch 4 — Frontend Terminal
6. **`src/components/markets/TrenchesTerminal.tsx`** — 3-tab terminal: [🟢 Launchpads] [🟡 Migrating 80%+] [🔵 Graduated DEX]. Real-time token rows with bonding curve bars, security badges, Quick Buy.
7. **`src/components/markets/TrenchesTokenRow.tsx`** — Individual token row: symbol, address, age, virtual mcap, curve progress bar, security badges, Quick Buy button.
8. **`src/components/markets/TrenchesQuickBuy.tsx`** — 1-click buy modal with dual-router display, priority fee toggle, slippage control.

### Batch 5 — Integration
9. **`src/lib/useTrenches.ts`** — React hook: subscribes to `live-tokens` broadcast + PumpPortal stream, exposes tab-filtered token lists, stats.
10. **`backend/src/server.ts`** — Wire security-worker + trenches-store + BSC listener into the WS broadcast loop.
11. **`src/components/markets/LaunchpadTrenchesFeed.tsx`** — Update to render `TrenchesTerminal` instead of flat list.
12. **`RAILWAY-AUDIT.md`** — Update with new architecture notes.

## Key Design Decisions
- **No Redis** — `backend/src/trenches-store.ts` provides the same sorted-set + hash + TTL API in-memory. Survives within a single server process. For multi-instance, swap to Redis later (API-compatible).
- **No Socket.io** — Native `ws` WebSocket on the same HTTP server at `/ws`. Broadcasts `NEW_LAUNCHPAD_TOKEN` + `PRICE_UPDATE` + `SECURITY_UPDATE` event types.
- **PumpPortal is the Solana listener** — It already subscribes to Program ID `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` via `subscribeNewToken`. No raw gRPC needed.
- **Bonding curve math** — `progress = (virtualSol / graduationSol) * 100`. Pump.fun graduates at ~85 SOL virtual reserves. Spot price = `virtualSol / virtualTokens`.
- **Market phase transitions** — `inner` (<80%), `migrating` (80-99%), `graduated` (≥100%).
