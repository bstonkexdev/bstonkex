# BSTONKEX — COMPLETE INFRASTRUCTURE & MECHANISM AUDIT

## Executive Summary

BSTONKEX has a **well-architected frontend** with 40+ engine modules, but its production infrastructure has critical gaps. The system currently operates primarily via **DexScreener API polling** for market data and **public RPC nodes** for chain interaction. There is **no production indexer, no persistent database, no deployed WebSocket server, and no independent trade detection**. The UI is comprehensive and the execution pipeline is functional, but the data backbone relies entirely on third-party services.

---

## 1. ARCHITECTURE MAP

### Market Data Path (Current Reality)
```
DexScreener API (third-party)  ──→  Frontend Polling (15s)  ──→  In-Memory Cache  ──→  UI Components
         ↓
   [NOTHING ELSE]  ← No indexer, no database, no blockchain event stream
```

### Market Data Path (Intended Architecture)
```
BLOCKCHAIN → RPC/WS → CHAIN ADAPTER → INDEXER → NORMALIZER → MARKET ENGINE → DATABASE → CACHE → API → WS GATEWAY → FRONTEND
    ✅           ✅         ✅            ❌         ❌           ⚠️           ❌       ✅     ❌       ❌          ✅
```

### Execution Path (Current Reality)
```
USER → WALLET → QUOTE → ROUTE → TX BUILD → WALLET SIGN → BROADCAST → POLL CONFIRMATION → TRADE RECORD
 ✅      ✅      ✅      ⚠️       ✅          ✅            ✅              ✅                 ✅ (Gitlawb)
```

### Component Status Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | EXISTS and functional |
| ⚠️ | PARTIAL — exists but incomplete or limited |
| ❌ | MISSING — does not exist |
| 🔒 | NOT DEPLOYED — code exists but not running |
| ❓ | NOT VERIFIED — cannot confirm without external testing |

---

## 2. MARKET DATA MECHANISM

### How BSTONKEX obtains data today:

| Data Type | Source | Method | Frequency | Auth | Cache TTL |
|-----------|--------|--------|-----------|------|-----------|
| Token discovery | DexScreener `/token-boosts/latest/v1` | HTTP poll | 15s | None | None |
| Pair discovery | DexScreener `/token-profiles/latest/v1` | HTTP poll | 30s | None | 15s |
| Prices | DexScreener `/latest/dex/tokens/{addr}` | HTTP poll | 15s | None | 15s |
| Trades | DexScreener `/trades/v1/{chain}/{pair}` | HTTP poll | 15s | None | None |
| Liquidity | DexScreener pair data | HTTP poll | 15s | None | 15s |
| Volume | DexScreener pair data | HTTP poll | 15s | None | 15s |
| Market cap | DexScreener pair data | HTTP poll | 15s | None | 15s |
| Holders | **NOT AVAILABLE** | — | — | — | — |
| Transactions | DexScreener `txns.h24` (aggregate only) | HTTP poll | 15s | None | None |
| Candles | **NOT AVAILABLE** — engine exists but no data source | — | — | — | — |
| Token metadata | Chain RPC (symbol/name/decimals) + Jupiter (Solana) | HTTP/RPC | On-demand | None | 5min |
| DEX information | DexScreener pair data | HTTP poll | 15s | None | None |
| Native prices | DexScreener wrapped-native pairs | HTTP poll | 30s | None | 15s |

### Critical Finding
**ALL market data comes from DexScreener API.** BSTONKEX has ZERO independent data sources for prices, trades, liquidity, volume, or market cap. If DexScreener goes down or rate-limits the terminal, ALL market data stops.

### Third-Party Dependency Summary

