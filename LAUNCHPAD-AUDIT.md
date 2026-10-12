# Cupcak8 Swap — Launchpad Source Audit & Verification Report
## Step 1 + 1B + 2: Audit, Verify, Resolve, and Redirect Market Data Sources

**Last updated:** Step 2 — 2025-10-12
**Scope:** Source audit, registry, and architecture design. No full indexer implementation yet.

---

## Summary

| # | Launchpad | Chain | Status | Factory/Program | Key Evidence |
|---|-----------|-------|--------|----------------|--------------|
| 1 | OpenLaunch | Base (8453) | ✅ **VERIFIED** | `0x815542E8b392389A1389E22E588E4B62A67Ade72` | eth_getLogs: 2 real `Launched` events, blocks 52340723-52340886 |
| 2 | OpenLaunch | Robinhood (4663) | ✅ **VERIFIED** | Same address | eth_getLogs: 2 `Launched` events, blocks 83648412, 83650950 |
| 3 | Pump.fun | Solana | ✅ **VERIFIED** | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Real tx slot 454680764: mint + creator decoded |
| 4 | Flap | BSC (56) | ⚠️ **PARTIAL** | `0xe2cE6ab...` + `0x9049745...` | Contracts active. Event topic wrong. DexScreener `dexId=flapsh` works as API fallback. |
| 5 | 4meme V1 | BSC (56) | ⚠️ **PARTIAL** | Proxy `0xEC4549ca...` → impl `0x7fbc1ff9...` (23KB) | EIP-1967 resolved. Need ABI for event topic. |
| 6 | 4meme V2 | BSC (56) | ⚠️ **PARTIAL** | Proxy `0x5c952063...` → impl `0xf32ee25a...` (24KB) | EIP-1967 resolved. Need ABI for event topic. |
| 7 | Pons | Robinhood (4663) | ⚠️ **PARTIAL** | `0xA5aAb3F0...` (48KB) | Contract deployed. PONS token `0x39dBED3a...` confirmed from docs. Need ABI. |
| 8 | Stonkfun | Solana | ⚠️ **PARTIAL** | Raydium LaunchLab (program ID unknown) | Bags API confirms real launches. Example: slot 455928172, BONDING_CURVE pool. |
| 9 | Genius.fun | BSC (56) | ⚠️ **PARTIAL** | Unknown factory | ToS confirms BSC + bonding curve (6BNB reserve, 15BNB graduation). No factory address. |
| 10 | Bags | Solana | ⚠️ **PARTIAL** | API: `data-api.bags.fm` (aggregator) | v2 API working: `/v2/launches`, `/v2/tokens/:mint/creation`. Tracks Pumpfun+Stonkfun+Dbc+Moonshot. |
| 11 | O1 Launchpad | Base (8453) | ⚠️ **PARTIAL** | Unknown factory | Identity confirmed (o1launchpad.com, Base+RH). No factory address published. |
| 12 | Pons V2 | Robinhood (4663) | ❌ **UNVERIFIED** | Unknown | V2 factory address unknown. |
| 13 | Stonk (Solana) | Solana | ❌ **UNVERIFIED** | Unknown | Identity ambiguous — possibly same as "Stonkfun" tracked by Bags. stonk.fun DNS unreachable. |
| 14 | Stonk.fun | Base (8453) | ❌ **UNVERIFIED** | Unknown | basestonk.io exists but no mainnet factory identified. |

---

## Step 1B New Findings

### 4meme — Implementation Addresses Resolved
- **V1 proxy:** `0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC` (EIP-1167 minimal proxy)
- **V1 implementation:** `0x7fbc1ff9617d554d1902a3431a9c29dc2edaf1be` (23,019 bytes on-chain)
- **V2 proxy:** `0x5c952063c7fc8610FFDB798152D69F0B9550762b` (EIP-1167 minimal proxy)
- **V2 implementation:** `0xf32ee25a7a94f5858692b90815493bda9f992eee` (24,203 bytes on-chain)
- **Method:** EIP-1967 storage slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` read via `eth_getStorageAt` on BSC public RPC
- **Next:** Get verified ABI from BscScan for implementation contracts. Derive correct event topic. Note: delegatecall proxy means events are logged under the PROXY address.

### Bags — Working v2 API Discovered
- **Base URL:** `https://data-api.bags.fm`
- **Key endpoints:**
  - `GET /v2/launches` — recent launches with `mint`, `creator`, `signature`, `launchpad`, `ts`
  - `GET /v2/tokens/:mint/creation` — `signature`, `slot`, `createdAt`, `creator`, `launchWallet`, `initialPool` (poolType, protocol)
  - `GET /v2/tokens/:mint` — full token data with rolling stats (m1/m15/h6/h24)
  - `GET /v2/tokens/trending` — trending with price, volume, liquidity
  - `GET /v2/tokens/by-creator/:creator` — tokens by creator
  - `GET /v2/tokens/graduated` — graduated tokens
  - `GET /v2/search` — search tokens/pools
