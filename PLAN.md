# Market Section Refactor — Build Plan

## Files to Create/Modify (build order)

1. **`src/components/markets/MarketSection.tsx`** — New unified market section:
   - Tier 1: Chain selector (All/BSC/SOL/Base)
   - Tier 2: Launchpad list (per-chain, with logos)
   - Tier 3: Filter bar (Trending/New/Bonding/Migrated/Gainers/Losers)
   - Tier 4: Rich token rows (image+fallback, symbol, age, mcap, holders, price, 24h change)
   - Cached fetch on mount + live PumpPortal WS ingestion

2. **`src/components/markets/LaunchpadLogos.ts`** — Launchpad metadata (names, IDs, icons per chain)

3. **`src/components/MarketsPage.tsx`** — Replace old filter stack + PumpFunMarketSection with new MarketSection

## Architecture Decisions
- Single component for the full market section (replaces 4+ scattered pieces)
- Chain → Launchpad mapping drives data fetching
- `useEffect` fetches cached tokens instantly on mount/switch
- PumpPortal WS merges live tokens in real-time
- Tailwind-style inline styles to match existing codebase patterns
