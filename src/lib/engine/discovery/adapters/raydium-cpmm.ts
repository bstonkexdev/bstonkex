// Cupcak8 Swap — Raydium CPMM Discovery Adapter (Solana)
// Detects new pools on Raydium's Constant Product Market Maker (CPMM).
// Raydium CPMM is the primary destination for graduated memecoins on Solana.
//
// Raydium CPMM Program ID: CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C
// Also monitors legacy AMM: 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8
//
// Strategy: poll getSignaturesForAddress for the CPMM program, then parse
// new transactions to extract the base token mint from pool creation events.
import type { ChainId } from '../../../config';
import type { DiscoveryAdapter, DiscoveryCursor, DiscoveryScanResult, AdapterHealth, TokenIndexRecord } from '../types';

const RAYDIUM_CPMM_PROGRAM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SIGNATURE_BATCH = 25;

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

export function createRaydiumCpmmAdapter(): DiscoveryAdapter {
  let health: AdapterHealth = {
    adapterId: 'raydium-cpmm',
    status: 'active',
    lastSuccessAt: null, lastErrorAt: null, lastError: null,
    tokensDiscovered: 0, cursorPosition: null, latencyMs: null,
  };

  return {
    id: 'raydium-cpmm',
    launchpadId: 'raydium',
    launchpadName: 'Raydium',
    chainId: 'solana' as ChainId,
    method: 'solana_program',

    async scan(cursor: DiscoveryCursor): Promise<DiscoveryScanResult> {
      const errors: string[] = [];
      const tokens: Partial<TokenIndexRecord>[] = [];
      const startMs = Date.now();

      try {
        const sigs = await rpc('getSignaturesForAddress', [
          RAYDIUM_CPMM_PROGRAM,
          { limit: SIGNATURE_BATCH, commitment: 'confirmed' },
        ]);
        if (!sigs?.length) {
          health = { ...health, lastSuccessAt: Date.now(), latencyMs: Date.now() - startMs };
          return { tokens, cursor: { ...cursor, lastRunAt: Date.now(), lastSuccessAt: Date.now() }, scanned: 0, errors };
        }

        const cursorSlot = cursor.solanaSlot ?? 0;
        const newSigs = sigs.filter((s: any) => s.slot > cursorSlot && !s.err);

        let maxSlot = cursorSlot;
        for (const sigInfo of newSigs.slice(0, SIGNATURE_BATCH)) {
          try {
            const tx = await rpc('getTransaction', [
              sigInfo.signature,
              { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
            ]);
            if (!tx) continue;

            const message = tx.transaction?.message;
            const accountKeys = message?.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];

            // Raydium CPMM pool creation: look for SPL token mint initialization
            // or the CPMM program's initializePool instruction
            let baseMint: string | null = null;

            // Check parsed instructions for Raydium CPMM calls
            const instructions = message?.instructions || [];
            for (const ix of instructions) {
              if (ix.programId === RAYDIUM_CPMM_PROGRAM && ix.parsed?.type === 'initializePool') {
                // initializePool accounts: creator, ammConfig, poolState, tokenMint0, tokenMint1, ...
                const info = ix.parsed.info || {};
                baseMint = info.tokenMint0 || info.tokenMint1 || null;
                break;
              }
            }

            // Fallback: check inner instructions for token mint initialization
            if (!baseMint) {
              const inner = tx.meta?.innerInstructions || [];
              const seenMints = new Set<string>();
              for (const group of inner) {
                for (const ix of group.instructions || []) {
                  if (ix.program === 'spl-token' && ix.parsed?.type === 'initializeAccount') {
                    const mint = ix.parsed.info?.mint;
                    if (mint) seenMints.add(mint);
                  }
                }
              }
              // For CPMM pools, the base token is typically the first unique mint
              // (SOL/USDC are common quote tokens, so we filter them out)
              const SOL_MINT = 'So11111111111111111111111111111111111111112';
              const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
              for (const mint of seenMints) {
                if (mint !== SOL_MINT && mint !== USDC_MINT) {
                  baseMint = mint;
                  break;
                }
              }
            }

            if (baseMint && tx.slot > cursorSlot) {
              tokens.push({
                chainId: 'solana' as ChainId,
                address: baseMint,
                launchpadId: 'raydium',
                launchpadName: 'Raydium',
                creator: accountKeys[0] || null,
                launchTimestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                blockNumber: null,
                solanaSlot: tx.slot,
                sourceTxHash: sigInfo.signature,
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
            errors.push(`Raydium tx parse failed: ${e.message}`);
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
        errors.push(`Raydium scan failed: ${e.message}`);
        health = { ...health, lastErrorAt: Date.now(), lastError: e.message, status: 'error' };
        return { tokens, cursor, scanned: 0, errors };
      }
    },

    getHealth(): AdapterHealth {
      return health;
    },
  };
}