- **Tracked launchpads:** Pumpfun, Stonkfun, Dbc, Moonshot
- **Assessment:** Reliable API source for incremental discovery of new Solana tokens. Provides timestamps, creators, signatures, and pool info.

### Stonkfun — Confirmed via Bags API
- **Real launches tracked** with `launchpad: "Stonkfun"` label
- **Example launch:** Mint `63AvAp5PjZaLMuEgAacwYRsNVb7sKaGYdSZ8bsgPkmuu`
  - Slot: 455928172
  - Creator: `Ee5FqoaGsDJ4wKUcJMDhD7GX4NT5jwerHXyXmmkDq9pn`
  - Signature: `U4MFRyE5VXM8hrYng4aLEn3RvCG1hqJbm5VbTAjMt96D9Ru3aveCYb4VV2KDcXgPd1W8WzPzW1Q7DhYqHiddU8X`
  - Initial pool: `9L6adkCGZUAL96duq6NzNTrgsggQ6bdGKQocMULU5d2L` (BONDING_CURVE, `raydium_launchpad`)
- **Mechanism:** Raydium LaunchLab bonding curve
- **Still missing:** The actual Solana program ID for Stonkfun's launch instruction. But the Bags API provides a reliable alternative for discovery.

### Flap — DexScreener Integration Confirmed
- **DexScreener `dexId: "flapsh"`** on both BSC and Robinhood
- 30 pairs found across both chains
- **Interim discovery:** DexScreener `dexId=flapsh` can discover Flap-created tokens
- **Still missing:** Correct event ABI for on-chain indexing

### Pons — Documentation Findings
- **PONS token:** `0x39dBED3a2bd333467115dE45665cC57F813C4571` (confirmed from docs.ponsfamily.com)
- **Architecture:** "Launch deploys the token and its trading pool in a single transaction"
- **Mechanism:** Bonding curve, graduation, listing
- **Chain:** Arbitrum Orbit (Robinhood Chain)
- **Still missing:** Factory contract ABI and creation event topic

### Genius.fun — Terms of Service Confirms Platform Mechanics
- **Chain:** BNB Chain (only supported network)
- **Launch mechanism:** Bonding curve with 6 BNB phantom quote reserve
- **Graduation threshold:** 15 BNB raised
- **Fixed supply:** 1,000,000,000 tokens per launch
- **Functions referenced:** `setCreatorFeeRecipient`, `rescueCurveFees`, `rescuePoolFees`
- **Fee split:** 30% protocol / 70% creator
- **Still missing:** Factory contract address (not published in ToS or on-site)

### O1 Launchpad — Identity Confirmed
- **Website:** o1launchpad.com — "Official Token Launchpad on Base & Robinhood"
- **Mentions:** B20 tokens on Base
- **Still missing:** Factory contract address

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| ✅ **VERIFIED** | Factory/program address confirmed on-chain with at least one real creation event decoded. Ready for indexing. |
| ⚠️ **PARTIAL** | Contract/deployment confirmed but event ABI/topic unknown, OR API-based discovery confirmed but on-chain program unknown. May use API fallback. |
| ❌ **UNVERIFIED** | No factory address, no program ID, no API source. Cannot index. |

---

## Ready for Indexing (immediate)

| Source | Method | Coverage |
|--------|--------|----------|
| **OpenLaunch** (Base + RH) | eth_getLogs on `0x815542E8...` with topic `0xda18b133` | Full on-chain event indexing |
| **Pump.fun** (Solana) | Program `6EF8rrecthR...` instruction parsing | Full on-chain instruction indexing |
| **Bags API** (Solana aggregator) | `GET /v2/launches` polling | Pumpfun + Stonkfun + Dbc + Moonshot |
| **Flap** (BSC + RH) | DexScreener `dexId=flapsh` API polling | Retroactive pair discovery (not creation-time) |