| Service | Purpose | Auth Required | Rate Limit | Failure Behavior | Critical? |
|---------|---------|---------------|------------|-----------------|-----------|
| DexScreener API | ALL market data | No | Yes (unofficial) | Complete market data loss | **YES** |
| 1inch API | EVM swap quotes | API key (currently empty!) | Yes | Falls back to price estimation | **YES** |
| Jupiter API | Solana swap quotes | No | Generous | Solana trading stops | **YES** |
| BNB RPC (Binance) | BSC chain data | No | Yes | BSC operations fail | **YES** |
| Base RPC (public) | Base chain data | No | Yes | Base operations fail | **YES** |
| Solana RPC (public) | Solana chain data | No | Yes | Solana operations fail | **YES** |
| Robinhood RPC (Ankr) | Robinhood chain data | API key (not set) | Yes | Robinhood operations fail | **YES** |
| GeckoTerminal API | Referenced but barely used | No | Yes | Minimal impact | No |

### ⚠️ DANGEROUS SINGLE POINTS OF FAILURE
1. **DexScreener API** — All market data, all prices, all discovery, all activity
2. **Public RPC nodes** — All chain interaction (balances, quotes, tx status)
3. **1inch API** — EVM swap routing (API key is empty — will fail in production)
4. **Jupiter API** — Solana swap routing (public endpoint, no guarantees)

---

## 3. INDEXER AUDIT

### **INDEXER: COMPLETELY MISSING**

BSTONKEX does NOT have a production indexer. There is no component that:
- Subscribes to blockchain blocks/logs
- Decodes swap events (Uniswap V2/V3, PancakeSwap, Raydium)
- Detects new tokens or pairs from on-chain events
- Monitors liquidity additions/removals
- Tracks individual trades
- Monitors holder changes
- Detects large trades or whale activity from blockchain data

### What exists instead:
- `activity-engine.ts` polls DexScreener boosted tokens and **fabricates synthetic trade events** from 24h volume averages
- Wallet field is always `"NOT INDEXED"` for activity events
- Whale activity is classified by trade size, not by actual wallet tracking

### What a real indexer would need:
| Capability | BSTONKEX Status |
|-----------|----------------|
| Block subscription (EVM `eth_subscribe` / `newHeads`) | ❌ MISSING |
| Log decoding (Swap events) | ❌ MISSING |
| New pair detection (Factory events) | ❌ MISSING |
| Liquidity event monitoring | ❌ MISSING |
| Transfer tracking | ❌ MISSING |
| Holder snapshot | ❌ MISSING |
| Event deduplication | ⚠️ Exists in activity engine (DexScreener only) |
| Reorg handling | ❌ MISSING |
| Missed block recovery | ❌ MISSING |
| Historical backfill | ❌ MISSING |
| Persistent event storage | ❌ MISSING (in-memory only) |

---

## 4. REAL-TIME SYSTEM AUDIT

### WebSocket Client (realtime-ws.ts) — ✅ EXISTS
- Auto-reconnect with exponential backoff (1s → 30s max, 10 attempts)
- Heartbeat ping/pong (15s interval)
- Stale pong detection (3x heartbeat = force reconnect)
- Sequence gap detection per channel
- Subscription management with per-channel unsubscribe
- State machine: connecting → connected → reconnecting → degraded → disconnected
- **BUT:** Tries to connect to `wss://api.bstonkex.xyz/ws` which DOES NOT EXIST

### WebSocket Server (backend/src/server.ts) — 🔒 NOT DEPLOYED
- Node.js + `ws` library
- Connection limit (1000 default)
- Origin checking
- Heartbeat with stale client cleanup
- Sequence tracking per channel per client
- Backpressure (skip if client bufferedAmount > 1MB)
- Subscription management (subscribe/unsubscribe/error)
- Graceful shutdown (SIGTERM/SIGINT)
- Health/ready endpoints
- **BUT: NEVER DEPLOYED — code exists in backend/ but no running server**

### Market Pipeline Backend (backend/src/market-pipeline.ts) — 🔒 NOT DEPLOYED
- Polls DexScreener on configurable interval
- Emits MarketStreamEvent format matching frontend
- Event deduplication by ID
- RPC health check for all chains
- **BUT: NEVER DEPLOYED**

