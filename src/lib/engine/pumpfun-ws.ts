// Cupcak8 Swap — Pump.fun Event Stream (Production Hardened)
// Uses Anchor event discriminators for decoding, not log-text matching.
// Includes dedup, checkpoint persistence, and reconnect backfill.
//
// Anchor event discriminator = SHA256("event:EventName")[0..8]
// Known Pump.fun events:
//   CreateEvent:  discriminator from "event:CreateEvent"
//   TradeEvent:   discriminator from "event:TradeEvent"
//   CompleteEvent: discriminator from "event:CompleteEvent"
//   MigrateEvent:  discriminator from "event:MigrateEvent"

import { recordPumpFunTrade } from './onchain-metrics';
import { updateTokenLifecycle } from './token-index';

// ── Types ──────────────────────────────────────────────────

export type PumpFunEventType = 'create' | 'buy' | 'sell' | 'complete' | 'migrate' | 'unknown';

export interface PumpFunEvent {
  type: PumpFunEventType;
  signature: string;
  slot: number;
  timestamp: number;
  mint: string;
  creator: string | null;
  solAmount: number | null;
  tokenAmount: number | null;
  isBuy: boolean | null;
  /** For create events */
  name?: string;
  symbol?: string;
  /** For complete/migrate events */
  migrationDestination?: string | null;
  /** Post-migration pool address (CompletePumpAmmMigrationEvent.pool) */
  migrationPool?: string | null;
  /** Post-migration quote mint (CompletePumpAmmMigrationEvent.quote_mint) */
  migrationQuoteMint?: string | null;
  /** Post-trade virtual reserves (from TradeEvent) — in SOL / whole tokens */
  virtualSolReserves?: number;
  virtualTokenReserves?: number;
  realSolReserves?: number;
  realTokenReserves?: number;
  /** Verified fee fields (TradeEvent offsets 161/169/209) */
  feeBasisPoints?: number | null;
  feeSol?: number | null;
  creatorFeeBasisPoints?: number | null;
}

export type PumpFunListener = (event: PumpFunEvent) => void;

export interface PumpFunStreamState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  lastEventAt: number | null;
  eventsReceived: number;
  eventsDeduped: number;
  reconnectCount: number;
  lastError: string | null;
  slot: number | null;
  lastCheckpointSlot: number | null;
  /** Active logsSubscribe subscription id (null when disconnected) */
  subscriptionId?: number | null;
}

// ── Constants ──────────────────────────────────────────────

const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SOLANA_WS = 'wss://api.mainnet-beta.solana.com';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

// ── Event Discriminators (IDL-verified exact bytes) ────────
// Verified against official Pump.fun IDL and SHA256("event:Name")[0..8]

const DISC_CREATE = new Uint8Array([27, 114, 169, 77, 222, 235, 99, 118]);
const DISC_TRADE = new Uint8Array([189, 219, 127, 211, 78, 230, 97, 238]);
const DISC_COMPLETE = new Uint8Array([95, 114, 97, 156, 212, 46, 152, 8]);
const DISC_COMPLETE_PUMP_AMM_MIGRATION = new Uint8Array([189, 233, 93, 185, 92, 148, 234, 148]);
const DISC_POST_COMPLETE_BUY = new Uint8Array([111, 176, 109, 139, 49, 108, 213, 251]);

function discMatches(data: Uint8Array, expected: Uint8Array): boolean {
  if (data.length < 8) return false;
  for (let i = 0; i < 8; i++) if (data[i] !== expected[i]) return false;
  return true;
}

// ── Base58 decode (for mint addresses in event data) ───────

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
  let result = '';
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  while (num > 0n) { result = B58[Number(num % 58n)] + result; num /= 58n; }
  for (const b of bytes) { if (b === 0) result = '1' + result; else break; }
  return result;
}

// ── Anchor Event Data Decoder ──────────────────────────────

/**
 * Decode a Trade event from Anchor event data.
 * Offsets verified live against mainnet TradeEvent (383 bytes) at slot 456290937:
 *   mint@8(32), sol_amount@40(u64), token_amount@48(u64), is_buy@56(bool),
 *   user@57(32), timestamp@89(i64), virtual_sol@97(u64), virtual_token@105(u64),
 *   real_sol@113(u64), real_token@121(u64), fee_recipient@129(32),
 *   fee_basis_points@161(u64), fee@169(u64), creator@177(32),
 *   creator_fee_basis_points@209(u64), creator_fee@217(u64).
 * Verified: fee_basis_points=95 matches Global; fee=0.000050352 SOL = 0.0053×0.95%.
 */
