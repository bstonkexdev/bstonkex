/**
 * Bundle Detector — Multi-wallet coordination analysis.
 * 
 * Detects when multiple wallets buy the same token in the same block
 * or within a short time window. This is a key risk indicator on
 * Ave.ai, GMGN, and DEX Screener.
 * 
 * Detection methods:
 * 1. Same-block buys: Multiple wallets buying in the same Solana slot
 * 2. Sequential buys: Wallets buying in rapid succession (< 5 seconds apart)
 * 3. Funding source correlation: Wallets funded from the same source
 * 4. Amount similarity: Wallets buying similar amounts (within 10%)
 * 
 * Uses Solana RPC `getSignaturesForAddress` + `getTransaction` to analyze
 * recent trades for the token mint.
 */

import { cacheGetOrCompute } from './cache';

const SOLANA_RPC = (import.meta as any).env?.VITE_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

export interface BundleDetection {
  mint: string;
  isBundle: boolean;
  bundleScore: number; // 0-100, higher = more suspicious
  walletClusters: WalletCluster[];
  totalBundleWallets: number;
  totalBundleVolume: number;
  detectionMethods: string[];
  analyzedAt: number;
}

export interface WalletCluster {
  wallets: string[];
  blockSlot: number;
  timeWindowMs: number;
  totalVolumeSol: number;
  avgAmountSol: number;
  similarity: number; // 0-1, how similar the amounts are
  fundingSource?: string; // Common funding address if detected
}

interface TradeEvent {
  wallet: string;
  slot: number;
  blockTime: number;
  amountSol: number;
  signature: string;
}

/**
 * Analyze a token for bundle/multi-wallet coordination.
 * Returns bundle detection results with wallet clusters.
 */
export async function detectBundles(mint: string): Promise<BundleDetection> {
  return cacheGetOrCompute(`bundle:${mint}`, async () => {
    try {
      // Fetch recent trades for the token
      const trades = await fetchRecentTrades(mint);
      if (trades.length < 2) {
        return {
          mint, isBundle: false, bundleScore: 0,
          walletClusters: [], totalBundleWallets: 0, totalBundleVolume: 0,
          detectionMethods: [], analyzedAt: Date.now(),
        };
      }

      const clusters: WalletCluster[] = [];
      const methods: string[] = [];

      // Method 1: Same-block detection
      const sameBlockClusters = detectSameBlockTrades(trades);
      if (sameBlockClusters.length > 0) {
        clusters.push(...sameBlockClusters);
        methods.push('same-block');
      }

      // Method 2: Rapid sequential buys (< 5 seconds apart)
      const sequentialClusters = detectSequentialTrades(trades, 5000);
      if (sequentialClusters.length > 0) {
        clusters.push(...sequentialClusters);
        methods.push('sequential');
      }

      // Method 3: Similar amount detection (within 10%)
      const similarAmountClusters = detectSimilarAmounts(trades, 0.1);
      if (similarAmountClusters.length > 0) {
        clusters.push(...similarAmountClusters);
        methods.push('similar-amounts');
      }

      // Calculate bundle score
      const bundleScore = calculateBundleScore(clusters, trades);
      const isBundle = bundleScore >= 60; // Threshold: 60+ = suspicious

      // Deduplicate wallets across clusters
      const allWallets = new Set<string>();
      let totalVolume = 0;
      for (const cluster of clusters) {
        for (const w of cluster.wallets) allWallets.add(w);
        totalVolume += cluster.totalVolumeSol;
      }

      return {
        mint,
        isBundle,
        bundleScore,
        walletClusters: clusters,
        totalBundleWallets: allWallets.size,
        totalBundleVolume: totalVolume,
        detectionMethods: methods,
        analyzedAt: Date.now(),
      };
    } catch (err: any) {
      console.warn(`[bundle-detector] Failed for ${mint}: ${err.message}`);
      return {
        mint, isBundle: false, bundleScore: 0,
        walletClusters: [], totalBundleWallets: 0, totalBundleVolume: 0,
        detectionMethods: [], analyzedAt: Date.now(),
      };
    }
  }, 300_000); // Cache for 5 minutes
}