### Current Real-Time Behavior
The frontend WebSocket client tries to connect to `wss://api.bstonkex.xyz/ws`, fails silently, and the system **falls back to polling DexScreener every 15 seconds**. This is NOT a real-time system — it is a polling system with a WebSocket client that never connects.

### What is genuinely real-time:
- Wallet event listeners (account change, chain change) — ✅ real browser events
- Trade status polling (every 2s until confirmed) — ✅ real RPC polling

---

## 5. CHART MECHANISM

### How charts currently work:

```
[DexScreener price data] → [market-stream.ts poll] → [PriceChart receives price updates]
                                                    → [candle-engine.ts receives NO trade events]
                                                    → [generatePlaceholderCandles() creates FLAT LINES]
```

### The candle engine (candle-engine.ts) is well-built:
- Supports 8 intervals: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
- `processTrade()` correctly builds OHLCV candles from trade events
- `seedCandles()` can load historical data
- Live/final candle status tracking
- Max 500 candles per key

### The problem:
**The candle engine receives ZERO trade events.** There is no component that feeds it real blockchain trades. The chart component calls `generatePlaceholderCandles()` which creates flat-line candles at the current price. This is explicitly labeled "SYNTHETIC — not real blockchain data" in the code.

### Missing:
- Historical candle data from any source
- Trade event → candle engine pipeline
- Candle persistence (all in-memory, lost on refresh)
- Real OHLCV data for any timeframe

---

## 6. TOKEN DISCOVERY MECHANISM

### Current flow:
```
DexScreener /token-boosts/latest/v1 → activity-engine.ts → filter by chain → emit as MarketEvent
DexScreener /token-profiles/latest/v1 → market-stream.ts → filter by chain → emit as price event
DexScreener /latest/dex/search → market-discovery.ts → sort/filter → MarketTable
```

### What happens for a brand-new token:
1. Token must first appear on DexScreener (requires DEX listing + liquidity)
2. BSTONKEX polls DexScreener every 15-30 seconds
3. New tokens appear when DexScreener indexes them (delay: minutes to hours)
4. No direct blockchain detection

### Missing:
- Direct blockchain monitoring for new pair creation events
- Factory contract event subscription
- Mempool monitoring for new token deploys
- Independent token metadata resolution
- Real-time liquidity detection

---

## 7. SEARCH MECHANISM

### How search works:
```
User input → detectInputType() → classify as token/contract/wallet/tx/pair/command
    → Token/Pair: DexScreener /latest/dex/search?q={query}
    → Contract: DexScreener /latest/dex/tokens/{address}
    → Command: local command registry
    → Wallet: NOT SUPPORTED (address detection only, no lookup)
    → Transaction: NOT SUPPORTED (detection only, no lookup)
```

### Capabilities:
| Search Type | Works? | Backend |
|-------------|--------|---------|
| Token name | ✅ | DexScreener API |
| Symbol | ✅ | DexScreener API |
| Contract address | ✅ | DexScreener API |
| Wallet | ❌ Detection only, no data |
| Transaction | ❌ Detection only, no lookup |
| Pair | ✅ | DexScreener API |
| Chain filter | ✅ | Frontend filtering |
| Commands | ✅ | Local registry |

### Search is NOT database-backed. It is entirely API-backed (DexScreener).

---

## 8. WALLET MECHANISM

### What works:
| Feature | Status | Notes |
|---------|--------|-------|
| EVM connection (MetaMask/OKX) | ✅ | Real wallet connection |
| Solana connection (Phantom/OKX) | ✅ | Real wallet connection |
| Network switching | ✅ | `wallet_switchEthereumChain` |
| Native balance | ✅ | Real RPC call via chain adapter |
| Token balances | ⚠️ | Only hardcoded common tokens (USDT, USDC, BUSD, DAI) |
| All token balances | ❌ | No token transfer log scanning |
| Transaction history | ❌ | Only BSTONKEX-executed trades |
| Approvals | ✅ | Real ERC-20 allowance check + approval tx |
| Signing | ✅ | Via browser wallet |
| Confirmation | ✅ | Real RPC polling (getTransactionReceipt / getSignatureStatuses) |
| Account change listener | ✅ | `accountsChanged` / `chainChanged` events |

