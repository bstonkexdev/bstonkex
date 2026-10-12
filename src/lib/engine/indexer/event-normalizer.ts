// Cupcak8 Swap Indexer — Event Normalizer
// Converts raw EVM logs → canonical MarketEvent. Real data only.

import type { RawLog } from './chain-adapter';
import type { DexConfig } from './dex-registry';
import type { MarketEvent, ChainId, EventType } from './types';

// Uniswap V2 Swap event ABI:
// event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)
const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

export function normalizeSwapEvent(
  log: RawLog,
  dexConfig: DexConfig,
  chain: string,
): MarketEvent | null {
  try {
    const eventType = classifyEvent(log.topics[0], dexConfig);
    if (!eventType) return null;

    const poolAddress = log.address.toLowerCase();
    const marketId = `${chain}:${dexConfig.id}:${poolAddress}`;

    // Parse swap amounts from data field
    const { amountIn, amountOut, tokenIn, tokenOut } = parseSwapData(log, dexConfig);

    return {
      id: `${chain}:${log.transactionHash}:${log.logIndex}`,
      chain: chain as ChainId,
      eventType,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      slot: null,
      logIndex: log.logIndex,
      timestamp: log.timestamp * 1000, // convert to ms
      marketId,
      poolId: poolAddress,
      tokenIn: tokenIn || '',
      tokenOut: tokenOut || '',
      amountIn: amountIn || '0',
      amountOut: amountOut || '0',
      price: null,   // derived later from token decimals + reserves
      usdValue: null, // derived later
      wallet: '',     // extracted from topics if available
      dex: dexConfig.id,
      status: 'confirmed',
    };
  } catch {
    return null;
  }
}

function classifyEvent(topic: string, dexConfig: DexConfig): EventType | null {
  const t = topic.toLowerCase();
  if (t === dexConfig.eventTopics.swap?.toLowerCase()) return 'SWAP';
  if (dexConfig.eventTopics.mint && t === dexConfig.eventTopics.mint.toLowerCase()) return 'MINT';
  if (dexConfig.eventTopics.burn && t === dexConfig.eventTopics.burn.toLowerCase()) return 'BURN';
  if (dexConfig.eventTopics.poolCreated && t === dexConfig.eventTopics.poolCreated.toLowerCase()) return 'POOL_CREATED';
  // Check generic Uniswap V2 swap topic
  if (t === SWAP_TOPIC) return 'SWAP';
  return null;
}

function parseSwapData(log: RawLog, _dexConfig: DexConfig): {
  amountIn: string; amountOut: string; tokenIn: string; tokenOut: string;
} {
  // Uniswap V2 Swap: data contains 4 uint256 values (amount0In, amount1In, amount0Out, amount1Out)
  // Each uint256 is 32 bytes (64 hex chars), padded to 0x + 256 hex chars total
  const data = log.data;
  if (data.length < 258) {
    return { amountIn: '0', amountOut: '0', tokenIn: '', tokenOut: '' };
  }

  const amount0In = BigInt('0x' + data.slice(2, 66));
  const amount1In = BigInt('0x' + data.slice(66, 130));
  const amount0Out = BigInt('0x' + data.slice(130, 194));
  const amount1Out = BigInt('0x' + data.slice(194, 258));

  // sender is topics[1], to is topics[2]
  const sender = log.topics[1] ? '0x' + log.topics[1].slice(26) : '';
  const to = log.topics[2] ? '0x' + log.topics[2].slice(26) : '';

  if (amount0In > 0n) {
    return {
      amountIn: amount0In.toString(),
      amountOut: amount1Out.toString(),
      tokenIn: 'token0', // resolved later from pool state
      tokenOut: 'token1',
    };
  } else {
    return {
      amountIn: amount1In.toString(),
      amountOut: amount0Out.toString(),
      tokenIn: 'token1',
      tokenOut: 'token0',
    };
  }
}
