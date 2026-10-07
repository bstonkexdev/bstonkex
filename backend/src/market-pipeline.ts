/**
 * BSTONKEX Market Event Pipeline
 * 
 * Backend market data pipeline:
 * Blockchain/RPC → Chain Adapter → Indexer → Normalizer → Market Engine → WebSocket Gateway → Frontend
 * 
 * Fetches real data from DexScreener and normalizes into MarketStreamEvent format
 * compatible with the frontend's src/lib/engine/market-stream.ts.
 */

// ── Types (matches frontend MarketStreamEvent) ───────────────

export interface MarketStreamEvent {
  id: string;
  type: 'price' | 'trade' | 'volume' | 'liquidity' | 'stats';
  chainId: string;
  tokenAddress: string;
  tokenSymbol: string;
  timestamp: number;
  sequence: number;
  data: Record<string, unknown>;
}

type EventListener = (event: MarketStreamEvent) => void;

interface TokenSubscription {
  chainId: string;
  address: string;
  symbol: string;
}

// ── Chain Configuration ──────────────────────────────────────

const CHAINS: Record<string, { rpc: string; dexScreenerId: string; isEvm: boolean }> = {
  bsc: {
    rpc: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org',
    dexScreenerId: 'bsc',
    isEvm: true,
  },
  base: {
    rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    dexScreenerId: 'base',
    isEvm: true,
  },
  robinhood: {
    rpc: process.env.ROBINHOOD_RPC_URL || 'https://rpc.ankr.com/robinhood',
    dexScreenerId: 'robinhood',
    isEvm: true,
  },
  solana: {
    rpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    dexScreenerId: 'solana',
    isEvm: false,
  },
};

const DEXSCREENER_API = process.env.DEXSCREENER_API || 'https://api.dexscreener.com';

// ── Market Pipeline ──────────────────────────────────────────

export class MarketPipeline {
  private listeners: EventListener[] = [];
  private subscriptions = new Map<string, TokenSubscription>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private processedIds = new Set<string>();
  private isRunning = false;

  onEvent(cb: EventListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  addSubscription(chainId: string, address: string, symbol: string): void {
    const key = `${chainId}:${address}`;
    this.subscriptions.set(key, { chainId, address, symbol });
  }

  removeSubscription(chainId: string, address: string): void {
    this.subscriptions.delete(`${chainId}:${address}`);
  }

  start(intervalMs: number): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollTimer = setInterval(() => this.poll(), intervalMs);
    this.poll(); // Immediate first poll
    console.log(`[MarketPipeline] Started with ${intervalMs}ms interval`);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    console.log('[MarketPipeline] Stopped');
  }

  private async poll(): Promise<void> {
    if (this.subscriptions.size === 0) return;

    const tokens = [...this.subscriptions.values()];
    const now = Date.now();

    try {
      // Batch fetch from DexScreener
      const results = await Promise.allSettled(
        tokens.map(async (t) => {
          const res = await fetch(
            `${DEXSCREENER_API}/latest/dex/tokens/${t.address}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!res.ok) return null;
          const data = await res.json();
          return data.pairs?.[0] || null;
        })
      );

      for (let i = 0; i < tokens.length; i++) {
        const result = results[i];
        if (result.status !== 'fulfilled' || !result.value) continue;

        const pair = result.value;
        const token = tokens[i];
        const price = pair.priceUsd ? parseFloat(pair.priceUsd) : null;
        const change = pair.priceChange?.h24 != null ? parseFloat(pair.priceChange.h24) : null;
        const volume = pair.volume?.h24 || null;
        const liquidity = pair.liquidity?.usd || null;
        const txns = pair.txns?.h24 || {};

        // Emit price event
        if (price != null) {
          this.emit({
            id: `price:${token.chainId}:${token.address}:${now}`,
            type: 'price',
            chainId: token.chainId,
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            timestamp: now,
            sequence: ++this.sequence,
            data: { price, change24h: change, volume24h: volume, liquidity },
          });
        }

        // Emit stats event
        this.emit({
          id: `stats:${token.chainId}:${token.address}:${now}`,
          type: 'stats',
          chainId: token.chainId,
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          timestamp: now,
          sequence: ++this.sequence,
          data: {
            price, change24h: change, volume24h: volume, liquidity,
            marketCap: pair.marketCap ?? pair.fdv ?? null,
            fdv: pair.fdv ?? null,
            buys24h: txns.buys, sells24h: txns.sells,
            txns24h: (txns.buys ?? 0) + (txns.sells ?? 0),
            dexId: pair.dexId, pairAddress: pair.pairAddress,
          },
        });
      }
    } catch (err) {
      console.error('[MarketPipeline] Poll error:', err);
    }
  }

  private emit(event: MarketStreamEvent): void {
    // Dedup
    if (this.processedIds.has(event.id)) return;
    this.processedIds.add(event.id);
    
    // Trim processed IDs
    if (this.processedIds.size > 1000) {
      const arr = [...this.processedIds];
      for (let i = 0; i < 200; i++) this.processedIds.delete(arr[i]);
    }

    this.listeners.forEach(l => l(event));
  }
}

// ── RPC Health Check ─────────────────────────────────────────

export async function checkRpcHealth(chainId: string): Promise<{ status: string; block?: number; latencyMs: number }> {
  const chain = CHAINS[chainId];
  if (!chain) return { status: 'UNKNOWN', latencyMs: 0 };

  const start = Date.now();
  try {
    const method = chain.isEvm ? 'eth_blockNumber' : 'getSlot';
    const res = await fetch(chain.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params: [], id: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const latencyMs = Date.now() - start;

    if (data.result) {
      const block = chain.isEvm ? parseInt(data.result, 16) : data.result;
      return { status: 'UP', block, latencyMs };
    }
    return { status: 'DOWN', latencyMs };
  } catch {
    return { status: 'DOWN', latencyMs: Date.now() - start };
  }
}