# Pump.fun Integration — Verification Report

## A. Implemented (code complete)

| Item | Files | Status |
|------|-------|--------|
| PDA derivation (seeds `["bonding-curve", mint]`, `["global"]`) | `pda.ts` | Done |
| Account discriminator + owner + layout verification | `pumpfun-accounts.ts` | Done |
| Dual BondingCurve layout (legacy-150 / extended-158) | `pumpfun-accounts.ts` | Done |
| Dynamic fees (Global `fee_basis_points` + per-curve `creator_fee_bps`) | `bonding-curve.ts` | Done |
| BigInt constant-product pricing, spot vs executable quote, slippage | `bonding-curve.ts` | Done |
| Pyth SOL/USD with 5-min staleness gate; USD stays null when stale | `sol-price.ts` | Done |
| Anchor event discriminators (exact IDL bytes) + full TradeEvent offsets | `pumpfun-ws.ts` | Done |
| CompleteEvent vs CompletePumpAmmMigrationEvent (distinct decoders) | `pumpfun-ws.ts` | Done |
| Quote-mint detection; non-SOL curves excluded from SOL quotes/volume | `bonding-curve.ts`, `onchain-metrics.ts` | Done |
| WS reconnect + exponential backoff + backfill + slot checkpoints | `pumpfun-ws.ts` | Done |
| Persistent signature dedup (250 sigs in checkpoint) | `pumpfun-ws.ts` | Done |
| Lifecycle in-place updates (create→curve→migrating→launched) — no duplicates | `token-index.ts`, `pumpfun-ws.ts` | Done |
| Zero-liquidity discovery, null-price behavior, UI badges, BNB indexer | untouched | Preserved |

## B. Verified against authoritative definitions (official IDL)
Source: `pump-fun/pump-public-docs/idl/pump.json`
- Program ID `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` matches IDL `address`
- BondingCurve discriminator `[23,183,248,55,96,216,172,96]` = SHA256("account:BondingCurve")[0..8] (computed + matched)
- Event discriminators CreateEvent/TradeEvent/CompleteEvent/CompletePumpAmmMigrationEvent/PostCompleteBuyEvent match SHA256("event:Name")[0..8] and IDL
- No generic "MigrateEvent" exists — real events are `CompleteEvent` + `CompletePumpAmmMigrationEvent` (code uses both; the old assumed MigrateEvent was removed)
- Full BondingCurve has 20 fields (quote_mint, creator_fee_bps, depth, …) — decoded; 150-byte accounts handled as `legacy-150`
- TradeEvent full layout (383 bytes) with fee fields at 161/169/209/217
- Fee model: NOT fixed 1%+1% — `FeeConfig`/`Global` carry `fee_basis_points` + `creator_fee_basis_points` + per-curve overrides; code reads them from chain

## C. Verified against LIVE mainnet data (this session)
- **Global account `4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jaxnjf`**: owner correct, disc correct, `fee_basis_points=95` (0.95%), `creator_fee_basis_points=5`, genesis reserves 30 SOL / 1.073B / 793.1M — all match code constants
- **PDA derivation**: mint `2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump` (PNUT) → PDA `2JUXSuq1A1EdBzZj757cXFYuALPxv6vee4X981ajpzo8` (bump 254), owner = pump.fun program, disc matched. FARTCOIN mint → `TBHe5tJnuT4CQbHorJ1uVdfUoaYGPKgfCpiv2jgesVN` (bump 255) — same result. **Real accounts are 150 bytes** → decoder fixed to accept legacy-150
- **TradeEvent live decode (production code, 3 txs at slot 456298163)**: 3/3 decoded; fee math PASS (0.000890 SOL × 95bps = 0.000008458 SOL exact); spot prices sane (1.26e-7 SOL/token)
- **Bug found + fixed by live verification**: spot-price formula was off by 10⁹ (used `10^6` multiplier on lamports/raw-units; correct is `(vQuote/1e9)/(vToken/1e6)`)
- **Bug found + fixed by live verification**: a quote-mint trade decoded with `solAmount=0, fee=0.2998` — non-SOL-denominated trades now excluded from SOL volume instead of misreporting 0
- **Migration event offset bug fixed**: decoder had read `mint_amount` as timestamp

Verification data used: mints `2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump`, `9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump`, `F9bxXS9bG9vpu5vjy7dYqWJFA8HB6ynGBkbxYjHqpump`, `HDTRru3QPEPoMkMR1crJoxVWHogYHdPurDfvyZ88pump`, `F6npf9NBes1i1XDopNzepXjFuLYqMwnwSMqXc6dHpump`; txs `5joBsZEmANssAaRcWWsJ…`, `3WFksaWDUFKAx19gNEhL…`, `uN66WeibunXwQSTG19jc…` (slot 456298163), `2Pb34Tf4SbQx9BWZHBPJnrUnhACmBuZ6pDaUYx21ThhRHHF1boVGJkf4gDjExcob9mMZySo1GVqc9fPqqu12HE3w` (slot 456290937).

