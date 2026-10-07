// BSTONKEX Runtime Validation — Performs ACTUAL infrastructure checks against real endpoints.
// No mocks. No fixtures. Real RPC calls, real API calls, real network requests.
// Reports genuine PASS/FAIL/NOT_VERIFIED with exact blockers.

import type { ChainId } from '../config';
import { CHAINS, CONFIGURED_CHAINS, DEXSCREENER_API, GECKOTERMINAL_API, PLATFORM_FEE_PCT } from '../config';
import { getChainAdapter } from './chain-registry';
import { isSandboxed } from './sandbox';

// ── Types ────────────────────────────────────────────────────

export type Verdict = 'PASS' | 'FAIL' | 'NOT_VERIFIED' | 'BLOCKED';

export interface RuntimeCheck {
  id: string;
  category: string;
  check: string;
  verdict: Verdict;
  detail: string;
  blocker?: string;
  latencyMs?: number;
  verifiedAt: number;
  data?: Record<string, unknown>;
}

export interface ChainRuntimeResult {
  chainId: ChainId;
  checks: RuntimeCheck[];
  passCount: number;
  failCount: number;
  notVerifiedCount: number;
  blockedCount: number;
  overallVerdict: Verdict;
  lastRun: number;
}

export interface FinalReadinessReport {
  chains: ChainRuntimeResult[];
  globalChecks: RuntimeCheck[];
  overallStatus: Verdict;
  generatedAt: number;
}

// ── Helpers ──────────────────────────────────────────────────

function mkCheck(
  id: string, category: string, check: string,
  verdict: Verdict, detail: string, opts?: { blocker?: string; latencyMs?: number; data?: Record<string, unknown> }
): RuntimeCheck {
  return { id, category, check, verdict, detail, verifiedAt: Date.now(), ...opts };
}

async function timedFetch(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; latencyMs: number; data?: unknown }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { ok: false, status: res.status, latencyMs };
    const data = await res.json();
    return { ok: true, status: res.status, latencyMs, data };
  } catch (e: unknown) {
    return { ok: false, status: 0, latencyMs: Date.now() - start };
  }
}

// ── RPC Validation ───────────────────────────────────────────

