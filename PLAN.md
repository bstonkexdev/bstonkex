# MarketTerminal with TokenAvatar — Build Plan

## Files (build order)
1. **`src/components/markets/TokenAvatar.tsx`** — Extracted reusable avatar with letter fallback
2. **`src/components/markets/MarketSection.tsx`** — Rewrite: use TokenAvatar, cleaner feed with name+mcap, loading state

## Changes
- TokenAvatar: image with `onError` → purple letter-circle fallback
- Token rows show: avatar, symbol + chain tag, name • MCAP, price + 24h change
- Loading spinner during fetch
- "No cached tokens found" empty state with launchpad name
- Chain drawer stays as horizontal pills (matches user spec)
- Uses `/api/tokens/cached` endpoint with query params
