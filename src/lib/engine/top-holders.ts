/**
 * Top Holders — Token holder distribution analysis.
 * 
 * Fetches the largest token holders for a given mint address using
 * Solana RPC `getTokenLargestAccounts`. This is a key metric on
 * Ave.ai, GMGN, and DEX Screener for assessing dump risk.
 * 
 * Returns:
 * - Top 20 holders by balance
 * - Concentration metrics (% held by top 5, 10, 20)
 * - Known wallet labels (CEX, DEX, team, etc.)
 */

import { cacheGetOrCompute } from './cache';

const SOLANA_RPC = (import.meta as any).env?.VITE_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

export interface HolderInfo {
  address: string;
  balance: number;
  percentage: number; // % of total supply
  label?: string; // e.g., 'Binance', 'Raydium', 'Team', 'Unknown'
  isContract: boolean;
}

export interface TopHoldersAnalysis {
  mint: string;
  holders: HolderInfo[];
  totalSupply: number;
  top5Concentration: number; // % held by top 5
  top10Concentration: number;
  top20Concentration: number;
  holderCount: number; // Total unique holders (if available)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  analyzedAt: number;
}

// Known wallet labels (common DEX/CEX addresses)
const KNOWN_WALLETS: Record<string, string> = {
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': 'Raydium Authority',
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Raydium AMM',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter Aggregator',
  '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin': 'Serum DEX',
  'A7YqJbELgS8r2pCPdMiPEjMJGqGhgvBZQ7sPq5GRYSRA': 'Binance',
  'FmhXe9uG6Cx5m3jAew8LWcM8d4mWwqC4GhKq2a2c2j9': 'OKX',
  '2ojv9BAiHUrvsm9gxDe7fJSzbNZSx5bGikH2U2t7Q4Br': 'Bybit',
};

/**
 * Analyze top holders for a token.
 */
export async function analyzeTopHolders(mint: string): Promise<TopHoldersAnalysis> {
  return cacheGetOrCompute(`holders:${mint}`, async () => {
    try {
      // Fetch largest token accounts
      const res = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'getTokenLargestAccounts',
          params: [mint],
        }),
      });
      const data = await res.json();
      const accounts = data.result?.value || [];

      if (accounts.length === 0) {
        return {
          mint, holders: [], totalSupply: 0,
          top5Concentration: 0, top10Concentration: 0, top20Concentration: 0,
          holderCount: 0, riskLevel: 'low', riskFactors: [],
          analyzedAt: Date.now(),
        };
      }

      // Get token supply for percentage calculation
      const supplyRes = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'getTokenSupply',
          params: [mint],
        }),
      });
      const supplyData = await supplyRes.json();
      const totalSupply = parseFloat(supplyData.result?.value?.uiAmountString || '0');

      // Parse holder data
      const holders: HolderInfo[] = accounts.map((acc: any) => {
        const balance = parseFloat(acc.uiAmountString || '0');
        const percentage = totalSupply > 0 ? (balance / totalSupply) * 100 : 0;
        const address = acc.address;
        const label = KNOWN_WALLETS[address];
        const isContract = !!label; // Known wallets are typically contracts/programs

        return {
          address,
          balance,
          percentage,
          label,
          isContract,
        };
      });

      // Calculate concentration metrics
      const top5 = holders.slice(0, 5).reduce((sum, h) => sum + h.percentage, 0);
      const top10 = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
      const top20 = holders.slice(0, 20).reduce((sum, h) => sum + h.percentage, 0);

      // Assess risk
      const { riskLevel, riskFactors } = assessHolderRisk(holders, top5, top10);

      return {
        mint,
        holders: holders.slice(0, 20), // Top 20
        totalSupply,
        top5Concentration: top5,
        top10Concentration: top10,
        top20Concentration: top20,
        holderCount: 0, // Would need additional RPC call to count all holders
        riskLevel,
        riskFactors,
        analyzedAt: Date.now(),
      };
    } catch (err: any) {
      console.warn(`[top-holders] Failed for ${mint}: ${err.message}`);
      return {
        mint, holders: [], totalSupply: 0,
        top5Concentration: 0, top10Concentration: 0, top20Concentration: 0,
        holderCount: 0, riskLevel: 'low', riskFactors: ['Failed to fetch holder data'],
        analyzedAt: Date.now(),
      };
    }
  }, 300_000); // Cache for 5 minutes
}

/**
 * Assess holder distribution risk.
 */
function assessHolderRisk(
  holders: HolderInfo[],
  top5: number,
  top10: number
): { riskLevel: 'low' | 'medium' | 'high' | 'critical'; riskFactors: string[] } {
  const riskFactors: string[] = [];
  let riskScore = 0;

  // Top holder concentration
  if (holders.length > 0 && holders[0].percentage > 50) {
    riskFactors.push(`Top holder owns ${holders[0].percentage.toFixed(1)}% of supply`);
    riskScore += 40;
  } else if (holders.length > 0 && holders[0].percentage > 30) {
    riskFactors.push(`Top holder owns ${holders[0].percentage.toFixed(1)}% of supply`);
    riskScore += 25;
  }

  // Top 5 concentration
  if (top5 > 80) {
    riskFactors.push(`Top 5 holders own ${top5.toFixed(1)}% of supply`);
    riskScore += 30;
  } else if (top5 > 60) {
    riskFactors.push(`Top 5 holders own ${top5.toFixed(1)}% of supply`);
    riskScore += 15;
  }

  // Top 10 concentration
  if (top10 > 90) {
    riskFactors.push(`Top 10 holders own ${top10.toFixed(1)}% of supply`);
    riskScore += 20;
  }

  // Unknown top holders (not labeled as CEX/DEX)
  const unknownTop5 = holders.slice(0, 5).filter(h => !h.label).length;
  if (unknownTop5 >= 3) {
    riskFactors.push(`${unknownTop5} of top 5 holders are unknown wallets`);
    riskScore += 15;
  }

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore >= 70) riskLevel = 'critical';
  else if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 30) riskLevel = 'medium';
  else riskLevel = 'low';

  return { riskLevel, riskFactors };
}