// BSTONKEX Token Safety — Pre-trade risk assessment
import type { ChainId } from '../config';
import { getChainAdapter } from './chain-registry';
import { cacheGetOrCompute, CACHE_KEYS, TTL } from './cache';
import { isSandboxed } from './sandbox';

// ── Safety Check Result ──────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SafetyWarning {
  level: RiskLevel;
  label: string;
  detail: string;
}

export interface SafetyReport {
  address: string;
  chainId: ChainId;
  checked: boolean;
  warnings: SafetyWarning[];
  riskLevel: RiskLevel;
  tradeable: boolean; // false = show MARKET DATA ONLY
  checks: {
    contractExists: boolean;
    hasDecimals: boolean;
    hasSymbol: boolean;
    liquidityOk: boolean;
    taxCheckPassed: boolean | null; // null = unknown
    honeypotCheckPassed: boolean | null;
    tradingEnabled: boolean | null;
  };
}

// ── Safety Checks ────────────────────────────────────────────

/** Run safety checks on a token before allowing trade. */
export async function checkTokenSafety(
  chainId: ChainId,
  tokenAddress: string,
): Promise<SafetyReport> {
  return cacheGetOrCompute(`safety:${chainId}:${tokenAddress}`, async () => {
    // In sandbox, skip external calls — report as unchecked
    if (isSandboxed()) {
      return { address: tokenAddress, chainId, checked: false, warnings: [], riskLevel: 'low', tradeable: true, checks: {
        contractExists: true, hasDecimals: true, hasSymbol: true, liquidityOk: true,
        taxCheckPassed: null, honeypotCheckPassed: null, tradingEnabled: true,
      }};
    }

    const adapter = getChainAdapter(chainId);
    const warnings: SafetyWarning[] = [];
    let contractExists = false;
    let hasDecimals = false;
    let hasSymbol = false;
    let liquidityOk = false;
    let taxCheckPassed: boolean | null = null;
    let honeypotCheckPassed: boolean | null = null;
    let tradingEnabled: boolean | null = null;

    if (!adapter) {
      return mkReport(chainId, tokenAddress, warnings, {
        contractExists: false, hasDecimals: false, hasSymbol: false,
        liquidityOk: false, taxCheckPassed: null, honeypotCheckPassed: null, tradingEnabled: null,
      });
    }

    // 1. Check contract existence + metadata
    try {
      const meta = await adapter.getTokenMetadata(tokenAddress);
      contractExists = !!meta.symbol && meta.symbol !== 'UNKNOWN';
      hasDecimals = meta.decimals > 0 && meta.decimals <= 36;
      hasSymbol = !!meta.symbol && meta.symbol !== 'UNKNOWN' && meta.symbol.length <= 12;

      if (!contractExists) {
        warnings.push({ level: 'critical', label: 'CONTRACT NOT FOUND', detail: 'Token contract does not exist on this chain' });
      }
      if (!hasDecimals) {
        warnings.push({ level: 'high', label: 'INVALID DECIMALS', detail: `Decimals: ${meta.decimals}` });
      }
      if (!hasSymbol) {
        warnings.push({ level: 'medium', label: 'NO SYMBOL', detail: 'Token has no recognizable symbol' });
      }
    } catch {
      warnings.push({ level: 'critical', label: 'CONTRACT NOT FOUND', detail: 'Cannot read token contract' });
    }

    // 2. Check liquidity via price feed
    try {
      const price = await adapter.getTokenPriceUsd(tokenAddress);
      if (price !== null && price > 0) {
        liquidityOk = true;
        tradingEnabled = true;
      } else {
        liquidityOk = false;
        warnings.push({ level: 'high', label: 'NO LIQUIDITY', detail: 'No price data — token may not be tradeable' });
      }
    } catch {
      liquidityOk = false;
    }

    // 3. Honeypot / tax check (EVM only, via 1inch quote)
    if (adapter.isEvm) {
      try {
        // Attempt a zero-value sell quote — if it fails, the token may have transfer restrictions
        const testQuote = await adapter.getSwapQuote({
          chainId,
          tokenIn: tokenAddress,
          tokenOut: 'native',
          amountIn: '1000000',
          slippageBps: 500,
          walletAddress: '0x0000000000000000000000000000000000000001',
        });
        if (testQuote.available) {
          honeypotCheckPassed = true;
        } else {
          honeypotCheckPassed = false;
          warnings.push({ level: 'high', label: 'TRADING RESTRICTION DETECTED', detail: 'Token may have sell restrictions' });
        }
      } catch {
        honeypotCheckPassed = null; // inconclusive
      }
    }

    // Determine overall risk level
    return mkReport(chainId, tokenAddress, warnings, {
      contractExists, hasDecimals, hasSymbol, liquidityOk,
      taxCheckPassed, honeypotCheckPassed, tradingEnabled,
    });
  }, TTL.TOKEN_META);
}

function mkReport(
  chainId: ChainId,
  address: string,
  warnings: SafetyWarning[],
  checks: SafetyReport['checks'],
): SafetyReport {
  const levels = warnings.map(w => w.level);
  let riskLevel: RiskLevel = 'low';
  if (levels.includes('critical')) riskLevel = 'critical';
  else if (levels.includes('high')) riskLevel = 'high';
  else if (levels.includes('medium')) riskLevel = 'medium';

  const tradeable = checks.contractExists && checks.hasDecimals && (checks.liquidityOk !== false);

  return { address, chainId, checked: true, warnings, riskLevel, tradeable, checks };
}