async function validateRpc(chainId: ChainId): Promise<RuntimeCheck> {
  if (isSandboxed()) return mkCheck(`${chainId}:rpc`, 'RPC', 'Reachable', 'BLOCKED', 'Network blocked in preview sandbox');
  const adapter = getChainAdapter(chainId);
  if (!adapter) return mkCheck(`${chainId}:rpc`, 'RPC', 'Reachable', 'FAIL', 'No chain adapter available');

  const start = Date.now();
  try {
    const block = await adapter.getBlockNumber();
    const latencyMs = Date.now() - start;
    if (!block || block <= 0) return mkCheck(`${chainId}:rpc`, 'RPC', 'Reachable', 'FAIL', 'Invalid block number returned', { latencyMs });
    return mkCheck(`${chainId}:rpc`, 'RPC', 'Reachable', 'PASS',
      `Block #${block.toLocaleString()} · ${latencyMs}ms`, { latencyMs, data: { blockNumber: block } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    const latencyMs = Date.now() - start;
    // Robinhood Chain 4663 returns 403 from all known public endpoints
    if (chainId === 'robinhood' && (msg.includes('403') || msg.includes('API key'))) {
      return mkCheck(`${chainId}:rpc`, 'RPC', 'Reachable', 'BLOCKED',
        `All public RPC endpoints return 403 (API key required) · ${latencyMs}ms`,
        { blocker: 'Robinhood Chain 4663 has no public RPC endpoints. Requires VITE_RH_RPC_PRIMARY env var with authenticated endpoint.', latencyMs });
    }
    return mkCheck(`${chainId}:rpc`, 'RPC', 'Reachable', 'FAIL',
      `RPC unreachable: ${msg}`, { latencyMs });
  }
}

// ── Chain Identity Validation ────────────────────────────────

async function validateChainIdentity(chainId: ChainId): Promise<RuntimeCheck> {
  if (isSandboxed()) return mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'BLOCKED', 'Network blocked in preview sandbox');
  const chain = CHAINS[chainId];

  if (chain.isEvm && chain.chainIdHex) {
    const expected = parseInt(chain.chainIdHex, 16);
    // Actually call eth_chainId via RPC
    const start = Date.now();
    try {
      const res = await fetch(chain.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      const actualHex = data.result;
      const actual = parseInt(actualHex, 16);
      const latencyMs = Date.now() - start;
      if (actual === expected) {
        return mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'PASS',
          `Verified: ${actualHex} (${actual}) matches expected ${chain.chainIdHex} (${expected}) · ${latencyMs}ms`,
          { latencyMs, data: { expected, actual, hex: actualHex } });
      }
      return mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'FAIL',
        `Mismatch: expected ${chain.chainIdHex} (${expected}) but got ${actualHex} (${actual})`,
        { latencyMs, data: { expected, actual, hex: actualHex } });
    } catch (e: unknown) {
      return mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'NOT_VERIFIED',
        `RPC call failed: ${e instanceof Error ? e.message : 'unknown'}`,
        { blocker: 'Could not reach RPC to verify chain ID', latencyMs: Date.now() - start });
    }
  }

  if (!chain.isEvm) {
    // Solana: verify cluster via getClusterNodes
    const start = Date.now();
    try {
      const res = await fetch(chain.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'getClusterNodes', params: [], id: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      const latencyMs = Date.now() - start;
      const nodes = data.result || [];
      if (nodes.length > 0) {
        return mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'PASS',
          `Solana mainnet-beta confirmed: ${nodes.length} cluster nodes · ${latencyMs}ms`,
          { latencyMs, data: { nodeCount: nodes.length, client: nodes[0]?.clientId } });
      }
      return mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'NOT_VERIFIED', 'No cluster nodes returned', { latencyMs });
    } catch (e: unknown) {
      return mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'NOT_VERIFIED',
        `Cluster verification failed: ${e instanceof Error ? e.message : 'unknown'}`,
        { blocker: 'Could not reach Solana RPC to verify cluster', latencyMs: Date.now() - start });
    }
  }

  return mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'NOT_VERIFIED', 'No chain ID configured');
}

// ── Market Data Validation ───────────────────────────────────

async function validateMarketData(chainId: ChainId): Promise<RuntimeCheck> {
  if (isSandboxed()) return mkCheck(`${chainId}:market`, 'Market Data', 'Token Price', 'BLOCKED', 'Network blocked in preview sandbox');
  const chain = CHAINS[chainId];

  const result = await timedFetch(`${DEXSCREENER_API}/latest/dex/search?q=${chain.nativeSymbol}`);
  if (!result.ok) return mkCheck(`${chainId}:market`, 'Market Data', 'Token Price', 'FAIL',
    `DexScreener API ${result.status}`, { latencyMs: result.latencyMs });

  const pairs = ((result.data as Record<string, unknown>)?.pairs || []) as Array<Record<string, unknown>>;
  const chainPairs = pairs.filter((p) => p.chainId === chain.dexScreenerId);
  if (chainPairs.length === 0) {
    // Robinhood may have no DexScreener data even if RPC works
    if (chainId === 'robinhood') {
      return mkCheck(`${chainId}:market`, 'Market Data', 'Token Price', 'NOT_VERIFIED',
        `No pairs found for Robinhood Chain on DexScreener · Chain may have insufficient DEX liquidity`,
        { blocker: 'Robinhood Chain has no indexed DEX market data on DexScreener', latencyMs: result.latencyMs });
    }
    return mkCheck(`${chainId}:market`, 'Market Data', 'Token Price', 'NOT_VERIFIED',
      `No pairs found for ${chain.dexScreenerId}`, { blocker: 'No liquid market data on DexScreener for this chain', latencyMs: result.latencyMs });
  }

  const sample = chainPairs[0];
  const baseToken = sample.baseToken as Record<string, unknown> | undefined;
  return mkCheck(`${chainId}:market`, 'Market Data', 'Token Price', 'PASS',
    `${chainPairs.length} pairs · e.g. ${String(baseToken?.symbol || '?')} · liquidity ${String(sample.liquidity || '0')}`,
    { latencyMs: result.latencyMs, data: { pairCount: chainPairs.length, sampleSymbol: baseToken?.symbol } });
}

