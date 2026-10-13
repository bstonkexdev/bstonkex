# TerminalMarketNavigation — Build Plan

## Files (build order)

1. **`src/components/markets/ChainLaunchpads.ts`** — 8-chain launchpad matrix (BSC, BASE, RH, SOL, INK, ARC, STABLE, TRON) + filter tabs + chain list
2. **`src/components/markets/MarketSection.tsx`** — Rewrite: 4 tiers (chain drawer → launchpad list → filter toolbar → token feed) with cached fetch + live WS
3. **`src/components/MarketsPage.tsx`** — Verify MarketSection import still works (no changes expected)

## Key Decisions
- 8 chains: BSC, BASE, RH, SOL, INK, ARC, STABLE, TRON (all scrollable)
- Launchpad logos: `/assets/launchpads/{id}.png` with `onError` → hide
- 6 sub-filters: Trending/New/Bonding/Migrated/Gainers/Losers
- Token tag shows chain name (e.g. "sol", "bsc") not "pump"
- Cached fetch on mount + launchpad change, PumpPortal WS for live