### Token balances are limited to hardcoded lists:
- BSC: USDT, BUSD, USDC (3 tokens)
- Base: USDC, DAI (2 tokens)
- Solana: USDC, USDT (2 tokens)
- Robinhood: **empty** (no tokens configured)

---

## 9. TRADE EXECUTION MECHANISM

### Full execution trace:

```
TOKEN SELECTED
    ↓
QUOTE REQUEST → quote-engine.ts → adapter.getSwapQuote()
    EVM: 1inch API (API KEY IS EMPTY — will fail in production)
    Solana: Jupiter API (public, working)
    ↓
QUOTE RETURNED (amountOut, priceImpact, route, gas, fees)
    ↓
PLATFORM FEE CALCULATED (0.40% = 40bps)
    ↓
USER CONFIRMS IN TradeConfirmModal
    ↓
TX BUILT → adapter.buildSwapTransaction()
    EVM: 1inch swap API (API KEY IS EMPTY)
    Solana: Jupiter swap API
    ↓
APPROVAL CHECK (EVM only)
    If needed: approval tx → wallet sign → broadcast → wait confirm
    ↓
SWAP TX → wallet.signAndSendTransaction()
    ↓
BROADCAST → adapter.sendTransaction() → RPC eth_sendRawTransaction
    ↓
PENDING → trade-engine.ts polls adapter.getTransactionStatus() every 2s, 60 attempts
    ↓
CONFIRMED/FAILED
    ↓
TRADE RECORDED → tx-tracker.ts → Gitlawb (idempotent by txHash)
    ↓
FEE ALLOCATED → fee-engine.ts → referral rewards (idempotent by tradeId)
    ↓
ACTIVITY EMITTED → activity-engine.ts trackBstonkexTrade()
```

### What genuinely works:
- ✅ Quote fetching (when APIs available)
- ✅ Transaction building (when APIs available)
- ✅ Wallet signing (real browser wallet)
- ✅ Broadcasting (real RPC)
- ✅ Confirmation polling (real RPC)
- ✅ Trade recording (Gitlawb persistence)
- ✅ Fee calculation and referral attribution

### Critical issues:
- ❌ **1inch API key is EMPTY** (`Authorization: 'Bearer '` with no key) — EVM quotes will fail
- ❌ **No slippage protection** beyond what 1inch/Jupiter provide
- ❌ **No MEV protection**
- ❌ **Fallback quote** is estimated from price data, not real DEX routing
- ❓ **Robinhood swaps** — 1inch may not support chain 4663; wrapped native address is placeholder

---

## 10. PORTFOLIO MECHANISM

### How portfolio data is obtained:

| Data | Source | Method |
|------|--------|--------|
| Native balance | Chain RPC | `eth_getBalance` / `getBalance` |
| Token balances | Chain RPC | Only hardcoded common tokens via `balanceOf` |
| Portfolio value | Frontend calculation | `Σ(balance × price)` |
| Cost basis | **NOT AVAILABLE** | — |
| Realized P&L | **NOT AVAILABLE** | — |
| Unrealized P&L | **NOT AVAILABLE** | — |
| Transaction history | Gitlawb `trade_log` | Only BSTONKEX-executed trades |
| All token balances | **NOT AVAILABLE** | Would need token transfer log scanning |

### Critical limitations:
- Only shows balances for 2-3 hardcoded stablecoins per chain
- No discovery of other ERC-20/SPL tokens the wallet holds
- No cost basis tracking
- No P&L calculation
- No on-chain transaction history
- Portfolio value is a **fraction** of actual holdings

---

## 11. MARKET RANKING MECHANISM