## Ready with Caveats (needs ABI or program ID)

| Source | Blocker | API Fallback |
|--------|---------|-------------|
| **4meme V1+V2** (BSC) | Need verified ABI for impl contracts | None yet |
| **Pons** (RH) | Need factory ABI | None yet |
| **Stonkfun** (Solana) | Need program ID | Bags API works |
| **Genius.fun** (BSC) | Need factory address | None yet |

## Not Ready

| Source | Missing |
|--------|---------|
| **Pons V2** | Everything |
| **Stonk (Solana)** | Identity resolution (may be same as Stonkfun) |
| **Stonk.fun** (Base) | Factory address |

---

## Existing Infrastructure

### Chain RPC Services
- **BSC:** `https://bsc-dataseed1.binance.org` (public), Ankr fallbacks
- **Base:** `https://mainnet.base.org` / `https://rpc.ankr.com/base`
- **Robinhood:** `https://rpc.mainnet.chain.robinhood.com` (public)
- **Solana:** `https://api.mainnet-beta.solana.com`
- **Note:** Free RPCs currently limit `eth_getLogs` silently (return empty results). For production indexing, use authenticated RPC providers.

### Market Data
- **DexScreener API:** `https://api.dexscreener.com` — pair data, token profiles
- **Bags API:** `https://data-api.bags.fm` — Solana token launches and stats

### Persistence
- **Gitlawb Data SDK:** `launchpad_events` collection (owner visibility)

---

## Registry Format

Canonical factory registry: `src/lib/engine/launchpad-registry.ts`
Display registry: `src/lib/launchpads.ts`
Logo config: `src/lib/launchpad-logos.ts`

---

# Step 2 — Market Data Source Matrix & Architecture Redesign

## Existing DexScreener Dependency Map

DexScreener is currently used in **~30 files** across 6 categories:

| Category | Files | Functions |
|----------|-------|-----------|
| **Token Discovery** | `market-discovery.ts`, `market.ts` | `getDiscovery()`, `searchTokens()`, `getTokenData()`, `fetchDexScreenerTokens()` |
| **Market Pipeline** | `market-pipeline.ts` | `fetchDexScreenerTokens()`, `fetchDexScreenerPairs()`, `fetchDexScreenerTrades()` |
| **Price Feeds** | `evm-adapter.ts`, `solana-adapter.ts`, `market-stream.ts` | Native price + token price lookups |
| **Activity/Trades** | `activity-engine.ts` | Polling for trade feeds |
| **Search** | `search-engine.ts` | Token/pair search |
| **Health/Validation** | `system-health.ts`, `chain-validation.ts`, `runtime-validation.ts`, `reconciliation.ts` | API health checks, data reconciliation |

**Existing adapter status:** Only `openlaunch-adapter.ts` is registered in `launchpad-adapters/index.ts` — and it itself uses DexScreener as its data source.

---

## Source Matrix — Verified Per-Launchpad Discovery & Market Data

