// BSTONKEX Data Normalizer — Transforms chain-specific data into unified formats
// EVM logs, Solana transactions → normalized MarketEvent/TradeEvent/CandleEvent

import type { ChainId } from '../config';

// ── Unified Event Types ──────────────────────────────────────

export interface NormalizedTrade {
  id: string;
  chainId: ChainId;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  pair: { base: string; quote: string; baseAddress: string; quoteAddress: string };
  side: 'buy' | 'sell';
  priceUsd: number;
  amountUsd: number;
  amountBase: number;
  amountQuote: number;
  maker: string;
  dex: string;
  feeUsd: number;
}

export interface NormalizedLiquidity {
  id: string;
  chainId: ChainId;
  txHash: string;
  timestamp: number;
  type: 'add' | 'remove';
  pair: { base: string; quote: string; baseAddress: string; quoteAddress: string };
  amountBase: number;
  amountQuote: number;
  amountUsd: number;
  provider: string;
  dex: string;
}

export interface NormalizedTokenMeta {
  chainId: ChainId;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: string | null;
  logoUrl: string | null;
  website: string | null;
  verified: boolean;
  tags: string[];
}

export interface NormalizedPool {
  chainId: ChainId;
  address: string;
  dex: string;
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  liquidityUsd: number;
  volume24h: number;
  priceUsd: number;
  priceChange24h: number;
  createdAt: number;
}

// ── EVM Log Decoders ─────────────────────────────────────────

// Uniswap V2 Swap event signature
const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
// Uniswap V2 Sync event (reserves update)
const SYNC_TOPIC = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1';
// Transfer event
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// PairCreated (Uniswap V2 Factory)
const PAIR_CREATED_TOPIC = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';

export function decodeEvmSwapLog(log: { topics: string[]; data: string; address: string }): {
  amount0In: bigint; amount1In: bigint; amount0Out: bigint; amount1Out: bigint;
} | null {
  try {
    if (log.topics[0] !== SWAP_TOPIC) return null;
    // data: 4 x uint256 = 128 bytes
    const data = log.data.slice(2); // remove 0x
    if (data.length < 256) return null;
    return {
      amount0In: BigInt('0x' + data.slice(0, 64)),
      amount1In: BigInt('0x' + data.slice(64, 128)),
      amount0Out: BigInt('0x' + data.slice(128, 192)),
      amount1Out: BigInt('0x' + data.slice(192, 256)),
    };
  } catch { return null; }
}

export function decodeEvmTransferLog(log: { topics: string[]; data: string }): {
  from: string; to: string; value: bigint;
} | null {
  try {
    if (log.topics[0] !== TRANSFER_TOPIC) return null;
    if (log.topics.length < 3) return null;
    return {
      from: '0x' + log.topics[1].slice(26),
      to: '0x' + log.topics[2].slice(26),
      value: BigInt(log.data),
    };
  } catch { return null; }
}

// ── Normalizers ──────────────────────────────────────────────

export function normalizeDexScreenerTrade(raw: any, chainId: ChainId): NormalizedTrade | null {
  try {
    if (!raw || !raw.txHash) return null;
    return {
      id: `${chainId}:${raw.txHash}:${raw.logIndex || 0}`,
      chainId,
      txHash: raw.txHash,
      blockNumber: raw.blockNumber || 0,
      timestamp: raw.timestamp || Date.now(),
      pair: {
        base: raw.baseToken?.symbol || '???',
        quote: raw.quoteToken?.symbol || '???',
        baseAddress: raw.baseToken?.address || '',
        quoteAddress: raw.quoteToken?.address || '',
      },
      side: raw.side || 'buy',
      priceUsd: raw.priceUsd || 0,
      amountUsd: raw.amountUsd || 0,
      amountBase: raw.amountBase || 0,
      amountQuote: raw.amountQuote || 0,
      maker: raw.maker || '',
      dex: raw.dex || 'unknown',
      feeUsd: raw.feeUsd || 0,
    };
  } catch { return null; }
}

export function normalizeDexScreenerPool(raw: any, chainId: ChainId): NormalizedPool | null {
  try {
    if (!raw || !raw.pairAddress) return null;
    return {
      chainId,
      address: raw.pairAddress,
      dex: raw.dexId || 'unknown',
      baseToken: { address: raw.baseToken?.address || '', symbol: raw.baseToken?.symbol || '???' },
      quoteToken: { address: raw.quoteToken?.address || '', symbol: raw.quoteToken?.symbol || '???' },
      liquidityUsd: raw.liquidity?.usd || 0,
      volume24h: raw.volume?.h24 || 0,
      priceUsd: parseFloat(raw.priceUsd || '0'),
      priceChange24h: raw.priceChange?.h24 || 0,
      createdAt: raw.pairCreatedAt || Date.now(),
    };
  } catch { return null; }
}

export function normalizeDexScreenerToken(raw: any, chainId: ChainId): NormalizedTokenMeta | null {
  try {
    if (!raw || !raw.address) return null;
    return {
      chainId,
      address: raw.address,
      symbol: raw.symbol || '???',
      name: raw.name || 'Unknown',
      decimals: raw.decimals || 18,
      totalSupply: raw.totalSupply || null,
      logoUrl: raw.info?.imageUrl || null,
      website: raw.info?.websites?.[0]?.url || null,
      verified: !!raw.info?.verified,
      tags: raw.tags || [],
    };
  } catch { return null; }
}

// ── Solana Normalizers ───────────────────────────────────────

export function normalizeSolanaSwap(tx: any): NormalizedTrade | null {
  try {
    if (!tx || !tx.signature) return null;
    return {
      id: `solana:${tx.signature}:${tx.innerIndex || 0}`,
      chainId: 'solana',
      txHash: tx.signature,
      blockNumber: tx.slot || 0,
      timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
      pair: {
        base: tx.baseSymbol || '???',
        quote: tx.quoteSymbol || 'SOL',
        baseAddress: tx.baseMint || '',
        quoteAddress: tx.quoteMint || '',
      },
      side: tx.side || 'buy',
      priceUsd: tx.priceUsd || 0,
      amountUsd: tx.amountUsd || 0,
      amountBase: tx.amountBase || 0,
      amountQuote: tx.amountQuote || 0,
      maker: tx.user || '',
      dex: tx.dex || 'raydium',
      feeUsd: tx.feeUsd || 0,
    };
  } catch { return null; }
}

// ── Batch Normalizer ─────────────────────────────────────────

export function normalizeTrades(rawEvents: any[], chainId: ChainId): NormalizedTrade[] {
  const normalized: NormalizedTrade[] = [];
  for (const raw of rawEvents) {
    const trade = chainId === 'solana'
      ? normalizeSolanaSwap(raw)
      : normalizeDexScreenerTrade(raw, chainId);
    if (trade) normalized.push(trade);
  }
  return normalized;
}

export function normalizePools(rawPools: any[], chainId: ChainId): NormalizedPool[] {
  return rawPools.map(r => normalizeDexScreenerPool(r, chainId)).filter(Boolean) as NormalizedPool[];
}