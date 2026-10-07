// BSTONKEX Solana Trade Indexer — Detects real DEX trades on Solana
// Uses getSignaturesForAddress + getParsedTransaction to find Jupiter/Raydium swaps.
import { getRpcUrl } from './rpc-manager';
import { addLog, makeLog, updateComponent } from './infra-state';
import { processTrade, type TradeEvent } from './candle-engine';

// Known Solana DEX program IDs
const DEX_PROGRAMS: Record<string, string> = {
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter V6',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'Jupiter V4',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium V4',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX': 'OpenBook/Serum',
};

// Known stablecoin mints for USD value estimation
const STABLECOINS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

export interface SolanaIndexedEvent {
  type: 'swap' | 'transfer';
  signature: string;
  slot: number;
  timestamp: number;
  program: string;
  programName: string;
  feePayer: string;
  data: Record<string, unknown>;
}

type Listener = (event: SolanaIndexedEvent) => void;

let listeners: Listener[] = [];
let running = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSignature: string | null = null;
let processedCount = 0;
const processedSigs = new Set<string>();
const MAX_PROCESSED = 3000;

export function onSolanaIndexedEvent(cb: Listener): () => void {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}
export function isSolanaIndexerRunning(): boolean { return running; }

// ── RPC Helper ───────────────────────────────────────────────

async function solanaRpc(method: string, params: any[]): Promise<any> {
  const url = getRpcUrl('solana');
  if (!url) throw new Error('No Solana RPC URL');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Solana RPC ${method} failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

// ── Jupiter Swap Detection ───────────────────────────────────

async function fetchRecentJupiterSwaps(): Promise<SolanaIndexedEvent[]> {
  const events: SolanaIndexedEvent[] = [];
  try {
    // Get recent signatures for Jupiter V6 program
    const sigs = await solanaRpc('getSignaturesForAddress', [
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      { limit: 10 },
    ]);
    if (!Array.isArray(sigs)) return events;

    const newSigs = sigs.filter((s: any) =>
      !s.err && !processedSigs.has(s.signature) && s.signature !== lastSignature
    );

    for (const sig of newSigs.slice(0, 5)) {
      if (processedSigs.has(sig.signature)) continue;
      processedSigs.add(sig.signature);
      if (processedSigs.size > MAX_PROCESSED) {
        const arr = [...processedSigs];
        for (let i = 0; i < 500; i++) processedSigs.delete(arr[i]);
      }

      try {
        const tx = await solanaRpc('getParsedTransaction', [sig.signature, { maxSupportedTransactionVersion: 0 }]);
        if (!tx?.meta) continue;

        const feePayer = tx.transaction.message.accountKeys?.[0]?.pubkey || '';
        const innerInstructions = tx.meta.innerInstructions || [];
        const preBalances = tx.meta.preTokenBalances || [];
        const postBalances = tx.meta.postTokenBalances || [];

        // Detect swaps by looking at token balance changes
        const balanceChanges = new Map<string, number>();
        for (const pre of preBalances) {
          const key = `${pre.mint}:${pre.accountIndex}`;
          const preAmount = parseFloat(pre.uiTokenAmount?.uiAmountString || '0');
          balanceChanges.set(key, -preAmount);
        }
        for (const post of postBalances) {
          const key = `${post.mint}:${post.accountIndex}`;
          const existing = balanceChanges.get(key) || 0;
          balanceChanges.set(key, existing + parseFloat(post.uiTokenAmount?.uiAmountString || '0'));
        }

        // If there are both positive and negative changes, it's a swap
        const positives = [...balanceChanges.entries()].filter(([, v]) => v > 0.001);
        const negatives = [...balanceChanges.entries()].filter(([, v]) => v < -0.001);

        if (positives.length > 0 && negatives.length > 0) {
          const event: SolanaIndexedEvent = {
            type: 'swap',
            signature: sig.signature,
            slot: tx.slot || 0,
            timestamp: (tx.blockTime || Math.floor(Date.now() / 1000)) * 1000,
            program: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
            programName: 'Jupiter V6',
            feePayer,
            data: {
              tokenIn: negatives[0]?.[0]?.split(':')[0] || '',
              tokenOut: positives[0]?.[0]?.split(':')[0] || '',
              amountIn: Math.abs(negatives[0]?.[1] || 0),
              amountOut: positives[0]?.[1] || 0,
              computeUnits: tx.meta.computeUnitsConsumed,
            },
          };
          events.push(event);
          listeners.forEach(l => l(event));

          // Feed candle engine
          const price = (positives[0]?.[1] || 0) > 0
            ? Math.abs(negatives[0]?.[1] || 0) / (positives[0]?.[1] || 1)
            : 0;
          if (price > 0 && price < 1e15) {
            const tokenMint = negatives[0]?.[0]?.split(':')[0] || 'unknown';
            const trade: TradeEvent = {
              price,
              amountUsd: 0, // Needs price lookup
              timestamp: event.timestamp,
              side: 'buy',
            };
            processTrade('solana', tokenMint, trade);
          }
        }
        lastSignature = sig.signature;
      } catch { /* skip failed tx parsing */ }
    }
  } catch (e: any) {
    addLog(makeLog('solana-indexer', 'fetch-jupiter', 'failure', e.message));
  }
  return events;
}

// ── Main Loop ────────────────────────────────────────────────

async function pollSolana(): Promise<void> {
  try {
    const events = await fetchRecentJupiterSwaps();
    processedCount += events.length;
    if (events.length > 0) {
      addLog(makeLog('solana-indexer', 'poll', 'success', `Found ${events.length} Jupiter swaps`));
    }
  } catch (e: any) {
    addLog(makeLog('solana-indexer', 'poll', 'failure', e.message));
  }
}

export function startSolanaIndexer(intervalMs = 20000): void {
  if (running) return;
  running = true;
  updateComponent('solana-indexer', { status: 'DEPLOYING' });
  addLog(makeLog('solana-indexer', 'start', 'info', 'Starting Solana trade indexer'));

  pollTimer = setInterval(pollSolana, intervalMs);
  setTimeout(() => {
    pollSolana().then(() => {
      updateComponent('solana-indexer', { status: 'DEPLOYED', lastDeployment: Date.now() });
    }).catch(() => {
      updateComponent('solana-indexer', { status: 'FAILED', lastError: 'Initial poll failed' });
    });
  }, 3000);
}

export function stopSolanaIndexer(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  running = false;
  updateComponent('solana-indexer', { status: 'NOT_BUILT' });
  addLog(makeLog('solana-indexer', 'stop', 'info', 'Solana indexer stopped'));
}

export function getSolanaIndexerStats() {
  return { running, processedCount, lastSignature, knownPrograms: Object.keys(DEX_PROGRAMS).length };
}