| Launchpad | Chain | Discovery Source | Market/Price Source | Credentials | Data Provided | Verification Evidence | Blocker |
|-----------|-------|-----------------|---------------------|-------------|---------------|----------------------|---------|
| **OpenLaunch** | Base | On-chain `eth_getLogs` on `0x815542E8...` topic `0xda18b133` | DexScreener `dexId=openlaunch` + GeckoTerminal | Public RPC (no key) | Token address, creator, block, tx | 2 real events decoded (Step 1) | None — ready |
| **OpenLaunch** | Robinhood | Same factory `0x815542E8...` same topic | DexScreener `dexId=flapsh` + GeckoTerminal | Public RPC | Same | 2 real events decoded (Step 1) | None — ready |
| **Pump.fun** | Solana | Program `6EF8rrecthR...` instruction parsing | Jupiter API + DexScreener | Public Solana RPC | Mint, creator, slot, signature | Real tx at slot 454680764 | None — ready |
| **Flap** | BSC | ❌ Event topic unknown | ✅ DexScreener `dexId=flapsh` (30 pairs) | None | Pair data (retroactive only) | DexScreener confirmed | Need BscScan ABI for creation event |
| **Flap** | Robinhood | ❌ Event topic unknown | ✅ DexScreener `dexId=flapsh` | None | Same | Same | Same |
| **4meme V1** | BSC | ❌ Event topic unknown (impl `0x7fbc1ff9...` resolved) | DexScreener (no dedicated dexId) | Public RPC | None currently | EIP-1967 impl resolved (Step 1B) | Need ABI from BscScan |
| **4meme V2** | BSC | ❌ Event topic unknown (impl `0xf32ee25a...` resolved) | DexScreener (no dedicated dexId) | Public RPC | None currently | Same | Same |
| **Genius.fun** | BSC | ❌ Factory address unknown | ❌ No API | — | None | ToS confirms BSC + bonding curve | Need factory address |
| **O1 Launchpad** | Base | ❌ Factory address unknown | ❌ No API | — | None | Identity confirmed | Need factory address |
| **Stonk.fun** | Base | ❌ Factory address unknown | ❌ No API | — | None | basestonk.io exists | Need factory address |
| **Pons** | Robinhood | ❌ Event topic unknown | ❌ No API | — | None | Contract deployed, PONS token known | Need factory ABI |
| **Stonkfun** | Solana | ✅ Bags API `/v2/launches` (filter `launchpad=Stonkfun`) | DexScreener + Jupiter | None (public API) | Mint, creator, signature, slot, pool | Real launches confirmed (Step 1B) | Program ID unknown (API works) |
| **Bags** | Solana | ✅ Bags API `/v2/launches` (aggregator) | DexScreener + Jupiter | None (public API) | Mint, creator, signature, launchpad label | API returns real data (Step 1B) | None — API-based |
| **Stonk (Solana)** | Solana | ❌ Identity ambiguous | ❌ No API | — | None | Possibly same as Stonkfun | Needs identity resolution |

---

## Architecture: Discovery vs. Market Tracking Separation

### Current Problem
DexScreener is the **sole entry point** for tokens. No token can appear in the market list without first being indexed by DexScreener. This means:
- New tokens are invisible until DexScreener indexes them (minutes to hours delay)
- Launchpad attribution is inferred from DEX IDs (inaccurate)
- No independent discovery of tokens at creation time

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  TOKEN DISCOVERY LAYER                   │
│         (identifies new tokens at creation time)          │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ OpenLaunch│ │ Pump.fun │ │ Bags API │ │  Flap    │   │
│  │ eth_getLogs│ │ Program  │ │ /v2/     │ │ DexScre. │   │
│  │ + topic  │ │ parsing  │ │ launches │ │ dexId=   │   │
│  │ 0xda18b13│ │ 6EF8r... │ │ (Solana) │ │ flapsh   │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │             │            │             │         │
│       └─────────────┴────────────┴─────────────┘         │
│                         │                                │
│                    ┌────▼─────┐                          │
│                    │ INTERNAL │                          │
│                    │  TOKEN   │                          │
│                    │  INDEX   │ ← Gitlawb `token_index`  │
│                    │          │   (address, chain,       │
│                    │          │    launchpad, creator,    │
│                    │          │    launch_time, tx/sig,   │
│                    │          │    discovery_status)      │
│                    └────┬─────┘                          │
├─────────────────────────┼───────────────────────────────┤
│                  MARKET TRACKING LAYER                   │
│          (price, volume, liquidity, swaps)               │
│                         │                                │
│  ┌──────────────────────┼──────────────────────────┐    │
│  │         ┌────────────┼────────────┐             │    │
│  │    ┌────▼────┐  ┌────▼────┐  ┌────▼────┐       │    │
│  │    │  DexScreener │  │GeckoTerminal│  │  Jupiter  │       │    │
│  │    │ (enrichment) │  │ (pools/     │  │ (Solana   │       │    │
│  │    │ (fallback)   │  │  OHLCV)     │  │  quotes)  │       │    │
│  │    └───────────┘  └───────────┘  └───────────┘       │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                │
│                    ┌────▼─────┐                          │
│                    │ MARKET   │                          │
│                    │ TOKENS   │ → UI (MarketTable, etc.) │
│                    │ (merged) │                          │
│                    └──────────┘                          │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Internal Token Index** (new `token_index` collection):
   - Records: `address`, `chainId`, `launchpadId`, `creator`, `launchTime`, `sourceTx`/`sourceSig`, `discoverySource`, `discoveryStatus`
   - Written by discovery layer (on-chain events + API polling)
   - Read by market tracking layer for enrichment
   - Deduplication by `(chainId, address)` — first discovery wins, subsequent updates merge

