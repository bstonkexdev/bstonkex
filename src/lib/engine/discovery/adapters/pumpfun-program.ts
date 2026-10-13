// Cupcak8 Swap — Pump.fun Discovery Adapter (Solana)
// Discovers new tokens by scanning Pump.fun program transactions.
// Program ID: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
// Verified: real tx at slot 454680764 with mint + creator.
import type { ChainId } from '../../../config';
import type { DiscoveryAdapter, DiscoveryCursor, DiscoveryScanResult, AdapterHealth, TokenIndexRecord } from '../types';

const PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SIGNATURE_BATCH = 50;
const CONCURRENCY = 5; // Parallel getTransaction calls

interface PumpFunTx {
  signature: string;
  slot: number;
  timestamp: number | null;
  mint: string | null;
  creator: string | null;
}

async function getSignatures(before?: string): Promise<any[]> {
  const resp = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getSignaturesForAddress',
      params: [PROGRAM_ID, { limit: SIGNATURE_BATCH, ...(before ? { before } : {}), commitment: 'confirmed' }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();
  return data.result || [];
}

async function getTransaction(signature: string): Promise<PumpFunTx | null> {
  const resp = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getTransaction',
      params: [signature, {
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();
  const tx = data.result;
  if (!tx) return null;

  const message = tx.transaction?.message;
  const accountKeys = message?.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];
  const instructions = message?.instructions || [];

  // Find Pump.fun create instruction — look for inner instruction that creates a token
  // Pump.fun's create instruction has the program as programId and creates an SPL mint
  // The fee payer is the creator
  const creator = accountKeys[0] || null;

  // Look for a mint account (usually an account that's a signer and writable, not the fee payer)
  // Pump.fun create_token: accounts[0] = mint (signer)
  let mint: string | null = null;
  for (const ix of instructions) {
    if (ix.programId === PROGRAM_ID && ix.accounts && ix.accounts.length > 0) {
      // First account in create instruction is typically the mint
      const mintIdx = ix.accounts[0];
      if (typeof mintIdx === 'number' && accountKeys[mintIdx]) {
        mint = accountKeys[mintIdx];
      }
      break;
    }
  }

  // Also check parsed inner instructions for TokenProgram mintTo
  if (!mint) {
    const inner = tx.meta?.innerInstructions || [];
    for (const group of inner) {
      for (const ix of group.instructions || []) {
        if (ix.program === 'spl-token' && ix.parsed?.type === 'initializeMint') {
          mint = ix.parsed.info?.mint || null;
          if (mint) break;
        }
      }
      if (mint) break;
    }
  }

  return {
    signature,
    slot: tx.slot,
    timestamp: tx.blockTime ? tx.blockTime * 1000 : null,
    mint,
    creator,
  };
}

export function createPumpFunAdapter(): DiscoveryAdapter {
  let health: AdapterHealth = {
    adapterId: 'pumpfun-solana',
    status: 'active',
    lastSuccessAt: null, lastErrorAt: null, lastError: null,
    tokensDiscovered: 0, cursorPosition: null, latencyMs: null,
  };

  return {
    id: 'pumpfun-solana',
    launchpadId: 'pumpfun',
    launchpadName: 'Pump.fun',
    chainId: 'solana' as ChainId,
    method: 'solana_program',

    async scan(cursor: DiscoveryCursor): Promise<DiscoveryScanResult> {
      const errors: string[] = [];
      const tokens: Partial<TokenIndexRecord>[] = [];

      try {
        // Get recent signatures (reverse-chronological from RPC)
        const sigs = await getSignatures();
        if (!sigs.length) return { tokens: [], cursor, scanned: 0, errors };

        // Process only new signatures (slot > cursor position)
        const cursorSlot = cursor.solanaSlot ?? 0;
        const newSigs = sigs.filter((s: any) => s.slot > cursorSlot);

        let maxSlot = cursorSlot;
        const toProcess = newSigs.slice(0, SIGNATURE_BATCH);

        // Concurrent batch processing — CONCURRENCY parallel getTransaction calls
        for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
          const batch = toProcess.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map(sigInfo => getTransaction(sigInfo.signature))
          );
          for (let j = 0; j < results.length; j++) {
            const r = results[j];
            if (r.status === 'fulfilled' && r.value) {
              const tx = r.value;
              if (tx.mint && tx.slot > cursorSlot) {
                tokens.push({
                  chainId: 'solana' as ChainId,
                  address: tx.mint,
                  launchpadId: 'pumpfun',
                  launchpadName: 'Pump.fun',
                  creator: tx.creator,
                  launchTimestamp: tx.timestamp ?? Date.now(),
                  blockNumber: null,
                  solanaSlot: tx.slot,
                  sourceTxHash: tx.signature,
                  sourceLogIndex: 0,
                  discoverySource: 'solana_program',
                  discoveryStatus: 'verified',
                  marketDataStatus: 'awaiting',
                  name: null, symbol: null, icon: null,
                });
                if (tx.slot > maxSlot) maxSlot = tx.slot;
              }
            } else if (r.status === 'rejected') {
              errors.push(`tx parse failed: ${r.reason?.message || 'unknown'}`);
            }
          }
        }

        health = {
          ...health,
          lastSuccessAt: Date.now(),
          cursorPosition: `slot ${maxSlot}`,
          tokensDiscovered: health.tokensDiscovered + tokens.length,
        };

        return {
          tokens,
          cursor: { ...cursor, solanaSlot: maxSlot, lastRunAt: Date.now(), lastSuccessAt: Date.now() },
          scanned: newSigs.length,
          errors,
        };
      } catch (e: any) {
        errors.push(`Scan failed: ${e.message}`);
        health = { ...health, lastErrorAt: Date.now(), lastError: e.message, status: 'error' };
        return { tokens: [], cursor, scanned: 0, errors };
      }
    },

    getHealth(): AdapterHealth {
      return health;
    },
  };
}