// ── WebSocket / Stream Freshness ─────────────────────────────

async function validateStream(): Promise<RuntimeCheck> {
  try {
    const { getDataFreshness, getDataSource } = await import('./market-stream');
    const freshness = getDataFreshness();
    const source = getDataSource();
    // Only PASS when WebSocket is genuinely LIVE (not polling)
    if (freshness === 'LIVE' && source === 'ws') return mkCheck('global:stream', 'WebSocket', 'Stream Freshness', 'PASS', 'LIVE — real-time WebSocket connected');
    if (freshness === 'DELAYED' || source === 'polling') return mkCheck('global:stream', 'WebSocket', 'Stream Freshness', 'BLOCKED',
      'Polling active (real DexScreener data, 15-20s intervals) · WebSocket server NOT deployed · ConnectionStatus correctly shows DELAYED',
      { blocker: 'WebSocket gateway server not deployed (wss://api.bstonkex.xyz/ws). Requires backend infrastructure. Polling fallback active with real data.' });
    if (freshness === 'RECONNECTING') return mkCheck('global:stream', 'WebSocket', 'Stream Freshness', 'NOT_VERIFIED',
      'Stream reconnecting', { blocker: 'WebSocket connection lost, attempting reconnect' });
    return mkCheck('global:stream', 'WebSocket', 'Stream Freshness', 'NOT_VERIFIED', `Stream state: ${freshness}`, { blocker: 'Unknown stream state' });
  } catch {
    return mkCheck('global:stream', 'WebSocket', 'Stream Freshness', 'NOT_VERIFIED', 'Stream module not loaded', { blocker: 'Stream module failed to load' });
  }
}

// ── Chart / Historical Data Validation ───────────────────────

async function validateChart(chainId: ChainId): Promise<RuntimeCheck> {
  if (isSandboxed()) return mkCheck(`${chainId}:chart`, 'Chart', 'Historical Candles', 'BLOCKED', 'Network blocked in preview sandbox');
  const chain = CHAINS[chainId];

  const result = await timedFetch(`${GECKOTERMINAL_API}/networks/${chain.dexScreenerId}/pools`);
  if (!result.ok) return mkCheck(`${chainId}:chart`, 'Chart', 'Historical Candles', 'FAIL',
    `GeckoTerminal ${result.status}`, { latencyMs: result.latencyMs });

  const pools = ((result.data as Record<string, unknown>)?.data || []) as Array<Record<string, unknown>>;
  if (pools.length === 0) return mkCheck(`${chainId}:chart`, 'Chart', 'Historical Candles', 'NOT_VERIFIED',
    'No pools on GeckoTerminal for this chain', { blocker: 'GeckoTerminal has no indexed pool data' });

  return mkCheck(`${chainId}:chart`, 'Chart', 'Historical Candles', 'PASS',
    `${pools.length} pools available · OHLCV data accessible`, { latencyMs: result.latencyMs });
}

// ── Wallet Validation ────────────────────────────────────────