| Ranking | How It Works | Data Source |
|---------|-------------|-------------|
| Trending | DexScreener token-boosts API | Third-party |
| New | DexScreener `pairCreatedAt` field | Third-party |
| Gainers | Sort by `priceChange.h24` descending | DexScreener |
| Losers | Sort by `priceChange.h24` ascending | DexScreener |
| Volume | Sort by `volume.h24` descending | DexScreener |
| Liquidity | Sort by `liquidity.usd` descending | DexScreener |
| Smart Money | **NOT IMPLEMENTED** | — |
| Whale Activity | Classified by trade size, wallet = "NOT INDEXED" | DexScreener (fabricated) |

---

## 12. DATABASE AUDIT

### Current "database" — Gitlawb SDK (frontend-only):
| Collection | Purpose | Records |
|-----------|---------|---------|
| `trade_log` | BSTONKEX-executed trades | Per-user |
| `fee_ledger` | Platform fee records | Per-user |
| `ref_rewards` | Referral rewards | Per-user |
| `ref_volume` | Rolling 30-day referral volume | Per-user |

### What's missing:
- ❌ No token/pair/pool tables
- ❌ No trade history table (only BSTONKEX trades)
- ❌ No candle persistence
- ❌ No holder tracking
- ❌ No wallet activity indexing
- ❌ No liquidity event tracking
- ❌ No market snapshots
- ❌ No proper indexes
- ❌ No multi-user aggregate queries

---

## 13. CACHE AUDIT

### What's cached (in-memory Map with TTL):
| Key Pattern | TTL | Data |
|-------------|-----|------|
| `price:native:{chain}` | 15s | Native token price |
| `price:token:{chain}:{addr}` | 15s | Token price |
| `meta:{chain}:{addr}` | 5min | Token metadata |
| `market:trending` | 1min | Trending tokens |
| `search:{query}` | 30s | Search results |
| `candles:{chain}:{pool}:{tf}` | 1min | Candle data |
| `gas:{chain}` | 10s | Gas price |
| `balance:{chain}:{wallet}` | 20s | Wallet balance |
| `system:health` | 30s | Health status |
| `quote:{key}` | 8s | Swap quote |
| `discovery:{cat}` | 45s | Market discovery |
| `pairs:{chain}` | 30s | Pair data |

### Cache features:
- ✅ Stale-while-revalidate (returns stale data while refreshing in background)
- ✅ Cache stats (hits, misses, hit rate)
- ✅ Prefix invalidation
- ❌ No persistence (lost on refresh)
- ❌ No shared cache across tabs
- ❌ No cache warming on startup
- ❌ No cache size limits

---

## 14. MULTI-CHAIN AUDIT

### BNB Chain
| Component | Status |
|-----------|--------|
| RPC | ✅ Binance public nodes (4 URLs, rotating) |
| Chain adapter | ✅ Full EVM adapter |
| Price data | ✅ DexScreener |
| Swap quotes | ⚠️ 1inch (API KEY EMPTY) |
| Token balances | ⚠️ 3 hardcoded tokens |
| Explorer | ✅ BscScan |

### Base
| Component | Status |
|-----------|--------|
| RPC | ✅ Public nodes (3 URLs) |
| Chain adapter | ✅ Full EVM adapter |
| Price data | ✅ DexScreener |
| Swap quotes | ⚠️ 1inch (API KEY EMPTY) |
| Token balances | ⚠️ 2 hardcoded tokens |
| Explorer | ✅ BaseScan |

### Solana
| Component | Status |
|-----------|--------|
| RPC | ✅ Public nodes (3 URLs) |
| Chain adapter | ✅ Native Solana adapter (not EVM) |
| Price data | ✅ DexScreener |
| Swap quotes | ✅ Jupiter (working) |
| Token balances | ⚠️ 2 hardcoded tokens |
| Explorer | ✅ Solscan |

### Robinhood Chain
| Component | Status |
|-----------|--------|
| RPC | ⚠️ Ankr free tier (rate-limited, API key not set) |
| Chain adapter | ✅ EVM adapter (same as BNB/Base) |
| Price data | ❓ DexScreener (may not have Robinhood data) |
| Swap quotes | ❌ 1inch likely doesn't support chain 4663 |
| Token balances | ❌ Empty (no tokens configured) |
| Wrapped native | ❌ **Placeholder address** (`0x2f2a...` — needs real address) |
| Explorer | ⚠️ explorer.robinhood.com (unverified) |
| DEX ecosystem | ❓ Unknown — no confirmed DEX on Robinhood |

