// Cupcak8 Swap Indexer — Reorg Handler
// Detects and handles EVM chain reorganizations.

import type { ChainId } from './types';
import { getBlockMeta, getEventsByChain, removeEventsByIds } from './db';

export async function detectReorg(chain: string, blockNumber: number): Promise<string[]> {
  const affectedEventIds: string[] = [];

  // Walk back to find the fork point
  let checkBlock = blockNumber;
  while (checkBlock > blockNumber - 10) { // max 10 blocks back
    const meta = await getBlockMeta(chain, checkBlock);
    if (!meta) break;

    const parentMeta = await getBlockMeta(chain, checkBlock - 1);
    if (!parentMeta) break;

    if (parentMeta.blockHash !== meta.parentHash) {
      // Found fork point at checkBlock
      affectedEventIds.push(checkBlock.toString());
      checkBlock--;
    } else {
      break; // no more reorg
    }
  }

  if (affectedEventIds.length > 0) {
    // Find and remove events from orphaned blocks
    const events = await getEventsByChain(chain, 100);
    const orphanedIds = events
      .filter(e => affectedEventIds.includes(e.blockNumber?.toString() || ''))
      .map(e => e.id);

    if (orphanedIds.length > 0) {
      await removeEventsByIds(orphanedIds);
    }
  }

  return affectedEventIds;
}

export function isReorgLikely(
  chain: string,
  blockNumber: number,
  parentHash: string,
): Promise<boolean> {
  return getBlockMeta(chain, blockNumber - 1).then(meta => {
    if (!meta) return false;
    return meta.blockHash !== parentHash;
  });
}