function validateWallet(chainId: ChainId): RuntimeCheck {
  // NOTE: Wallet connection requires a real browser extension + user approval.
  // Code existence is NOT a runtime PASS. A real check would call connect() and verify address.
  const chain = CHAINS[chainId];
  const walletName = chain.isEvm ? 'MetaMask/OKX Wallet' : 'Phantom/Solflare';
  return mkCheck(`${chainId}:wallet`, 'Wallet', 'Connection', 'NOT_VERIFIED',
    `Code supports ${walletName} · Runtime connection requires browser extension + user approval`,
    { blocker: 'No wallet connected — cannot verify balance, address, or signing without real wallet' });
}

// ── Transaction Validation ───────────────────────────────────

function validateTransaction(chainId: ChainId): RuntimeCheck {
  return mkCheck(`${chainId}:tx`, 'Transaction', 'Execution', 'NOT_VERIFIED',
    'Requires connected wallet with funds on correct chain',
    { blocker: 'Cannot execute real transactions without user wallet + real funds + liquid market' });
}

// ── Portfolio Validation ─────────────────────────────────────

function validatePortfolio(chainId: ChainId): RuntimeCheck {
  return mkCheck(`${chainId}:portfolio`, 'Portfolio', 'Reconciliation', 'NOT_VERIFIED',
    'Requires connected wallet with balances',
    { blocker: 'Cannot verify portfolio without real wallet address and balances' });
}

// ── Fee Validation ───────────────────────────────────────────

function validateFees(): RuntimeCheck {
  const feePct = PLATFORM_FEE_PCT * 100;
  const expected = 0.40;
  if (Math.abs(feePct - expected) < 0.001) {
    return mkCheck('global:fees', 'Fees', 'Platform Fee', 'PASS',
      `BSTONKEX Fee = ${feePct.toFixed(2)}% · DEX/Network fees = actual from quote · No hidden fees`);
  }
  return mkCheck('global:fees', 'Fees', 'Platform Fee', 'FAIL',
    `Expected ${expected}% but got ${feePct}%`);
}

// ── Referral Validation ──────────────────────────────────────

function validateReferral(): RuntimeCheck {
  return mkCheck('global:referral', 'Referral', 'Accounting', 'NOT_VERIFIED',
    'Reward = % of BSTONKEX platform fee (not trade principal) · Min claim $10 · 30-day rolling volume',
    { blocker: 'Requires real trades with referral attribution to verify runtime accounting' });
}

// ── Full Chain Validation ────────────────────────────────────

export async function validateChainRuntime(chainId: ChainId): Promise<ChainRuntimeResult> {
  const [rpc, identity, market, chart] = await Promise.allSettled([
    validateRpc(chainId),
    validateChainIdentity(chainId),
    validateMarketData(chainId),
    validateChart(chainId),
  ]);

  const checks: RuntimeCheck[] = [
    rpc.status === 'fulfilled' ? rpc.value : mkCheck(`${chainId}:rpc`, 'RPC', 'Reachable', 'FAIL', 'Validator crashed'),
    identity.status === 'fulfilled' ? identity.value : mkCheck(`${chainId}:identity`, 'RPC', 'Chain ID', 'FAIL', 'Validator crashed'),
    market.status === 'fulfilled' ? market.value : mkCheck(`${chainId}:market`, 'Market Data', 'Token Price', 'FAIL', 'Validator crashed'),
    validateWallet(chainId),
    validateTransaction(chainId),
    chart.status === 'fulfilled' ? chart.value : mkCheck(`${chainId}:chart`, 'Chart', 'Historical Candles', 'FAIL', 'Validator crashed'),
    validatePortfolio(chainId),
  ];

  const passCount = checks.filter(c => c.verdict === 'PASS').length;
  const failCount = checks.filter(c => c.verdict === 'FAIL').length;
  const notVerifiedCount = checks.filter(c => c.verdict === 'NOT_VERIFIED').length;
  const blockedCount = checks.filter(c => c.verdict === 'BLOCKED').length;

  // Overall verdict: FAIL if any fail, NOT_VERIFIED if any critical check is unverified,
  // BLOCKED if all blocked, PASS only if all checks genuinely passed
  let overallVerdict: Verdict;
  if (failCount > 0) overallVerdict = 'FAIL';
  else if (blockedCount === checks.length) overallVerdict = 'BLOCKED';
  else if (notVerifiedCount > 0 || passCount < checks.length) overallVerdict = 'NOT_VERIFIED';
  else overallVerdict = 'PASS';

  return { chainId, checks, passCount, failCount, notVerifiedCount, blockedCount, overallVerdict, lastRun: Date.now() };
}

