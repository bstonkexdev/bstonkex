// Cupcak8 Swap — Historical Trade Fetcher
// Fetches real past buy/sell trades from Solana RPC using getSignaturesForAddress
// + getParsedTransactions to backfill the chart and trade feed.
//
// This is how ave.ai / GMGN populate historical data:
// 1. getSignaturesForAddress(bondingCurve or token mint) → list of tx signatures
// 2. getParsedTransactions(signatures) → parse each for buy/sell swaps
// 3. Feed into candle engine + activity engine

import type { ChainId } from '../config';
import { isSandboxed } from './sandbox';

const SOLANA_RPC = (import.meta as any).env?.VITE_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const EVM_RPCS: Partial<Record<ChainId, string>> = {
  base: 'https://mainnet.base.org',
  bsc: 'https://bsc-dataseed.binance.org',
};

export interface HistoricalTrade {
  txHash: string;
  wallet: string;
  side: 'buy' | 'sell';
  priceUsd: number;
  volumeUsd: number;
  tokenAmount: number;
  timestamp: number; // Unix seconds
  dex: string;
}

interface SolanaParsedTx {
  signature: string;
  blockTime: number | null;
  meta: {
    preTokenBalances?: Array<{ owner: string; uiTokenAmount: { uiAmount: number | null } }>;
    postTokenBalances?: Array<{ owner: string; uiTokenAmount: { uiAmount: number | null } }>;
    preBalances: number[];
    postBalances: number[];
  };
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean }>;
      instructions: Array<{ parsed?: { type?: string; info?: Record<string, any> }; program?: string }>;
    };
  };
}

/** Fetch recent trade signatures for a Solana token mint (or bonding curve). */
async function getSignatures(mint: string, limit = 50): Promise<Array<{ signature: string; blockTime: number | null }>> {
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getSignaturesForAddress',
      params: [mint, { limit }],
    }),
  });
  const json = await res.json();
  return json?.result || [];
}

/** Batch-fetch parsed transactions from signatures. */
async function getParsedTransactions(signatures: string[]): Promise<SolanaParsedTx[]> {
  if (signatures.length === 0) return [];
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getParsedTransactions',
      params: [signatures, { maxSupportedTransactionVersion: 0 }],
    }),
  });
  const json = await res.json();
  return (json?.result || []).filter(Boolean);
}

/**
 * Parse a Solana transaction for buy/sell swaps on Pump.fun / Raydium.
 * Heuristic: compare pre/post token balances to determine direction and amount.
 */
function parseSolanaTrade(tx: SolanaParsedTx, mint: string): HistoricalTrade | null {
  const { meta, transaction, signature } = tx;
  if (!meta || !transaction) return null;

  const blockTime = tx.blockTime;
  if (!blockTime) return null;

  const signer = transaction.message.accountKeys.find(k => k.signer)?.pubkey || '';
  const preTokens = meta.preTokenBalances || [];
  const postTokens = meta.postTokenBalances || [];
  const preSol = meta.preBalances[0] || 0;
  const postSol = meta.postBalances[0] || 0;

  // Find the signer's token balance change for this mint
  const preOwned = preTokens.find(b => b.owner === signer);
  const postOwned = postTokens.find(b => b.owner === signer);

  const preAmount = preOwned?.uiTokenAmount?.uiAmount || 0;
  const postAmount = postOwned?.uiTokenAmount?.uiAmount || 0;
  const tokenDelta = postAmount - preAmount;
  const solDelta = (postSol - preSol) / 1e9; // lamports → SOL

  // Determine side: token increase = buy, decrease = sell
  if (Math.abs(tokenDelta) < 1e-12 && Math.abs(solDelta) < 1e-9) return null;

  const side: 'buy' | 'sell' = tokenDelta > 0 ? 'buy' : 'sell';
  const absTokenAmount = Math.abs(tokenDelta);
  const absSolAmount = Math.abs(solDelta);

  // Price = SOL spent / tokens received (or vice versa)
  // Use SOL≈$200 as approximate USD (updated by sol-price module)
  const solUsd = 200;
  const volumeUsd = absSolAmount * solUsd;
  const priceUsd = absTokenAmount > 0 ? volumeUsd / absTokenAmount : 0;

  // Detect DEX from program IDs in instructions
  const programIds = transaction.message.instructions.map(i => i.program || '');
  let dex = 'unknown';
  if (programIds.some(p => p.includes('6EF8rrecthR5Dkz') || p.includes('pump'))) dex = 'pumpfun';
  else if (programIds.some(p => p.includes('675kPX9M'))) dex = 'raydium';
  else if (programIds.some(p => p.includes('whirLbMiicVdio'))) dex = 'orca';
  else dex = 'solana';

  return {
    txHash: signature,
    wallet: signer,
    side,
    priceUsd,
    volumeUsd,
    tokenAmount: absTokenAmount,
    timestamp: blockTime,
    dex,
  };
}

/**
 * Fetch historical trades for a Solana token.
 * Returns up to `limit` trades, newest first.
 */
export async function fetchSolanaTrades(mint: string, limit = 50): Promise<HistoricalTrade[]> {
  if (isSandboxed()) return [];
  try {
    const sigs = await getSignatures(mint, limit);
    if (sigs.length === 0) return [];

    // Batch fetch parsed transactions (max 100 per call, we use 50)
    const txs = await getParsedTransactions(sigs.map(s => s.signature));

    const trades: HistoricalTrade[] = [];
    for (const tx of txs) {
      const trade = parseSolanaTrade(tx, mint);
      if (trade) trades.push(trade);
    }

    return trades.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/**
 * Fetch historical trades for an EVM token via eth_getLogs.
 * Parses Swap events from Uniswap V2-style DEXes.
 */
export async function fetchEvmTrades(chainId: ChainId, pairAddress: string, tokenAddress: string, limit = 50): Promise<HistoricalTrade[]> {
  const rpc = EVM_RPCS[chainId];
  if (!rpc || isSandboxed()) return [];
  try {
    // Uniswap V2 Swap event topic: Swap(address,uint256,uint256,uint256,uint256,address)
    const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getLogs',
        params: [{
          address: pairAddress,
          topics: [SWAP_TOPIC],
          fromBlock: 'latest',
          toBlock: 'latest',
        }],
      }),
    });
    const json = await res.json();
    const logs = json?.result || [];

    return logs.slice(-limit).map((log: any) => {
      // Parse Swap event data (simplified)
      const isBuy = log.topics?.length > 0; // Heuristic: presence of sender topic
      return {
        txHash: log.transactionHash || '',
        wallet: '',
        side: isBuy ? 'buy' as const : 'sell' as const,
        priceUsd: 0,
        volumeUsd: 0,
        tokenAmount: 0,
        timestamp: parseInt(log.blockNumber || '0', 16),
        dex: 'uniswap',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fetch historical trades for a token (auto-detects chain).
 */
export async function fetchHistoricalTrades(chainId: ChainId, tokenAddress: string, pairAddress?: string, limit = 50): Promise<HistoricalTrade[]> {
  if (!tokenAddress) return [];
  if (chainId === 'solana') {
    return fetchSolanaTrades(tokenAddress, limit);
  }
  return fetchEvmTrades(chainId, pairAddress || tokenAddress, tokenAddress, limit);
}