---

## 15. COMPARISON MATRIX

| Capability | Professional Terminal (Ave.ai) | BSTONKEX | Gap |
|-----------|-------------------------------|----------|-----|
| Token discovery | Continuous on-chain indexing | DexScreener polling (15s) | **CRITICAL** |
| Market data | Indexed database + streaming | DexScreener API polling | **CRITICAL** |
| WebSocket | Dedicated backend gateway | Client only (server not deployed) | **CRITICAL** |
| Historical candles | Persistent database | Placeholder flat lines | **CRITICAL** |
| Live trades | Blockchain event stream | Fabricated from volume averages | **CRITICAL** |
| Holders | Indexed wallet state | Not available | **CRITICAL** |
| Search | Indexed search engine | DexScreener API | **MAJOR** |
| Wallet | Direct browser signing | Direct browser signing | ✅ Equal |
| Execution | Quote → route → sign → broadcast | Same (but 1inch key missing) | **MAJOR** |
| Portfolio | Indexed wallet transaction history | 2-3 hardcoded tokens per chain | **CRITICAL** |
| Alerts | Event-driven | Price polling (no events) | **MAJOR** |
| Multi-chain | Independent chain adapters | Same architecture, 4 chains | ⚠️ Robinhood partial |

---

## 16. FINAL REPORT

### A. WHAT BSTONKEX ALREADY HAS
1. **40+ engine modules** covering chain adapters, trading, fees, portfolio, search, security, alerts, caching
2. **Full EVM chain adapter** (BNB, Base, Robinhood) with real RPC calls, token metadata, balance fetching
3. **Full Solana adapter** with real RPC calls, SPL token support, Jupiter integration
4. **WebSocket client** with production-ready reconnect, heartbeat, sequence tracking
5. **WebSocket server code** (backend/) with all required features — **not deployed**
6. **Market pipeline backend** (backend/) — **not deployed**
7. **Complete trade execution pipeline** from quote to confirmation
8. **Fee engine** with 0.40% platform fee, 4-tier referral system, Gitlawb persistence
9. **Cache layer** with stale-while-revalidate, TTL management
10. **Comprehensive UI** — 80+ components, terminal-style interface
11. **Admin deployment center** with preflight checks, environment config, Robinhood panel
12. **Chain icon system** with real logos from TrustWallet CDN

### B. WHAT IS PARTIALLY IMPLEMENTED
1. **Market data** — Works via DexScreener but zero independent capability
2. **Charts** — Engine exists but no data feeds it (flat placeholder lines)
3. **Activity feed** — Events are fabricated from 24h volume averages, not real trades
4. **Portfolio** — Only shows 2-3 hardcoded stablecoin balances per chain
5. **Search** — Works for tokens/pairs via DexScreener, no wallet/tx lookup
6. **Trade quotes** — Works for Solana (Jupiter), broken for EVM (empty 1inch API key)
7. **Robinhood Chain** — Adapter exists but wrapped native is placeholder, DEX unknown

### C. WHAT IS COMPLETELY MISSING
1. **Production indexer** — No on-chain event indexing whatsoever
2. **Historical candles** — No OHLCV data from any source
3. **Real trade events** — No individual trade detection
4. **Holder tracking** — No holder count, top holders, concentration data
5. **Database** — No persistent storage for market data
6. **Independent price feeds** — 100% dependent on DexScreener
7. **Smart money tracking** — No wallet activity analysis
8. **Token transfer log scanning** — Cannot discover all wallet holdings
9. **Market cap calculations** — Rely entirely on DexScreener
10. **New token/pair detection** — Only via DexScreener (minutes to hours delay)
11. **Block subscription** — No newHeads/logs subscription on any chain
12. **Event decoding** — No Swap/Transfer event log parsing