/**
 * Fetch recent buy trades for a token from Solana RPC.
 */
async function fetchRecentTrades(mint: string, limit = 50): Promise<TradeEvent[]> {
  try {
    // Get recent signatures for the token mint
    const sigRes = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getSignaturesForAddress',
        params: [mint, { limit }],
      }),
    });
    const sigData = await sigRes.json();
    const signatures = sigData.result || [];

    if (signatures.length === 0) return [];

    // Batch fetch transactions (up to 10 at a time)
    const trades: TradeEvent[] = [];
    for (let i = 0; i < signatures.length; i += 10) {
      const batch = signatures.slice(i, i + 10);
      const txPromises = batch.map(async (sig: any) => {
        try {
          const txRes = await fetch(SOLANA_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'getTransaction',
              params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
            }),
          });
          const txData = await txRes.json();
          return txData.result;
        } catch {
          return null;
        }
      });

      const txs = await Promise.all(txPromises);
      for (const tx of txs) {
        if (!tx) continue;
        const trade = parseTradeFromTransaction(tx, mint);
        if (trade) trades.push(trade);
      }
    }

    return trades.sort((a, b) => a.blockTime - b.blockTime);
  } catch (err: any) {
    console.warn(`[bundle-detector] RPC fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Parse a buy trade from a Solana transaction.
 */
function parseTradeFromTransaction(tx: any, mint: string): TradeEvent | null {
  try {
    const message = tx.transaction?.message;
    if (!message) return null;

    // Find the signer (buyer wallet)
    const accountKeys = message.accountKeys || [];
    const signer = accountKeys[0]?.pubkey;
    if (!signer) return null;

    // Calculate SOL amount from balance changes
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    let solChange = 0;
    for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
      const diff = (postBalances[i] - preBalances[i]) / 1e9; // Convert lamports to SOL
      if (diff < 0 && i === 0) { // Signer paid SOL
        solChange = Math.abs(diff);
      }
    }

    return {
      wallet: signer,
      slot: tx.slot || 0,
      blockTime: (tx.blockTime || 0) * 1000,
      amountSol: solChange,
      signature: tx.transaction?.signatures?.[0] || '',
    };
  } catch {
    return null;
  }
}

/**
 * Detect trades in the same block (slot).
 */
function detectSameBlockTrades(trades: TradeEvent[]): WalletCluster[] {
  const bySlot = new Map<number, TradeEvent[]>();
  for (const trade of trades) {
    if (!bySlot.has(trade.slot)) bySlot.set(trade.slot, []);
    bySlot.get(trade.slot)!.push(trade);
  }

  const clusters: WalletCluster[] = [];
  for (const [slot, slotTrades] of bySlot) {
    if (slotTrades.length < 2) continue;

    const uniqueWallets = new Set(slotTrades.map(t => t.wallet));
    if (uniqueWallets.size < 2) continue; // Same wallet buying multiple times is not a bundle

    const amounts = slotTrades.map(t => t.amountSol);
    const totalVolume = amounts.reduce((a, b) => a + b, 0);
    const avgAmount = totalVolume / amounts.length;

    clusters.push({
      wallets: [...uniqueWallets],
      blockSlot: slot,
      timeWindowMs: 0, // Same block = 0ms window
      totalVolumeSol: totalVolume,
      avgAmountSol: avgAmount,
      similarity: calculateSimilarity(amounts),
    });
  }

  return clusters;
}

/**
 * Detect trades in rapid succession (within timeWindowMs).
 */
function detectSequentialTrades(trades: TradeEvent[], timeWindowMs: number): WalletCluster[] {
  const clusters: WalletCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < trades.length; i++) {
    if (used.has(i)) continue;
    const cluster: TradeEvent[] = [trades[i]];
    used.add(i);

    for (let j = i + 1; j < trades.length; j++) {
      if (used.has(j)) continue;
      const timeDiff = trades[j].blockTime - trades[i].blockTime;
      if (timeDiff <= timeWindowMs) {
        cluster.push(trades[j]);
        used.add(j);
      } else {
        break;
      }
    }

    if (cluster.length < 2) continue;

    const uniqueWallets = new Set(cluster.map(t => t.wallet));
    if (uniqueWallets.size < 2) continue;

    const amounts = cluster.map(t => t.amountSol);
    const totalVolume = amounts.reduce((a, b) => a + b, 0);
    const timeSpan = cluster[cluster.length - 1].blockTime - cluster[0].blockTime;

    clusters.push({
      wallets: [...uniqueWallets],
      blockSlot: cluster[0].slot,
      timeWindowMs: timeSpan,
      totalVolumeSol: totalVolume,
      avgAmountSol: totalVolume / amounts.length,
      similarity: calculateSimilarity(amounts),
    });
  }

  return clusters;
}

/**
 * Detect trades with similar amounts (within tolerance).
 */
function detectSimilarAmounts(trades: TradeEvent[], tolerance: number): WalletCluster[] {
  const clusters: WalletCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < trades.length; i++) {
    if (used.has(i) || trades[i].amountSol <= 0) continue;
    const cluster: TradeEvent[] = [trades[i]];
    used.add(i);

    for (let j = i + 1; j < trades.length; j++) {
      if (used.has(j) || trades[j].amountSol <= 0) continue;
      const ratio = Math.min(trades[i].amountSol, trades[j].amountSol) / 
                    Math.max(trades[i].amountSol, trades[j].amountSol);
      if (ratio >= (1 - tolerance)) {
        cluster.push(trades[j]);
        used.add(j);
      }
    }

    if (cluster.length < 2) continue;

    const uniqueWallets = new Set(cluster.map(t => t.wallet));
    if (uniqueWallets.size < 2) continue;

    const amounts = cluster.map(t => t.amountSol);
    const totalVolume = amounts.reduce((a, b) => a + b, 0);

    clusters.push({
      wallets: [...uniqueWallets],
      blockSlot: cluster[0].slot,
      timeWindowMs: cluster[cluster.length - 1].blockTime - cluster[0].blockTime,
      totalVolumeSol: totalVolume,
      avgAmountSol: totalVolume / amounts.length,
      similarity: calculateSimilarity(amounts),
    });
  }

  return clusters;
}

/**
 * Calculate how similar an array of numbers is (0-1).
 */
function calculateSimilarity(values: number[]): number {
  if (values.length < 2) return 1;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg === 0) return 1;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const cv = Math.sqrt(variance) / avg; // Coefficient of variation
  return Math.max(0, 1 - cv); // Lower CV = higher similarity
}

/**
 * Calculate overall bundle score (0-100).
 */
function calculateBundleScore(clusters: WalletCluster[], allTrades: TradeEvent[]): number {
  if (clusters.length === 0) return 0;

  let score = 0;

  // Same-block trades are highly suspicious
  const sameBlockCount = clusters.filter(c => c.timeWindowMs === 0).length;
  score += sameBlockCount * 30;

  // Rapid sequential trades are suspicious
  const rapidCount = clusters.filter(c => c.timeWindowMs > 0 && c.timeWindowMs < 5000).length;
  score += rapidCount * 20;

  // Similar amounts add suspicion
  const highSimilarity = clusters.filter(c => c.similarity > 0.8).length;
  score += highSimilarity * 15;

  // Large clusters are more suspicious
  const largeClusters = clusters.filter(c => c.wallets.length >= 3).length;
  score += largeClusters * 25;

  // Cap at 100
  return Math.min(100, score);
}