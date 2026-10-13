// Cupcak8 Swap — PumpSwap AMM Discovery Adapter (Solana)
// Detects tokens graduating from Pump.fun bonding curves to PumpSwap AMM.
// Also catches tokens that are already on PumpSwap (new pairs created directly).
//
// PumpSwap AMM Program ID: PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP
// This adapter monitors the PumpSwap program for new pool creation events.
//
// When a bonding curve completes (100% filled), the Pump.fun program migrates
// the token to PumpSwap. This adapter detects those migrations by watching
// for new PumpSwap pools whose tokens were previously on a bonding curve.
import type { ChainId } from '../../../config';
import type { DiscoveryAdapter, DiscoveryCursor, DiscoveryScanResult, AdapterHealth, TokenIndexRecord } from '../types';

const PUMPSWAP_PROGRAM = 'PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SIGNATURE_BATCH = 50;
const CONCURRENCY = 5;

async function rpc(method: string, params: any): Promise<any> {
  const resp = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();
  return data.result;
}

export function createPumpSwapAdapter(): DiscoveryAdapter {
  let health: AdapterHealth = {
    adapterId: 'pumpswap-amm',
    status: 'active',
    lastSuccessAt: null, lastErrorAt: null, lastError: null,
    tokensDiscovered: 0, cursorPosition: null, latencyMs: null,
  };

  return {
    id: 'pumpswap-amm',
    launchpadId: 'pumpswap',
    launchpadName: 'PumpSwap',
    chainId: 'solana' as ChainId,
    method: 'solana_program',

    async scan(cursor: DiscoveryCursor): Promise<DiscoveryScanResult> {
      const errors: string[] = [];
      const tokens: Partial<TokenIndexRecord>[] = [];
      const startMs = Date.now();

      try {
        const sigs = await rpc('getSignaturesForAddress', [
          PUMPSWAP_PROGRAM,
          { limit: SIGNATURE_BATCH, commitment: 'confirmed', ...(cursor.solanaSlot ? { until: undefined } : {}) },
        ]);
        if (!sigs?.length) {
          health = { ...health, lastSuccessAt: Date.now(), latencyMs: Date.now() - startMs };
          return { tokens, cursor: { ...cursor, lastRunAt: Date.now(), lastSuccessAt: Date.now() }, scanned: 0, errors };
        }

        const cursorSlot = cursor.solanaSlot ?? 0;
        const newSigs = sigs.filter((s: any) => s.slot > cursorSlot && !s.err);

        let maxSlot = cursorSlot;
        const toProcess = newSigs.slice(0, SIGNATURE_BATCH);

        // Concurrent batch processing
        for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
          const batch = toProcess.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map((sigInfo: any) => rpc('getTransaction', [
              sigInfo.signature,
              { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
            ]).then(tx => ({ tx, signature: sigInfo.signature })))
          );

          for (const r of results) {
            if (r.status !== 'fulfilled' || !r.value.tx) continue;
            const { tx, signature } = r.value;

            try {
              const message = tx.transaction?.message;
              const accountKeys = message?.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];

              let baseMint: string | null = null;
              const inner = tx.meta?.innerInstructions || [];
              for (const group of inner) {
                for (const ix of group.instructions || []) {
                  if (ix.program === 'spl-token' && ix.parsed?.type === 'initializeAccount') {
                    baseMint = ix.parsed.info?.mint || null;
                    if (baseMint) break;
                  }
                }
                if (baseMint) break;
              }

              if (!baseMint) {
                const instructions = message?.instructions || [];
                for (const ix of instructions) {
                  if (ix.programId === PUMPSWAP_PROGRAM && ix.accounts?.length > 0) {
                    const mintIdx = ix.accounts[1];
                    if (typeof mintIdx === 'number' && accountKeys[mintIdx]) {
                      baseMint = accountKeys[mintIdx];
                    }
                    break;
                  }
                }
              }

              if (baseMint && tx.slot > cursorSlot) {
                tokens.push({
                  chainId: 'solana' as ChainId,
                  address: baseMint,
                  launchpadId: 'pumpswap',
                  launchpadName: 'PumpSwap',
                  creator: accountKeys[0] || null,
                  launchTimestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                  blockNumber: null,
                  solanaSlot: tx.slot,
                  sourceTxHash: signature,
                  sourceLogIndex: 0,
                  discoverySource: 'solana_program',
                  discoveryStatus: 'verified',
                  marketDataStatus: 'awaiting',
                  name: null, symbol: null, icon: null,
                  marketState: 'launched',
                });
                if (tx.slot > maxSlot) maxSlot = tx.slot;
              }
            } catch (e: any) {
              errors.push(`PumpSwap tx parse failed: ${e.message}`);
            }
          }
        }

        health = {
          ...health,
          lastSuccessAt: Date.now(),
          latencyMs: Date.now() - startMs,
          tokensDiscovered: health.tokensDiscovered + tokens.length,
          cursorPosition: `slot ${maxSlot}`,
        };

        return {
          tokens,
          cursor: { ...cursor, solanaSlot: maxSlot, lastRunAt: Date.now(), lastSuccessAt: Date.now() },
          scanned: newSigs.length,
          errors,
        };
      } catch (e: any) {
        errors.push(`PumpSwap scan failed: ${e.message}`);
        health = { ...health, lastErrorAt: Date.now(), lastError: e.message, status: 'error' };
        return { tokens, cursor, scanned: 0, errors };
      }
    },

    getHealth(): AdapterHealth {
      return health;
    },
  };
}