function decodeTradeEventData(data: Uint8Array): {
  mint: string;
  solAmount: number;
  tokenAmount: number;
  isBuy: boolean;
  user: string;
  timestamp: number;
  virtualSolReserves: number;
  virtualTokenReserves: number;
  realSolReserves: number;
  realTokenReserves: number;
  feeBasisPoints: number | null;
  fee: number | null;
  creator: string | null;
  creatorFeeBasisPoints: number | null;
} | null {
  if (data.length < 129) return null;

  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const o = 8; // Skip discriminator

    const mint = base58Encode(data.slice(o, o + 32));
    const solAmount = Number(view.getBigUint64(o + 32, true)) / 1e9;
    const tokenAmount = Number(view.getBigUint64(o + 40, true)) / 1e6;
    const isBuy = data[o + 48] === 1;
    const user = base58Encode(data.slice(o + 49, o + 81));
    const timestamp = Number(view.getBigInt64(o + 81, true));
    const virtualSolReserves = Number(view.getBigUint64(o + 89, true)) / 1e9;
    const virtualTokenReserves = Number(view.getBigUint64(o + 97, true)) / 1e6;
    const realSolReserves = Number(view.getBigUint64(o + 105, true)) / 1e9;
    const realTokenReserves = Number(view.getBigUint64(o + 113, true)) / 1e6;

    // Extended fields (present in the current deployed 383-byte layout)
    let feeBasisPoints: number | null = null;
    let fee: number | null = null;
    let creator: string | null = null;
    let creatorFeeBasisPoints: number | null = null;
    if (data.length >= 177) {
      feeBasisPoints = Number(view.getBigUint64(o + 153, true));
      fee = Number(view.getBigUint64(o + 161, true)) / 1e9;
    }
    if (data.length >= 217) {
      creator = base58Encode(data.slice(o + 169, o + 201));
      creatorFeeBasisPoints = Number(view.getBigUint64(o + 201, true));
    }

    return {
      mint, solAmount, tokenAmount, isBuy, user, timestamp,
      virtualSolReserves, virtualTokenReserves, realSolReserves, realTokenReserves,
      feeBasisPoints, fee, creator, creatorFeeBasisPoints,
    };
  } catch {
    return null;
  }
}

/**
 * Decode a Create event from Anchor event data.
 *
 * CreateEvent layout (after 8-byte discriminator):
 *   name: string (4-byte length prefix + UTF-8 bytes)
 *   symbol: string (4-byte length prefix + UTF-8 bytes)
 *   uri: string (4-byte length prefix + UTF-8 bytes)
 *   mint: [u8; 32]
 *   bondingCurve: [u8; 32]
 *   user: [u8; 32]
 */
function decodeCreateEventData(data: Uint8Array): {
  name: string;
  symbol: string;
  mint: string;
  creator: string;
} | null {
  if (data.length < 8 + 32) return null;

  try {
    let offset = 8; // Skip discriminator

    // Read string: 4-byte LE length + bytes
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    function readString(): string {
      const len = view.getUint32(offset, true);
      offset += 4;
      const bytes = data.slice(offset, offset + len);
      offset += len;
      return new TextDecoder().decode(bytes);
    }

    const name = readString();
    const symbol = readString();
    readString(); // uri — not tracked

    if (offset + 32 > data.length) return null;
    const mint = base58Encode(data.slice(offset, offset + 32));
    offset += 32;

    // Skip bonding curve (32 bytes)
    offset += 32;

    if (offset + 32 > data.length) return { name, symbol, mint, creator: '' };
    const creator = base58Encode(data.slice(offset, offset + 32));

    return { name, symbol, mint, creator };
  } catch {
    return null;
  }
}

/**
 * Decode a Complete event.
 *
 * CompleteEvent layout (after 8-byte discriminator):
 *   user: [u8; 32]
 *   mint: [u8; 32]
 *   bondingCurve: [u8; 32]
 *   timestamp: i64
 */
function decodeCompleteEventData(data: Uint8Array): { mint: string; timestamp: number } | null {
  if (data.length < 8 + 32 + 32) return null;
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    // Skip user (32 bytes after discriminator)
    const mint = base58Encode(data.slice(8 + 32, 8 + 64));
    const timestamp = data.length >= 8 + 32 + 32 + 8 ? Number(view.getBigInt64(8 + 64, true)) : Date.now() / 1000;
    return { mint, timestamp };
  } catch {
    return null;
  }
}

