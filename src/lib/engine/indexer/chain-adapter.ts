// Cupcak8 Swap Indexer — Chain Adapter Interface
// Common interface for all blockchain adapters.

import type { ChainId, MarketEvent, FinalityStatus } from './types';

export interface RawBlock {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
}

export interface RawLog {
  address: string;       // contract that emitted
  topics: string[];      // event signature + indexed params
  data: string;          // non-indexed params
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  timestamp: number;
}

export interface RawSolanaSignature {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: any;
  memo: string | null;
}

export interface ChainAdapter {
  readonly chainId: ChainId;
  readonly isEvm: boolean;

  /** Get the latest block/slot number from the chain */
  getLatestBlock(): Promise<number>;

  /** Get a specific block with hash and parent hash */
  getBlock(blockNumber: number): Promise<RawBlock | null>;

  /** Get logs for a range of blocks (EVM only) */
  getLogs?(fromBlock: number, toBlock: number, addresses: string[], topics: string[][]): Promise<RawLog[]>;

  /** Get recent signatures for a Solana address */
  getSignatures?(address: string, limit: number, before?: string): Promise<RawSolanaSignature[]>;

  /** Parse a transaction into normalized events */
  parseEvents?(txHash: string, logs: RawLog[]): MarketEvent[];

  /** Get the RPC URL being used (sanitized, no secrets) */
  getRpcEndpoint(): string;

  /** Health check — returns latency in ms or -1 if failed */
  healthCheck(): Promise<number>;
}

export interface ChainConfig {
  chainId: ChainId;
  numericChainId: number;
  rpcUrls: string[];
  name: string;
  isEvm: boolean;
  /** Max block range for eth_getLogs (0 = no limit). Base: 500, BSC: varies by provider. */
  maxBlockRange?: number;
}
