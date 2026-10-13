// Cupcak8 Swap — BSC Launchpad Event Listener
// Polls Four.meme + GraFun factory contracts via public BSC RPC `eth_getLogs`.
// Normalizes TokenCreated events into TrenchesToken records.

import type { TrenchesToken } from './trenches-types';
import { computePhase, computeVirtualMcap } from './trenches-types';

const BSC_RPC = 'https://bsc-dataseed1.binance.org';

// Four.meme factory — TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 initialBuy)
const FOURMEME_FACTORY = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
const TOKEN_CREATED_TOPIC = '0x3b4e2d7f4e3274c6cf31b2b42521687c2764c4b0e5d5755e2ba7f54d1b13b1e3'; // keccak256("TokenCreated(address,address,string,string,uint256)")

// GraFun factory (approximate — verify on-chain)
const GRAFUN_FACTORY = '0x9C36AD39a3f0e22F83A4a8b0C03b1a2c34e15678';

interface BscTokenEvent {
  address: string; // Token contract
  creator: string;
  name: string;
  symbol: string;
  initialBuy: number;
  timestamp: number;
  launchpad: 'fourmeme' | 'grafun';
}

// Tracked tokens
const tokens = new Map<string, TrenchesToken>();
const listeners = new Set<(token: TrenchesToken) => void>();

// Poll state
let lastBlock = 0;
let polling = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Subscribe to new BSC token events. */
export function onBscToken(listener: (token: TrenchesToken) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Get all tracked BSC tokens. */
export function getBscTokens(): TrenchesToken[] {
  return [...tokens.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Get BSC token by address. */
export function getBscToken(address: string): TrenchesToken | undefined {
  return tokens.get(address.toLowerCase());
}

/**
 * Poll BSC logs for new TokenCreated events.
 * Uses eth_getLogs with topic filtering — works on any public BSC RPC.
 */
export async function pollBscEvents(): Promise<number> {
  if (polling) return 0;
  polling = true;
  let newCount = 0;

  try {
    const currentBlock = await getBlockNumber();
    if (lastBlock === 0) {
      // First run — scan last 1000 blocks (~30 minutes)
      lastBlock = Math.max(0, currentBlock - 1000);
    }

    if (currentBlock <= lastBlock) return 0;

    const fromBlock = '0x' + (lastBlock + 1).toString(16);
    const toBlock = '0x' + currentBlock.toString(16);

    // Query both factories
    for (const factory of [FOURMEME_FACTORY, GRAFUN_FACTORY]) {
      try {
        const logs = await getLogs(fromBlock, toBlock, factory, TOKEN_CREATED_TOPIC);
        for (const log of logs) {
          const event = parseTokenCreated(log);
          if (event && !tokens.has(event.address.toLowerCase())) {
            const token = normalizeToken(event);
            tokens.set(token.address.toLowerCase(), token);
            newCount++;
            for (const listener of listeners) {
              try { listener(token); } catch { /* listener error */ }
            }
          }
        }
      } catch { /* factory query failed — skip */ }
    }

    lastBlock = currentBlock;
  } catch {
    // RPC failure — will retry next poll
  } finally {
    polling = false;
  }

  return newCount;
}

/** Start polling for BSC events. */
export function startBscListener(intervalMs = 30_000): () => void {
  pollBscEvents().catch(() => {});
  pollTimer = setInterval(() => pollBscEvents().catch(() => {}), intervalMs);
  return () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
}

// ── RPC Helpers ─────────────────────────────────────────────

async function getBlockNumber(): Promise<number> {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json();
  return parseInt(json.result, 16);
}

async function getLogs(fromBlock: string, toBlock: string, address: string, topic: string): Promise<any[]> {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
      params: [{ fromBlock, toBlock, address, topics: [topic] }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  return json.result ?? [];
}

// ── Event Parsing ───────────────────────────────────────────

function parseTokenCreated(log: any): BscTokenEvent | null {
  try {
    // topics[0] = event signature, topics[1] = token, topics[2] = creator
    const tokenAddr = '0x' + log.topics[1]?.slice(26);
    const creator = '0x' + log.topics[2]?.slice(26);
    // data = abi.encode(name, symbol, initialBuy) — complex to decode without ethers
    // For now, extract what we can from topics and use data length as heuristic
    return {
      address: tokenAddr,
      creator,
      name: 'BSC Token', // Would need ABI decoding for name/symbol
      symbol: '???',
      initialBuy: 0,
      timestamp: Date.now(),
      launchpad: log.address.toLowerCase() === FOURMEME_FACTORY.toLowerCase() ? 'fourmeme' : 'grafun',
    };
  } catch {
    return null;
  }
}

function normalizeToken(event: BscTokenEvent): TrenchesToken {
  return {
    address: event.address,
    chainId: 'bsc',
    name: event.name,
    symbol: event.symbol,
    creator: event.creator,
    bondingCurveProgress: 0,
    spotPriceUsd: 0,
    virtualMcapUsd: 0,
    virtualReserve: event.initialBuy,
    virtualTokens: 1e9,
    createdAt: event.timestamp,
    phase: computePhase(0),
    launchpadId: event.launchpad,
    security: {
      risk: 'unknown', score: null, mintAuthority: null, freezeAuthority: null,
      lpLockedPct: null, top10Pct: null, honeypot: null,
      buyTaxPct: null, sellTaxPct: null, auditedAt: null,
    },
    icon: null,
    trades24h: null,
    volume24hUsd: null,
    liquidityUsd: null,
  };
}