## D. Blocked / not verified (honest limits)
1. **Historical backfill depth** — see §F for the exact limitation and archival requirements. Historical coverage is NOT complete on public RPC.
2. **Quote-mint (non-SOL) curves** — detected (`quoteMint` field); pricing/volume explicitly null (never zero, never SOL-substituted). Verified live that a stale Pyth price propagates `spotPriceUsd: null` instead of a fabricated value.
3. **WebSocket stream live-run** — reconnect/backfill/dedup logic is implemented and compiles; a sustained live WS session wasn't run in this environment (browsers only). The polling path WAS exercised live.
4. **Token-2022 assets** — CreateEvent carries `token_program`; decode stores it only implicitly. Not verified against a Token-2022 curve.
5. **PostCompleteBuyEvent payload** — discriminator matched and event is emitted as `buy` with migration destination; full extended payload (pool reserves) not decoded.
6. **CompleteEvent / CompletePumpAmmMigrationEvent live capture** — decoders are built to IDL definitions (field offsets documented in code), but a scan of 55 recent mainnet transactions (rate-limited session) found zero of these rare events, so they are code-reviewed, NOT mainnet-verified. Migration pool association (`pool`, `quote_mint` offsets 136/168) follows the IDL only.

## E. WebSocket / backfill hardening (this session)
- **Ascending-slot processing**: backfill sorts signatures oldest-first; the checkpoint only advances over fully processed ranges.
- **Gap freezing**: an unfetched transaction (pruned/RPC lag) freezes the contiguous checkpoint boundary — later successes cannot push the checkpoint past a gap, so nothing is silently skipped. The gap is retried on the next backfill.
- **Pagination**: `getSignaturesForAddress` is walked with `before` cursors (10 pages × 50) until the checkpoint slot is reached.
- **Monotonic slots**: out-of-order WS notifications cannot regress the checkpoint.
- **Error surfacing**: listing/fetch failures are recorded in `PumpFunStreamState.lastError` instead of being swallowed.
- **Dedup persistence**: 250 recent signatures persist in the checkpoint, restored on reload (dedup across reconnects).
- **Lifecycle without duplicates**: `updateTokenLifecycle` updates the existing record in place; on migration it switches `priceSource` to `dex_pair` + `liquidityType: 'real'` so post-migration pricing comes from the AMM pool, not the emptied curve.

## F. Public RPC historical-data limitation (documentation requirement)
**Observed behavior (verified live in these sessions):**
- `getSignaturesForAddress` on `https://api.mainnet-beta.solana.com` returns recent signatures reliably (~last few hundred slots), with `finalized` commitment sometimes serving where `confirmed` fails.
- `getTransaction` returns `null` for a large fraction of even very recent signatures (observed 0/12 and 0/6 fetchable in two probes at `confirmed`; some success at `finalized`), and returns nothing at all beyond a shallow history window. This is public-RPC pruning/`--no-transaction-history` behavior, not a code bug.
- Consequence: **historical event coverage is best-effort recent-window only.** Deep backfill, historical volume recomputation, and older lifecycle-event verification cannot be done against the public endpoint. The code reports this honestly (`Backfill left N gap(s) … will retry`) and never fabricates coverage.

**What archival access would be needed for complete coverage:**
- A paid RPC provider with transaction history + `getTransaction` archival (e.g. Helius, QuickNode, Triton, Alchemy Solana), OR
- A self-hosted validator / RPC node with `--enable-rpc-transaction-history` (or BigTable historical accounts), OR
- A Yellowstone/Geyser gRPC stream (e.g. Helius, Triton, Yellowstone-grpc) for replayable event streaming with durable cursors, which removes the need for `getTransaction` backfill entirely and is the recommended production architecture for the indexer.

**Claims discipline:** the app never displays or reports "complete history"; metrics carry `indexingCoverage`/`isReliable` flags and stay null when coverage is insufficient.

## G. Preserved (no changes)
- Zero-liquidity discovery (`market-discovery.ts`), token identity/anti-duplicate, BNB Chain indexers, UI badges (CURVE/MIGRATING/LIVE/DEX), "Price unavailable" null-price behavior.

## H. Checks performed this session (evidence log)
**Mainnet-verified (executed against live RPC):**
- Quote validation on live curve `F6npf9NBes1i1XDopNzepXjFuLYqMwnwSMqXc6dHpump`: fee check (0.5 SOL → 0.00475 protocol + 0.00025 creator = exact 95+5 bps floor-division) PASS; independent BigInt re-derivation of `minOut` matches production adapter to <1e-9 (floor-division rounding) PASS; buy price ≥ spot PASS; sell price ≤ spot PASS.
- Completed curve `2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump` (PNUT): `getBuyQuote`/`getSellQuote` both return `null` PASS — completed curves are non-executable.
- Stale-price propagation: `spotPriceUsd` observed as `null` during the quote run (Pyth stale at that moment) and stayed null — no fabricated USD surfaced.
- Lifecycle-event scan: 55 recent mainnet transactions scanned for CompleteEvent/CompletePumpAmmMigrationEvent/CreateEvent discriminators — 0 found (rare events, rate-limited scan). Decoders remain code-reviewed only.

**Code-reviewed (compiled + type-checked, not live-executed):**
- Backfill gap-freezing logic (ascending sort, contiguous checkpoint, gap freeze, pagination, monotonic slots) — compiled clean; a live gap/recovery drill was not possible (public RPC pruning is the very gap source).
- Migration → `updateTokenLifecycle` source-switch (`priceSource: 'dex_pair'`, `liquidityType: 'real'`) — type-checked, not yet exercised by a captured migration event.
- Quote-mint null-pricing paths in `getCurveState`/`enrichWithBondingCurve` — type-checked; a live non-SOL-quote curve was not captured.

**Unresolved limitations:** see §D items 2–6 and §F (archival RPC required for complete history).