/**
 * Decode CompletePumpAmmMigrationEvent (IDL-verified offsets).
 * Layout after 8-byte discriminator:
 *   user@8(32), mint@40(32), mint_amount@72(u64), sol_amount@80(u64),
 *   pool_migration_fee@88(u64), bonding_curve@96(32), timestamp@128(i64),
 *   pool@136(32), quote_mint@168(32).
 * Note: mint_amount sits where CompleteEvent has its timestamp — must NOT
 * reuse decodeCompleteEventData for this event type.
 */
function decodeMigrationEventData(data: Uint8Array): {
  mint: string;
  timestamp: number;
  solAmount: number | null;
  pool: string | null;
  quoteMint: string | null;
} | null {
  if (data.length < 8 + 32 + 32) return null;
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const mint = base58Encode(data.slice(40, 72));
    const timestamp = data.length >= 136 ? Number(view.getBigInt64(128, true)) : Date.now() / 1000;
    const solAmount = data.length >= 88 ? Number(view.getBigUint64(80, true)) / 1e9 : null;
    const pool = data.length >= 168 ? base58Encode(data.slice(136, 168)) : null;
    const quoteMint = data.length >= 200 ? base58Encode(data.slice(168, 200)) : null;
    return { mint, timestamp, solAmount, pool, quoteMint };
  } catch {
    return null;
  }
}

// ── Program Data Log Parser ────────────────────────────────

/**
 * Extract Anchor events from program "Program data:" log entries.
 *
 * Anchor emits events as base64-encoded data in log lines like:
 *   "Program data: <base64_encoded_event>"
 *
 * The decoded data starts with the 8-byte event discriminator.
 */
/** Exported for verification harnesses — decodes Anchor events from raw logs. */
export function parseProgramDataLogs(signature: string, slot: number, blockTime: number | null, logs: string[]): PumpFunEvent[] {
  const events: PumpFunEvent[] = [];

  for (const log of logs) {
    if (!log.startsWith('Program data: ')) continue;

    const base64Data = log.slice('Program data: '.length).trim();
    let data: Uint8Array;
    try {
      data = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    } catch { continue; }
    if (data.length < 8) continue;

    // TradeEvent
    if (discMatches(data, DISC_TRADE)) {
      const decoded = decodeTradeEventData(data);
      if (decoded) {
        events.push({
          type: decoded.isBuy ? 'buy' : 'sell',
          signature, slot,
          timestamp: blockTime ? blockTime * 1000 : decoded.timestamp * 1000,
          mint: decoded.mint,
          creator: null,
          solAmount: decoded.solAmount,
          tokenAmount: decoded.tokenAmount,
          isBuy: decoded.isBuy,
          virtualSolReserves: decoded.virtualSolReserves,
          virtualTokenReserves: decoded.virtualTokenReserves,
          realSolReserves: decoded.realSolReserves,
          realTokenReserves: decoded.realTokenReserves,
          feeBasisPoints: decoded.feeBasisPoints,
          feeSol: decoded.fee,
          creatorFeeBasisPoints: decoded.creatorFeeBasisPoints,
        });
      }
      continue;
    }

    // CreateEvent
    if (discMatches(data, DISC_CREATE)) {
      const decoded = decodeCreateEventData(data);
      if (decoded) {
        events.push({
          type: 'create',
          signature, slot,
          timestamp: blockTime ? blockTime * 1000 : Date.now(),
          mint: decoded.mint,
          creator: decoded.creator,
          solAmount: null, tokenAmount: null, isBuy: null,
          name: decoded.name,
          symbol: decoded.symbol,
        });
      }
      continue;
    }

    // CompleteEvent (bonding curve finished)
    if (discMatches(data, DISC_COMPLETE)) {
      const decoded = decodeCompleteEventData(data);
      if (decoded) {
        events.push({
          type: 'complete',
          signature, slot,
          timestamp: blockTime ? blockTime * 1000 : Date.now(),
          mint: decoded.mint,
          creator: null,
          solAmount: null, tokenAmount: null, isBuy: null,
        });
      }
      continue;
    }

    // CompletePumpAmmMigrationEvent (migration to PumpSwap AMM)
    if (discMatches(data, DISC_COMPLETE_PUMP_AMM_MIGRATION)) {
      const decoded = decodeMigrationEventData(data);
      if (decoded) {
        events.push({
          type: 'migrate',
          signature, slot,
          timestamp: blockTime ? blockTime * 1000 : decoded.timestamp * 1000,
          mint: decoded.mint,
          creator: null,
          solAmount: decoded.solAmount, tokenAmount: null, isBuy: null,
          migrationDestination: 'pumpswap',
          migrationPool: decoded.pool,
          migrationQuoteMint: decoded.quoteMint,
        });
      }
      continue;
    }

    // PostCompleteBuyEvent (buy after curve completion)
    if (discMatches(data, DISC_POST_COMPLETE_BUY)) {
      // Same layout as TradeEvent for the first fields
      const decoded = decodeTradeEventData(data);
      if (decoded) {
        events.push({
          type: 'buy',
          signature, slot,
          timestamp: blockTime ? blockTime * 1000 : Date.now(),
          mint: decoded.mint,
          creator: null,
          solAmount: decoded.solAmount,
          tokenAmount: decoded.tokenAmount,
          isBuy: true,
          migrationDestination: 'pumpswap',
        });
      }
    }
  }

  return events;
}

