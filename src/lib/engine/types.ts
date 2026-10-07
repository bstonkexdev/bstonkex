// BSTONKEX Engine — Shared types for the multi-chain backend
import type { ChainId } from '../config';

// ── Chain Adapter Interface ──────────────────────────────────
export interface ChainAdapter {
  chainId: ChainId;
  isEvm: boolean;
  rpcUrls: string[];
  nativeSymbol: string;
  nativeDecimals: number;

  // Wallet
  getNativeBalance(wallet: string): Promise<string>;
  getTokenBalance(wallet: string, token: string, decimals?: number): Promise<string>;
  getTokenMetadata(address: string): Promise<TokenMetadata>;

  // Pricing
  getNativePriceUsd(): Promise<number>;
  getTokenPriceUsd(address: string): Promise<number | null>;

  // Quotes & Routing
  getSwapQuote(params: SwapParams): Promise<SwapQuote>;
  buildSwapTransaction(params: SwapParams, quote: SwapQuote): Promise<UnsignedTx>;
  estimateGas(tx: UnsignedTx): Promise<GasEstimate>;
  sendTransaction(signedTx: string): Promise<TxHash>;
  getTransactionStatus(hash: string): Promise<TxStatus>;

  // Network
  getBlockNumber(): Promise<number>;
  getGasPrice(): Promise<string>;

  // Health
  healthCheck(): Promise<HealthStatus>;
}

// ── Token ────────────────────────────────────────────────────
export interface TokenMetadata {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  verified: boolean;
}

// ── Swap / Trade ─────────────────────────────────────────────
export interface SwapParams {
  chainId: ChainId;
  tokenIn: string;       // address or 'native'
  tokenOut: string;      // address or 'native'
  amountIn: string;      // in smallest unit (wei/lamports)
  slippageBps: number;   // e.g. 100 = 1%
  walletAddress: string;
  deadline?: number;     // unix seconds
}

export interface SwapQuote {
  available: boolean;
  amountIn: string;
  amountOut: string;
  amountOutMin: string;
  priceImpactBps: number;  // basis points
  route: RouteStep[];
  gasEstimate: string;
  gasPriceUsd: number;
  dexFeeUsd: number;
  source: string;           // e.g. '1inch', 'jupiter', 'uniswap'
  raw?: any;                // provider-specific data
  error?: string;
}

export interface RouteStep {
  dex: string;
  pool: string;
  tokenIn: string;
  tokenOut: string;
  pct: number;
}

export interface UnsignedTx {
  to: string;
  data: string;
  value: string;
  chainId: number;
  gasLimit?: string;
  gasPrice?: string;
  // Solana fields
  serializedMessage?: string;
  signers?: string[];
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  totalNative: string;
  totalUsd: number;
}

export type TxHash = string;

export interface TxStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed' | 'not_found';
  blockNumber?: number;
  timestamp?: number;
  confirmations?: number;
}

// ── Portfolio ────────────────────────────────────────────────
export interface WalletBalance {
  chainId: ChainId;
  address: string;
  nativeBalance: string;
  nativeBalanceUsd: number;
  tokens: TokenBalance[];
  totalUsd: number;
  updatedAt: number;
}

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
  priceUsd: number | null;
  valueUsd: number | null;
  logoUrl: string | null;
}

// ── Health ───────────────────────────────────────────────────
export interface HealthStatus {
  service: string;
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
  lastCheck: number;
  error?: string;
}

// ── Prices ───────────────────────────────────────────────────
export interface PriceUpdate {
  chainId: ChainId;
  address: string;
  price: number;
  change24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  timestamp: number;
}

// ── Events ───────────────────────────────────────────────────
export type EngineEvent =
  | { type: 'price'; data: PriceUpdate }
  | { type: 'trade'; data: NormalizedTrade }
  | { type: 'tx_status'; data: TxStatus }
  | { type: 'balance'; data: WalletBalance };

export interface NormalizedTrade {
  chainId: ChainId;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  pair: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  priceUsd: number;
  valueUsd: number;
  side: 'buy' | 'sell';
  wallet: string;
  dex: string;
}

export type EventListener = (event: EngineEvent) => void;