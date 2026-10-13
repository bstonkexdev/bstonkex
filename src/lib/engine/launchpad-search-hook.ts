// Cupcak8 Swap — Launchpad Search Integration
// Makes indexed launch events discoverable via the unified search engine.
// Reads from the persistent launchpad_events collection.

import type { ChainId } from '../config';
import { CHAINS } from '../config';
import { getLaunchEvents } from './launchpad-indexer';
import type { LaunchpadEventRecord } from './launchpad-registry';

// ── Indexed Token Search ───────────────────────────────────

export interface IndexedTokenResult {
  type: 'launchpad_token';
  chain: ChainId;
  tokenAddress: string;
  launchpad: string;
  launchpadId: string;
  creator: string;
  txHash: string;
  blockNumber: number;
  indexedAt: number;
  explorerUrl: string | null;
}

/**
 * Search indexed launchpad tokens by address or symbol.
 * Returns matches from the persistent launchpad_events collection.
 */
export async function searchIndexedTokens(query: string): Promise<IndexedTokenResult[]> {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 4) return [];

  try {
    const events = await getLaunchEvents(undefined, undefined, 200);
    const results: IndexedTokenResult[] = [];

    for (const event of events) {
      // Match by token address (partial or full)
      const tokenLower = event.tokenAddress.toLowerCase();
      if (tokenLower.includes(q) || q.includes(tokenLower.slice(0, 10))) {
        const chainConfig = CHAINS[event.chain as keyof typeof CHAINS];
        const explorerUrl = chainConfig?.explorerUrl
          ? `${chainConfig.explorerUrl}/address/${event.tokenAddress}`
          : event.chain === 'solana'
          ? `https://solscan.io/token/${event.tokenAddress}`
          : null;

        results.push({
          type: 'launchpad_token',
          chain: event.chain,
          tokenAddress: event.tokenAddress,
          launchpad: event.launchpad,
          launchpadId: event.launchpad,
          creator: event.creator,
          txHash: event.txHash,
          blockNumber: event.blockNumber,
          indexedAt: event.timestamp,
          explorerUrl,
        });
      }
    }

    return results;
  } catch { return []; }
}

/**
 * Get all indexed tokens for display in the launchpad page.
 */
export async function getIndexedLaunchpadTokens(
  chainId?: ChainId,
  launchpadId?: string,
): Promise<IndexedTokenResult[]> {
  try {
    const events = await getLaunchEvents(chainId, launchpadId, 200);
    return events.map(event => {
      const chainConfig = CHAINS[event.chain as keyof typeof CHAINS];
      const explorerUrl = chainConfig?.explorerUrl
        ? `${chainConfig.explorerUrl}/address/${event.tokenAddress}`
        : event.chain === 'solana'
        ? `https://solscan.io/token/${event.tokenAddress}`
        : null;

      return {
        type: 'launchpad_token' as const,
        chain: event.chain,
        tokenAddress: event.tokenAddress,
        launchpad: event.launchpad,
        launchpadId: event.launchpad,
        creator: event.creator,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        indexedAt: event.timestamp,
        explorerUrl,
      };
    });
  } catch { return []; }
}