// Cupcak8 Swap — MEV & Private RPC Router
// Routes trades through Jito Block Engine (Solana) and Flashbots/BloXroute (EVM)
// for MEV protection, sandwich attack prevention, and priority execution.
//
// Architecture (from blueprint):
//   [Frontend Trade] → [MEV Router] → [Private RPC] → [On-Chain DEX Execution]
//
// Solana: Jito Block Engine (bundles, priority fees, tip accounts)
// EVM: Flashbots (private mempool, bundle submission) / BloXroute BDN

import type { ChainId } from '../config';

// ── Types ────────────────────────────────────────────────────

export type RpcProvider = 'jito' | 'flashbots' | 'bloxroute' | 'public';

export interface MevConfig {
  /** Enable MEV protection (routes through private RPCs) */
  enabled: boolean;
  /** Priority fee in microlamports (Solana) or gwei (EVM) */
  priorityFee: number;
  /** Jito tip amount in lamports (Solana only) */
  jitoTipLamports: number;
  /** Max slippage with MEV protection */
  slippageBps: number;
}

export interface RouteResult {
  provider: RpcProvider;
  endpoint: string;
  latencyMs: number;
  protected: boolean;
  bundleId?: string;
}

export interface BundleStatus {
  bundleId: string;
  status: 'pending' | 'confirmed' | 'failed' | 'expired';
  txHashes: string[];
  slot?: number;
  error?: string;
}

// ── Default Config ───────────────────────────────────────────

const DEFAULT_CONFIG: MevConfig = {
  enabled: true,
  priorityFee: 100_000, // 100k microlamports (Solana) or 0.1 gwei (EVM)
  jitoTipLamports: 10_000, // 0.00001 SOL tip
  slippageBps: 500, // 5%
};

let config: MevConfig = { ...DEFAULT_CONFIG };

/** Update MEV router configuration. */
export function updateMevConfig(partial: Partial<MevConfig>): void {
  config = { ...config, ...partial };
}

/** Get current MEV configuration. */
export function getMevConfig(): MevConfig {
  return { ...config };
}

// ── Jito Block Engine (Solana) ───────────────────────────────

const JITO_ENDPOINTS = [
  'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
  'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/transactions',
  'https://ny.mainnet.block-engine.jito.wtf/api/v1/transactions',
  'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/transactions',
];

const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4bPg4W3Cn2Q8CZ4HT9g5J5K',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSLrfa5TY3bG1C4C2jG',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiDuNwLVS2B95aJGjKGamZiHmXRiCvGMZaJ',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

/** Send a transaction through Jito Block Engine with MEV protection. */
export async function sendViaJito(
  serializedTx: string,
  options: { tipLamports?: number; timeoutMs?: number } = {},
): Promise<RouteResult> {
  const tip = options.tipLamports ?? config.jitoTipLamports;
  const timeout = options.timeoutMs ?? 30_000;

  // Pick closest Jito endpoint (round-robin for now)
  const endpoint = JITO_ENDPOINTS[Math.floor(Math.random() * JITO_ENDPOINTS.length)];
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [
          serializedTx,
          {
            encoding: 'base64',
            skipPreflight: true,
            maxRetries: 3,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Jito HTTP ${res.status}`);
    }

    const data = await res.json();
    const latencyMs = Date.now() - startTime;

    if (data.error) {
      console.warn('[mev-router] Jito error:', data.error.message || data.error);
      return {
        provider: 'jito',
        endpoint,
        latencyMs,
        protected: false,
      };
    }

    return {
      provider: 'jito',
      endpoint,
      latencyMs,
      protected: true,
      bundleId: data.result,
    };
  } catch (e: any) {
    const latencyMs = Date.now() - startTime;
    console.warn('[mev-router] Jito failed:', e?.message || e);
    return {
      provider: 'jito',
      endpoint,
      latencyMs,
      protected: false,
    };
  }
}

// ── Flashbots (EVM) ──────────────────────────────────────────

const FLASHBOTS_ENDPOINT = 'https://relay.flashbots.net';

/** Send a transaction through Flashbots (EVM chains). */
export async function sendViaFlashbots(
  signedTx: string,
  chainId: number,
  options: { timeoutMs?: number } = {},
): Promise<RouteResult> {
  const timeout = options.timeoutMs ?? 30_000;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(FLASHBOTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendRawTransaction',
        params: [signedTx],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      throw new Error(`Flashbots HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.error) {
      console.warn('[mev-router] Flashbots error:', data.error.message || data.error);
      return { provider: 'flashbots', endpoint: FLASHBOTS_ENDPOINT, latencyMs, protected: false };
    }

    return {
      provider: 'flashbots',
      endpoint: FLASHBOTS_ENDPOINT,
      latencyMs,
      protected: true,
      bundleId: data.result,
    };
  } catch (e: any) {
    const latencyMs = Date.now() - startTime;
    console.warn('[mev-router] Flashbots failed:', e?.message || e);
    return { provider: 'flashbots', endpoint: FLASHBOTS_ENDPOINT, latencyMs, protected: false };
  }
}

