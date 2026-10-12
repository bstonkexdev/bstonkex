// Cupcak8 Swap Indexer — EVM Chain Adapter
// Real RPC calls to BSC / Base / Robinhood. No mocks.
// Handles block range limits (Base: 500, BSC: provider-dependent).

import type { ChainAdapter, RawBlock, RawLog, ChainConfig } from './chain-adapter';
import type { ChainId } from './types';

const DEFAULT_MAX_BLOCK_RANGE = 500; // Safe default for most providers

export function createEvmAdapter(config: ChainConfig): ChainAdapter {
  let currentRpcIndex = 0;
  const maxRange = config.maxBlockRange ?? DEFAULT_MAX_BLOCK_RANGE;

  async function rpc(method: string, params: unknown[]): Promise<any> {
    const numUrls = config.rpcUrls.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < numUrls; attempt++) {
      const url = config.rpcUrls[(currentRpcIndex + attempt) % numUrls];
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          lastError = new Error(`RPC ${res.status} from ${url}`);
          currentRpcIndex = (currentRpcIndex + attempt + 1) % numUrls;
          continue; // try next fallback
        }
        const data = await res.json();
        if (data.error) {
          const errMsg = data.error.message || '';
          lastError = new Error(errMsg || 'RPC error');
          if (errMsg.includes('limit exceeded') || errMsg.includes('500 range') || errMsg.includes('rate')) {
            currentRpcIndex = (currentRpcIndex + attempt + 1) % numUrls;
            continue; // try next fallback
          }
          // Non-retryable error
          throw lastError;
        }
        return data.result;
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('Failed to fetch')) {
          lastError = err;
          currentRpcIndex = (currentRpcIndex + attempt + 1) % numUrls;
          continue; // try next fallback
        }
        throw err; // non-network error, don't retry
      }
    }
    // All fallbacks exhausted
    throw lastError || new Error(`All RPC endpoints failed for ${config.chainId}`);
  }

  /** Fetch logs with automatic chunking for range-limited RPCs */
  async function getLogsChunked(
    fromBlock: number, toBlock: number, addresses: string[], topics: string[][],
  ): Promise<RawLog[]> {
    if (maxRange > 0 && (toBlock - fromBlock) > maxRange) {
      // Chunk the request
      const allLogs: RawLog[] = [];
      let current = fromBlock;
      while (current <= toBlock) {
        const chunkEnd = Math.min(current + maxRange - 1, toBlock);
        try {
          const logs = await fetchLogsSingle(current, chunkEnd, addresses, topics);
          allLogs.push(...logs);
        } catch {
          // If chunk fails, try smaller chunks
          const halfRange = Math.floor((chunkEnd - current) / 2);
          if (halfRange < 1) continue; // skip this block
          const mid = current + halfRange;
          try {
            const logs1 = await fetchLogsSingle(current, mid, addresses, topics);
            allLogs.push(...logs1);
          } catch { /* skip */ }
          try {
            const logs2 = await fetchLogsSingle(mid + 1, chunkEnd, addresses, topics);
            allLogs.push(...logs2);
          } catch { /* skip */ }
        }
        current = chunkEnd + 1;
      }
      return allLogs;
    }
    return fetchLogsSingle(fromBlock, toBlock, addresses, topics);
  }

  async function fetchLogsSingle(
    fromBlock: number, toBlock: number, addresses: string[], topics: string[][],
  ): Promise<RawLog[]> {
    const logs = await rpc('eth_getLogs', [{
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      address: addresses,
      topics: topics.length === 1 ? topics[0] : topics,
    }]);
    if (!Array.isArray(logs)) return [];
    return logs.map((l: any) => ({
      address: l.address.toLowerCase(),
      topics: l.topics,
      data: l.data,
      blockNumber: parseInt(l.blockNumber, 16),
      blockHash: l.blockHash,
      transactionHash: l.transactionHash,
      logIndex: parseInt(l.logIndex, 16),
      timestamp: 0, // filled from block
    }));
  }

  return {
    chainId: config.chainId as ChainId,
    isEvm: true,

    async getLatestBlock(): Promise<number> {
      const hex = await rpc('eth_blockNumber', []);
      return parseInt(hex, 16);
    },

    async getBlock(blockNumber: number): Promise<RawBlock | null> {
      try {
        const block = await rpc('eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, false]);
        if (!block) return null;
        return {
          number: parseInt(block.number, 16),
          hash: block.hash,
          parentHash: block.parentHash,
          timestamp: parseInt(block.timestamp, 16),
        };
      } catch { return null; }
    },

    async getLogs(fromBlock: number, toBlock: number, addresses: string[], topics: string[][]): Promise<RawLog[]> {
      return getLogsChunked(fromBlock, toBlock, addresses, topics);
    },

    getRpcEndpoint(): string {
      return config.rpcUrls[0].replace(/\/\/.*@/, '//***@');
    },

    async healthCheck(): Promise<number> {
      const start = Date.now();
      try { await rpc('eth_blockNumber', []); return Date.now() - start; }
      catch { return -1; }
    },
  };
}