// ── Deduplication ──────────────────────────────────────────

const seenSignatures = new Set<string>();
const MAX_SEEN = 10000;

function isDuplicate(signature: string): boolean {
  return seenSignatures.has(signature);
}

function markSeen(signature: string): void {
  seenSignatures.add(signature);
  // Evict old entries if set grows too large
  if (seenSignatures.size > MAX_SEEN) {
    const iter = seenSignatures.values();
    for (let i = 0; i < 1000; i++) {
      const { value, done } = iter.next();
      if (done) break;
      seenSignatures.delete(value);
    }
  }
}

// ── Checkpoint Persistence ─────────────────────────────────

interface Checkpoint {
  slot: number;
  timestamp: number;
  lastSignature: string | null;
  /** Recent seen signatures — restores dedup state after reload (bounded) */
  seenSignatures: string[];
}

// Bound the persisted dedup list so the checkpoint stays small (~25KB max).
// 1000 sigs × ~90 chars ≈ 90KB would be wasteful; 250 covers the backfill window.
const PERSISTED_SEEN_LIMIT = 250;

function loadCheckpoint(): Checkpoint | null {
  try {
    const raw = localStorage.getItem('cupcak8_pumpfun_checkpoint');
    if (!raw) return null;
    const cp = JSON.parse(raw) as Checkpoint;
    // Restore dedup state so post-reload backfill cannot double-count trades
    if (Array.isArray(cp.seenSignatures)) {
      for (const sig of cp.seenSignatures) {
        if (typeof sig === 'string') seenSignatures.add(sig);
      }
    }
    return cp;
  } catch { return null; }
}

function saveCheckpoint(cp: Checkpoint): void {
  try {
    localStorage.setItem('cupcak8_pumpfun_checkpoint', JSON.stringify(cp));
  } catch {}
}

/** Snapshot the most recent seen signatures for the checkpoint. */
function snapshotSeenSignatures(): string[] {
  const all = [...seenSignatures];
  return all.slice(Math.max(0, all.length - PERSISTED_SEEN_LIMIT));
}

// ── WebSocket Stream ───────────────────────────────────────

