// Cupcak8 Swap Indexer — Solana Chain Adapter
// Native Solana RPC. NOT EVM. No mocks.

import type { ChainAdapter, RawBlock, RawSolanaSignature, ChainConfig } from './chain-adapter';
import type { ChainId } from './types';

export function createSolanaAdapter(config: ChainConfig): ChainAdapter {
  let currentRpcIndex = 0;

  async function rpc(method: string, params: unknown[]): Promise<any> {
    const url = config.rpcUrls[currentRpcIndex % config.rpcUrls.length];
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { currentRpcIndex++; throw new Error(`RPC ${res.status}`); }
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  return {
    chainId: config.chainId as ChainId,
    isEvm: false,

    async getLatestBlock(): Promise<number> {
      return rpc('getSlot', [{ commitment: 'finalized' }]);
    },

    async getBlock(slot: number): Promise<RawBlock | null> {
      try {
        const block = await rpc('getBlock', [slot, {
          encoding: 'json',
          transactionDetails: 'none',
          rewards: false,
          maxSupportedTransactionVersion: 0,
        }]);
        if (!block) return null;
        return {
          number: slot,
          hash: block.blockhash,
          parentHash: block.previousBlockhash,
          timestamp: block.blockTime ?? Math.floor(Date.now() / 1000),
        };
      } catch { return null; }
    },

    async getSignatures(address: string, limit: number, before?: string): Promise<RawSolanaSignature[]> {
      const opts: any = { limit };
      if (before) opts.before = before;
      const sigs = await rpc('getSignaturesForAddress', [address, opts]);
      if (!Array.isArray(sigs)) return [];
      return sigs.map((s: any) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime,
        err: s.err,
        memo: s.memo,
      }));
    },

    async getParsedTransaction(signature: string): Promise<any> {
      return rpc('getParsedTransaction', [signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      }]);
    },

    getRpcEndpoint(): string {
      return config.rpcUrls[0].replace(/\/\/.*@/, '//***@');
    },

    async healthCheck(): Promise<number> {
      const start = Date.now();
      try { await rpc('getSlot', []); return Date.now() - start; }
      catch { return -1; }
    },
  } as ChainAdapter & { getParsedTransaction: (sig: string) => Promise<any> };
}
