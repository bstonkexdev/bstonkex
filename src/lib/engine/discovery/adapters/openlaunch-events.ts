// Cupcak8 Swap — OpenLaunch Discovery Adapter (EVM eth_getLogs)
// Discovers new tokens via Launched events on OpenLaunch factory contracts.
// Verified: topic 0xda18b133..., factory 0x815542E8b392389A1389E22E588E4B62A67Ade72
// Works on both Base (8453) and Robinhood (4663).
import type { ChainId } from '../../../config';
import { CHAINS } from '../../../config';
import type { DiscoveryAdapter, DiscoveryCursor, DiscoveryScanResult, AdapterHealth, TokenIndexRecord } from '../types';

function getRpcUrl(chainId: ChainId): string | null {
  return CHAINS[chainId]?.rpcUrl ?? null;
}

const FACTORY_ADDRESS = '0x815542E8b392389A1389E22E588E4B62A67Ade72';
const EVENT_TOPIC = '0xda18b133e41a7fe4e3adc625c6eeaf9237558c875e411398a623cc9603aad0a9';
const SCAN_RANGE = 2000; // blocks per scan
const LAUNCHPAD_ID: Record<ChainId, string> = { base: 'openlaunch-base', robinhood: 'openlaunch-rh', bsc: 'openlaunch-bsc', solana: '' };
const LAUNCHPAD_NAME = 'OpenLaunch';

// Start blocks (first verified event on each chain)
const START_BLOCKS: Partial<Record<ChainId, number>> = {
  base: 52340723,
  robinhood: 83648412,
};

interface DecodedEvent {
  tokenAddress: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: number;
}

function decodeAddress(topic: string): string {
  return '0x' + topic.slice(26).toLowerCase();
}

async function ethGetLogs(chainId: ChainId, fromBlock: number, toBlock: number): Promise<DecodedEvent[]> {
  const url = getRpcUrl(chainId);
  if (!url) return [];

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_getLogs',
      params: [{
        address: FACTORY_ADDRESS,
        topics: [EVENT_TOPIC],
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: '0x' + toBlock.toString(16),
      }],
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await resp.json();
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  const logs = data.result || [];

  return logs.map((log: any) => ({
    tokenAddress: decodeAddress(log.topics[1]), // indexed token address
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    logIndex: parseInt(log.logIndex, 16),
    timestamp: Date.now(), // approximate — block timestamp would need extra call
  }));
}

async function fetchBlockTimestamp(chainId: ChainId, blockNumber: number): Promise<number> {
  const url = getRpcUrl(chainId);
  if (!url) return Date.now();
  try {
    const resp = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x' + blockNumber.toString(16), false] }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    return data.result?.timestamp ? parseInt(data.result.timestamp, 16) * 1000 : Date.now();
  } catch { return Date.now(); }
}

export function createOpenLaunchAdapter(chainId: ChainId): DiscoveryAdapter {
  const launchpadId = LAUNCHPAD_ID[chainId];
  let health: AdapterHealth = {
    adapterId: `openlaunch-${chainId}`,
    status: 'active',
    lastSuccessAt: null, lastErrorAt: null, lastError: null,
    tokensDiscovered: 0, cursorPosition: null, latencyMs: null,
  };

  return {
    id: `openlaunch-${chainId}`,
    launchpadId: launchpadId || `openlaunch-${chainId}`,
    launchpadName: LAUNCHPAD_NAME,
    chainId,
    method: 'eth_getLogs',

    async scan(cursor: DiscoveryCursor): Promise<DiscoveryScanResult> {
      const errors: string[] = [];
      const tokens: Partial<TokenIndexRecord>[] = [];
      const startBlock = cursor.blockNumber ?? START_BLOCKS[chainId] ?? 0;

      // Get current block
      const url = getRpcUrl(chainId);
      if (!url) return { tokens: [], cursor, scanned: 0, errors: ['No RPC URL configured'] };

      let latestBlock: number;
      try {
        const resp = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
          signal: AbortSignal.timeout(10000),
        });
        const data = await resp.json();
        latestBlock = parseInt(data.result, 16);
      } catch (e: any) {
        errors.push(`Failed to get block number: ${e.message}`);
        return { tokens: [], cursor, scanned: 0, errors };
      }

      const toBlock = Math.min(startBlock + SCAN_RANGE, latestBlock);
      if (toBlock <= startBlock) return { tokens: [], cursor, scanned: 0, errors };

      try {
        const events = await ethGetLogs(chainId, startBlock, toBlock);

        for (const ev of events) {
          const ts = await fetchBlockTimestamp(chainId, ev.blockNumber);
          tokens.push({
            chainId,
            address: ev.tokenAddress,
            launchpadId: launchpadId || `openlaunch-${chainId}`,
            launchpadName: LAUNCHPAD_NAME,
            creator: null, // not in indexed topic (only token is indexed)
            launchTimestamp: ts,
            blockNumber: ev.blockNumber,
            solanaSlot: null,
            sourceTxHash: ev.txHash,
            sourceLogIndex: ev.logIndex,
            discoverySource: 'eth_getLogs',
            discoveryStatus: 'verified',
            marketDataStatus: 'awaiting',
            name: null, symbol: null, icon: null,
          });
        }

        health = {
          ...health,
          lastSuccessAt: Date.now(),
          cursorPosition: `block ${toBlock}`,
          tokensDiscovered: health.tokensDiscovered + events.length,
          latencyMs: null,
        };

        return {
          tokens,
          cursor: { ...cursor, blockNumber: toBlock, lastRunAt: Date.now(), lastSuccessAt: Date.now() },
          scanned: toBlock - startBlock,
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