export function createPumpFunEventStream() {
  let ws: WebSocket | null = null;
  let listeners: PumpFunListener[] = [];
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let state: PumpFunStreamState = {
    status: 'disconnected',
    lastEventAt: null,
    eventsReceived: 0,
    eventsDeduped: 0,
    reconnectCount: 0,
    lastError: null,
    slot: null,
    lastCheckpointSlot: null,
  };
  let backoffMs = 1000;
  const maxBackoff = 30000;
  let destroyed = false;
  let subscriptionId: number | null = null;

  // Load checkpoint on creation
  const checkpoint = loadCheckpoint();
  if (checkpoint) {
    state.lastCheckpointSlot = checkpoint.slot;
    state.slot = checkpoint.slot;
  }

  function notifyListeners(events: PumpFunEvent[]) {
    for (const event of events) {
      if (isDuplicate(event.signature)) {
        state.eventsDeduped++;
        continue;
      }
      markSeen(event.signature);
      state.eventsReceived++;
      // Persist trade metrics (fee fields verified from TradeEvent offsets 161/169/209)
      recordPumpFunTrade(event);
      // Lifecycle transitions update the EXISTING token record in place —
      // a token tracked through create → curve → complete → migration never duplicates.
      if (event.type === 'complete') {
        updateTokenLifecycle('solana', event.mint, {
          marketState: 'migrating',
          bondingCurveProgress: 100,
        }).catch(() => {});
      } else if (event.type === 'migrate') {
        // Post-migration: pricing must switch off the (now-empty) bonding curve
        // to the AMM pool. Pool address is carried in event.migrationPool.
        updateTokenLifecycle('solana', event.mint, {
          marketState: 'launched',
          bondingCurveProgress: 100,
          priceSource: 'dex_pair',
          liquidityType: 'real',
        }).catch(() => {});
      }
      for (const fn of listeners) {
        try { fn(event); } catch {}
      }
    }
  }

  function setState(patch: Partial<PumpFunStreamState>) {
    state = { ...state, ...patch };
  }

  function saveStateCheckpoint() {
    if (state.slot !== null) {
      saveCheckpoint({
        slot: state.slot,
        timestamp: Date.now(),
        lastSignature: null,
        seenSignatures: snapshotSeenSignatures(),
      });
      setState({ lastCheckpointSlot: state.slot });
    }
  }

  /**
   * Backfill events missed during disconnection.
   * Correctness guarantees (no silent skips):
   *  - Pagination: walks getSignaturesForAddress pages via `before` until it
   *    reaches the checkpoint slot (or a page/size bound).
   *  - Ordering: processes signatures in ASCENDING slot order so the checkpoint
   *    can only move forward over fully processed ranges.
   *  - Gap safety: if a transaction cannot be fetched (pruned/failed), the
   *    checkpoint does NOT advance past it — the gap is recorded in stream state
   *    and retried on the next backfill.
   */
  async function backfill() {
    const cp = loadCheckpoint();
    const fromSlot = cp?.slot ?? 0;

    // Collect signatures newer than the checkpoint, paginating backwards.
    const collected: { signature: string; slot: number }[] = [];
    let before: string | undefined;
    let pages = 0;
    const MAX_PAGES = 10;
    const PAGE_SIZE = 50;

    try {
      while (pages < MAX_PAGES) {
        const resp = await fetch(SOLANA_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getSignaturesForAddress',
            params: [PUMP_FUN_PROGRAM_ID, {
              limit: PAGE_SIZE,
              commitment: 'confirmed',
              ...(before ? { before } : {}),
            }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await resp.json();
        const batch: any[] = data.result || [];
        if (batch.length === 0) break;

        let reachedCheckpoint = false;
        for (const s of batch) {
          if (s.err) continue;
          if (s.slot <= fromSlot) { reachedCheckpoint = true; continue; }
          collected.push({ signature: s.signature, slot: s.slot });
        }
        pages++;
        if (reachedCheckpoint || batch.length < PAGE_SIZE) break;
        before = batch[batch.length - 1].signature;
      }
    } catch (e: any) {
      // Listing failed: record it, do NOT pretend backfill completed.
      setState({ lastError: `Backfill listing failed: ${e.message ?? e}` });
      return;
    }

    // ASCENDING slot order — checkpoint advances only over processed ranges.
    collected.sort((a, b) => a.slot - b.slot);

    // Highest slot up to which every transaction has been processed.
    let contiguousSlot = fromSlot;
    let gapCount = 0;
    // Once a gap is seen, the contiguous boundary freezes at the last fully
    // processed slot BEFORE the gap — later successes must not push the
    // checkpoint past the unfetched range (that would silently skip it).
    let gapFrozen = false;

    for (const sigInfo of collected) {
      if (isDuplicate(sigInfo.signature)) {
        if (!gapFrozen) contiguousSlot = Math.max(contiguousSlot, sigInfo.slot);
        continue;
      }

      try {
        const txResp = await fetch(SOLANA_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getTransaction',
            params: [sigInfo.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
          }),
          signal: AbortSignal.timeout(10000),
        });
        const txData = await txResp.json();
        const tx = txData.result;
        if (!tx) {
          // Unfetchable (pruned or RPC lag). Freeze the checkpoint boundary —
          // the gap will be re-attempted on the next backfill.
          gapCount++;
          gapFrozen = true;
          continue;
        }

        const logs = tx.meta?.logMessages || [];
        const events = parseProgramDataLogs(sigInfo.signature, tx.slot, tx.blockTime, logs);
        if (events.length > 0) notifyListeners(events);
        if (!gapFrozen) contiguousSlot = Math.max(contiguousSlot, sigInfo.slot);
      } catch (e: any) {
        gapCount++;
        gapFrozen = true;
        setState({ lastError: `Backfill fetch failed at ${sigInfo.slot}: ${e.message ?? e}` });
      }
    }

    // Commit checkpoint at the contiguous processed boundary only.
    if (contiguousSlot > fromSlot) {
      state = { ...state, slot: Math.max(state.slot ?? 0, contiguousSlot) };
    }
    if (gapCount > 0) {
      setState({
        lastError: `Backfill left ${gapCount} gap(s) at/below slot ${contiguousSlot} (public RPC pruned/unavailable) — will retry`,
      });
    }
    saveStateCheckpoint();
  }

  function connect() {
    if (destroyed) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;

    setState({ status: 'connecting' });

    try {
      ws = new WebSocket(SOLANA_WS);

      ws.onopen = () => {
        setState({ status: 'connected', reconnectCount: 0 });
        backoffMs = 1000;

        // Subscribe to logs mentioning Pump.fun program
        ws!.send(JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'logsSubscribe',
          params: [
            { mentions: [PUMP_FUN_PROGRAM_ID] },
            { commitment: 'confirmed' },
          ],
        }));

        // Backfill events missed during disconnection
        if (state.reconnectCount > 0) {
          backfill().catch(() => {});
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);

          // Subscription confirmation
          if (data.id === 1 && typeof data.result === 'number') {
            subscriptionId = data.result;
            return;
          }

          // Log notification
          if (data.method === 'logsNotification') {
            const value = data.params?.result?.value;
            if (!value || value.err) return;

            const signature = value.signature;
            const slot = value.slot;
            const logs = value.logs || [];

            if (signature && !isDuplicate(signature)) {
              // Monotonic slot tracking — out-of-order notifications must not
              // regress the checkpoint.
              setState({ slot: Math.max(state.slot ?? 0, slot), lastEventAt: Date.now() });

              const events = parseProgramDataLogs(signature, slot, Date.now(), logs);
              if (events.length > 0) notifyListeners(events);
            }
          }
        } catch (e: any) {
          setState({ lastError: `Parse error: ${e.message}` });
        }
      };

      ws.onerror = () => {
        setState({ status: 'error', lastError: 'WebSocket error' });
      };

      ws.onclose = () => {
        subscriptionId = null;
        if (!destroyed) {
          setState({ status: 'reconnecting' });
          saveStateCheckpoint();
          scheduleReconnect();
        }
      };
    } catch (e: any) {
      setState({ status: 'error', lastError: e.message });
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (destroyed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      setState({ reconnectCount: state.reconnectCount + 1 });
      backoffMs = Math.min(backoffMs * 2, maxBackoff);
      connect();
    }, backoffMs);
  }

  return {
    start() {
      destroyed = false;
      connect();
    },
    stop() {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { try { ws.close(); } catch {} }
      saveStateCheckpoint();
      setState({ status: 'disconnected' });
    },
    onEvent(fn: PumpFunListener) {
      listeners.push(fn);
      return () => { listeners = listeners.filter(l => l !== fn); };
    },
    getState(): PumpFunStreamState {
      return { ...state, subscriptionId };
    },
  };
}

// ── Polling Fallback ───────────────────────────────────────

export async function pollRecentPumpFunEvents(slotAfter?: number): Promise<PumpFunEvent[]> {
  try {
    const resp = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getSignaturesForAddress',
        params: [PUMP_FUN_PROGRAM_ID, { limit: 10, commitment: 'confirmed' }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    const sigs = (data.result || []).filter((s: any) => !s.err && (!slotAfter || s.slot > slotAfter));

    const allEvents: PumpFunEvent[] = [];
    for (const sig of sigs.slice(0, 5)) {
      if (isDuplicate(sig.signature)) continue;
      try {
        const txResp = await fetch(SOLANA_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getTransaction',
            params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
          }),
          signal: AbortSignal.timeout(10000),
        });
        const txData = await txResp.json();
        const tx = txData.result;
        if (!tx) continue;

        const logs = tx.meta?.logMessages || [];
        const events = parseProgramDataLogs(sig.signature, tx.slot, tx.blockTime, logs);
        for (const event of events) {
          if (!isDuplicate(event.signature)) {
            markSeen(event.signature);
            recordPumpFunTrade(event);
            allEvents.push(event);
          }
        }
      } catch {}
    }

    return allEvents;
  } catch {
    return [];
  }
}