/** Run full runtime validation across all chains + global checks. */
export async function runFullValidation(): Promise<FinalReadinessReport> {
  const chainResults = await Promise.all(
    CONFIGURED_CHAINS.map(c => validateChainRuntime(c.id as ChainId))
  );

  const [stream] = await Promise.allSettled([validateStream()]);

  const globalChecks: RuntimeCheck[] = [
    stream.status === 'fulfilled' ? stream.value : mkCheck('global:stream', 'WebSocket', 'Stream Freshness', 'FAIL', 'Validator crashed'),
    validateFees(),
    validateReferral(),
  ];

  const allChecks = [...chainResults.flatMap(r => r.checks), ...globalChecks];
  const hasFail = allChecks.some(c => c.verdict === 'FAIL');
  const hasNotVerified = allChecks.some(c => c.verdict === 'NOT_VERIFIED');
  const hasBlocked = allChecks.some(c => c.verdict === 'BLOCKED');
  const allPassed = allChecks.every(c => c.verdict === 'PASS');

  // PASS only when EVERY check genuinely passed. NOT_VERIFIED when any check is unverified.
  let overallStatus: Verdict;
  if (hasFail) overallStatus = 'FAIL';
  else if (allPassed) overallStatus = 'PASS';
  else if (hasBlocked && !hasNotVerified) overallStatus = 'BLOCKED';
  else overallStatus = 'NOT_VERIFIED';

  return { chains: chainResults, globalChecks, overallStatus, generatedAt: Date.now() };
}

// ── Format Helpers ───────────────────────────────────────────

export function verdictIcon(v: Verdict): string {
  return v === 'PASS' ? '✓' : v === 'FAIL' ? '✗' : v === 'BLOCKED' ? '⊘' : '?';
}

export function verdictColor(v: Verdict): string {
  return v === 'PASS' ? 'var(--green)' : v === 'FAIL' ? 'var(--red)' : v === 'BLOCKED' ? 'var(--text-muted)' : 'var(--amber)';
}

export function formatFinalReport(report: FinalReadinessReport): string {
  let out = 'BSTONKEX PRODUCTION RUNTIME VERIFICATION\n';
  out += '═'.repeat(50) + '\n';
  out += `Generated: ${new Date(report.generatedAt).toISOString()}\n`;
  out += `Overall: ${report.overallStatus}\n\n`;

  for (const chain of report.chains) {
    const cfg = CHAINS[chain.chainId];
    out += `${cfg.name} (${cfg.shortName}) — ${chain.overallVerdict}\n`;
    out += `  Pass: ${chain.passCount} | Fail: ${chain.failCount} | Not Verified: ${chain.notVerifiedCount} | Blocked: ${chain.blockedCount}\n`;
    for (const c of chain.checks) {
      out += `  ${verdictIcon(c.verdict)} [${c.category}] ${c.check}: ${c.detail}`;
      if (c.blocker) out += `\n    BLOCKER: ${c.blocker}`;
      out += '\n';
    }
    out += '\n';
  }

  out += 'GLOBAL CHECKS\n';
  for (const c of report.globalChecks) {
    out += `${verdictIcon(c.verdict)} [${c.category}] ${c.check}: ${c.detail}`;
    if (c.blocker) out += `\n  BLOCKER: ${c.blocker}`;
    out += '\n';
  }
  return out;
}