// ── Public RPC Fallback ──────────────────────────────────────

const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://rpc.helius.xyz/?api-key=demo',
];

/** Send via public RPC (no MEV protection — fallback). */
export async function sendViaPublicRpc(
  serializedTx: string,
  chain: string,
): Promise<RouteResult> {
  const endpoint = chain === 'solana'
    ? SOLANA_RPC_ENDPOINTS[Math.floor(Math.random() * SOLANA_RPC_ENDPOINTS.length)]
    : 'https://rpc.ankr.com/eth';

  const startTime = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: chain === 'solana' ? 'sendTransaction' : 'eth_sendRawTransaction',
        params: chain === 'solana'
          ? [serializedTx, { encoding: 'base64', skipPreflight: true }]
          : [serializedTx],
      }),
    });

    const latencyMs = Date.now() - startTime;
    const data = await res.json();

    return {
      provider: 'public',
      endpoint,
      latencyMs,
      protected: false,
      bundleId: data.result,
    };
  } catch (e: any) {
    return {
      provider: 'public',
      endpoint,
      latencyMs: Date.now() - startTime,
      protected: false,
    };
  }
}

// ── Smart Router ─────────────────────────────────────────────

/**
 * Route a transaction through the best available channel.
 * Priority: Jito (Solana) / Flashbots (EVM) → Public RPC fallback
 */
export async function routeTransaction(
  serializedTx: string,
  chain: string,
): Promise<RouteResult> {
  if (!config.enabled) {
    return sendViaPublicRpc(serializedTx, chain);
  }

  if (chain === 'solana') {
    // Try Jito first (MEV protected)
    const jitoResult = await sendViaJito(serializedTx);
    if (jitoResult.protected) return jitoResult;

    // Fallback to public RPC
    console.warn('[mev-router] Jito failed, falling back to public RPC');
    return sendViaPublicRpc(serializedTx, chain);
  }

  // EVM chains: try Flashbots
  const chainId = chain === 'ethereum' ? 1 : chain === 'bsc' ? 56 : chain === 'base' ? 8453 : 1;
  const fbResult = await sendViaFlashbots(serializedTx, chainId);
  if (fbResult.protected) return fbResult;

  // Fallback to public RPC
  console.warn('[mev-router] Flashbots failed, falling back to public RPC');
  return sendViaPublicRpc(serializedTx, chain);
}

// ── Jito Bundle Status ───────────────────────────────────────

/** Check the status of a Jito bundle. */
export async function getJitoBundleStatus(bundleId: string): Promise<BundleStatus | null> {
  try {
    const endpoint = JITO_ENDPOINTS[0].replace('/transactions', '/bundles');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBundleStatuses',
        params: [[bundleId]],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const status = data.result?.value?.[0];

    if (!status) return null;

    return {
      bundleId,
      status: status.confirmation_status === 'confirmed' ? 'confirmed'
        : status.confirmation_status === 'finalized' ? 'confirmed'
        : status.err ? 'failed'
        : 'pending',
      txHashes: status.transactions || [],
      slot: status.slot,
      error: status.err ? JSON.stringify(status.err) : undefined,
    };
  } catch {
    return null;
  }
}

// ── Diagnostics ──────────────────────────────────────────────

export interface MevRouterStats {
  enabled: boolean;
  provider: RpcProvider;
  jitoEndpoints: number;
  tipLamports: number;
  priorityFee: number;
}

export function getMevRouterStats(): MevRouterStats {
  return {
    enabled: config.enabled,
    provider: config.enabled ? 'jito' : 'public',
    jitoEndpoints: JITO_ENDPOINTS.length,
    tipLamports: config.jitoTipLamports,
    priorityFee: config.priorityFee,
  };
}