2. **DexScreener demoted to enrichment**:
   - Market tracking queries the internal index FIRST
   - DexScreener fills in price/volume/liquidity for tokens it knows
   - Tokens NOT on DexScreener show `null` price fields and `data_only` tradability (NOT fabricated values)

3. **Discovery sources by priority**:
   - **Tier 1 (on-chain events):** OpenLaunch (Base+RH), Pump.fun (Solana)
   - **Tier 2 (official APIs):** Bags API (Solana — covers Stonkfun + Pumpfun + Dbc + Moonshot)
   - **Tier 3 (aggregator fallback):** DexScreener `dexId` filters (Flap: `flapsh`)

4. **Market data sources by chain**:
   - **EVM chains:** DexScreener + GeckoTerminal (pools, OHLCV)
   - **Solana:** Jupiter API (quotes) + DexScreener + GeckoTerminal

---

## Files & Functions to Change in Next Implementation Step

### New Files
| File | Purpose |
|------|---------|
| `src/lib/engine/token-index.ts` | Internal token index (Gitlawb `token_index` collection). CRUD + dedup. |
| `src/lib/engine/discovery-service.ts` | Orchestrates discovery from all sources. Polling loop + event streaming. |
| `src/lib/engine/discovery/adapters/openlaunch-events.ts` | On-chain `eth_getLogs` discovery for OpenLaunch. |
| `src/lib/engine/discovery/adapters/pumpfun-program.ts` | Solana program instruction parsing for Pump.fun. |
| `src/lib/engine/discovery/adapters/bags-api.ts` | Bags API polling for Solana launches. |
| `src/lib/engine/discovery/adapters/flap-dexscreener.ts` | DexScreener `dexId=flapsh` fallback for Flap. |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/market-discovery.ts` | `getDiscovery()` reads internal index first, enriches with DexScreener. New tokens without market data get `null` price + `data_only`. |
| `src/lib/engine/launchpad-adapters/index.ts` | Register new discovery adapters. |
| `src/lib/engine/launchpad-indexer.ts` | Route through `token-index` instead of DexScreener-only fallback. |
| `src/lib/engine/market-pipeline.ts` | Merge internal index with DexScreener pairs for market listings. |
| `src/lib/engine/provider-config.ts` | Add Bags API as Solana provider. Document credentials. |
| `.env.example` | Document any new API keys (currently none needed — Bags is public). |

### Unchanged (Preserve)
- All UI components (MarketTable, MarketRow, TokenPage, etc.)
- Trading, wallet, referral, fee systems
- DexScreener integration (demoted to enrichment, not removed)
- Existing adapter registry interface
- Gitlawb persistence layer

---

## Credentials & Reliability

| Source | Auth Required | Rate Limits | Reliability |
|--------|--------------|-------------|-------------|
| OpenLaunch (eth_getLogs) | Public RPC | Provider-dependent | High (on-chain) |
| Pump.fun (Solana RPC) | Public RPC | 100 req/10s (public) | High (on-chain) |
| Bags API | None (public) | Unknown — add backoff | Medium-High |
| DexScreener | None (public) | 300 req/min (documented) | High |
| GeckoTerminal | None (public) | 30 req/min (free) | Medium |

**All API keys stay in `.env` / server-side.** No new credentials are required for this step — Bags API is public, and on-chain RPC is already configured.

---

## What Is Ready for Immediate Indexing

1. **OpenLaunch** (Base + Robinhood) — on-chain `eth_getLogs` with topic `0xda18b133`
2. **Pump.fun** (Solana) — program `6EF8rrecthR...` instruction parsing
3. **Stonkfun** (Solana) — Bags API `/v2/launches` filter `launchpad=Stonkfun`
4. **Bags aggregator** (Solana) — Bags API `/v2/launches` for all tracked launchpads
5. **Flap** (BSC + RH) — DexScreener `dexId=flapsh` as interim (retroactive)

## What Needs Additional Research

1. **4meme** — Need verified ABI from BscScan for implementation contracts
2. **Pons** — Need factory ABI from Robinhood Explorer
3. **Genius.fun** — Need factory contract address
4. **O1 Launchpad** — Need factory contract address
5. **Stonk.fun (Base)** — Need factory contract address
6. **Stonk (Solana)** — Identity resolution (may be same as Stonkfun)