### D. WHAT IS ONLY FRONTEND/UI
1. **Whale activity** — Wallet field is always "NOT INDEXED"
2. **Large trades** — Fabricated from average trade size, not real trades
3. **Activity events** — Derived from 24h aggregates, not individual trades
4. **Holder data** — Shows "NOT AVAILABLE" when accessed
5. **Smart money** — Not implemented at all
6. **Chart history** — Flat placeholder candles from `generatePlaceholderCandles()`

### E. WHAT IS NOT DEPLOYED
1. **WebSocket server** (backend/src/server.ts) — Complete code, never started
2. **Market pipeline backend** (backend/src/market-pipeline.ts) — Complete code, never started
3. **Health endpoints** (backend/src/health.ts) — Complete code, never started
4. **1inch API key** — Empty bearer token will cause all EVM quotes to fail
5. **Robinhood RPC API key** — Ankr key not set, rate-limited

### F. WHAT IS NOT VERIFIED
1. **Robinhood Chain DEX availability** — No confirmed DEX exists
2. **Robinhood wrapped native address** — Placeholder address in code
3. **1inch support for Robinhood (chain 4663)** — Likely unsupported
4. **DexScreener coverage for Robinhood** — May have no data
5. **Public RPC reliability** — All chains use free public endpoints
6. **Jupiter API stability** — Public endpoint, no SLA

### G. CRITICAL PRODUCTION GAPS (Ranked)

**P0 — Critical (blocks production use)**
1. No indexer — cannot detect any on-chain events independently
2. No historical candles — charts show flat lines
3. All market data from single third-party API (DexScreener)
4. 1inch API key is empty — EVM trading broken in production
5. WebSocket server not deployed — no real-time updates

**P1 — Required (major functionality missing)**
6. No holder tracking
7. No database for market data persistence
8. Portfolio only shows 2-3 hardcoded tokens per chain
9. No real trade event detection
10. Robinhood Chain infrastructure incomplete

**P2 — Important (degraded experience)**
11. No wallet/transaction search
12. No cost basis or P&L calculation
13. No smart money / whale tracking
14. Cache lost on page refresh
15. No MEV protection

**P3 — Optimization**
16. No code splitting / lazy loading
17. No request cancellation
18. Rate limit coordination needed across engines

### H. REQUIRED INFRASTRUCTURE
1. **Blockchain Node Access** — Alchemy/QuickNode/Infura for all 4 chains (authenticated, reliable)
2. **DEX Event Indexer** — Custom indexer or service (Moralis, Alchemy Webhooks, custom subgraphs)
3. **Database** — PostgreSQL/Redis for market data, candles, holders, trades
4. **Candle Service** — Historical OHLCV data provider (CoinGecko, CryptoCompare, or self-built)
5. **Backend Deployment** — Deploy existing server.ts to Railway/Fly.io/Render
6. **1inch API Key** — Required for EVM swap quotes
7. **Robinhood RPC** — Authenticated endpoint (Ankr/Alchemy)
8. **Rate Limiter** — Centralized rate limit management for all API calls

### I. RECOMMENDED BUILD ORDER

| Phase | Priority | What to Build |
|-------|----------|---------------|
| 1 | P0 | Deploy WebSocket server (code exists) |
| 2 | P0 | Get 1inch API key + authenticated RPCs |
| 3 | P0 | Build EVM Swap/Transfer event indexer |
| 4 | P0 | Add historical candle data provider |
| 5 | P1 | Build database schema for market data |
| 6 | P1 | Build holder tracking from on-chain data |
| 7 | P1 | Build complete wallet balance scanner |
| 8 | P2 | Add cost basis / P&L engine |
| 9 | P2 | Build smart money detection |
| 10 | P2 | Add cache persistence + warming |
| 11 | P3 | Code splitting, request cancellation, rate limiting |

---

*Audit completed without modifying any code. All findings based on direct source code inspection.*