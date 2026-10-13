// Cupcak8 Swap — External Token Safety Audits
// Real-time risk assessment using RugCheck (Solana) and GoPlus (EVM).
// Integrates with the existing token-safety.ts pipeline.
//
// Sources:
//   - RugCheck API: https://api.rugcheck.xyz/v1/tokens/{mint}/report/summary
//   - GoPlus API: https://api.gopluslabs.io/api/v1/token_security/{chainId}
//
// These provide REAL contract analysis: mint authority, freeze, honeypot,
// tax rates, LP lock status, holder concentration, etc.

import { cacheGetOrCompute, TTL } from './cache';
import { isSandboxed } from './sandbox';
import type { ChainId } from '../config';

// ── Types ────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface DangerFlag {
  severity: RiskLevel;
  label: string;
  detail: string;
}

export interface ExternalAuditResult {
  address: string;
  chainId: ChainId;
  source: 'rugcheck' | 'goplus' | 'unavailable';
  checked: boolean;
  score: number | null;         // RugCheck score (lower = safer), null for GoPlus
  riskLevel: RiskLevel;
  dangerFlags: DangerFlag[];
  raw: Record<string, unknown>; // raw API data for display
}

// ── RugCheck (Solana) ───────────────────────────────────────

/**
 * Audit a Solana token using RugCheck API.
 * Returns mint authority, freeze authority, LP lock %, holder concentration.
 */
export async function auditSolanaToken(mintAddress: string): Promise<ExternalAuditResult> {
  return cacheGetOrCompute(`rugcheck:${mintAddress}`, async () => {
    if (isSandboxed()) {
      return {
        address: mintAddress, chainId: 'solana', source: 'unavailable',
        checked: false, score: null, riskLevel: 'low', dangerFlags: [], raw: {},
      };
    }

    try {
      const resp = await fetch(
        `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report/summary`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) throw new Error(`RugCheck HTTP ${resp.status}`);
      const data = await resp.json();

      const isMintable = data.mintAuthority !== null && data.mintAuthority !== undefined;
      const isFreezable = data.freezeAuthority !== null && data.freezeAuthority !== undefined;
      const lpLockedPct = data.lpLockedPct ?? 0;
      const top10Pct = data.topHoldersPct ?? 0;
      const score = data.score ?? 0;

      const dangerFlags: DangerFlag[] = [];

      if (isMintable) {
        dangerFlags.push({ severity: 'high', label: 'Mint Active', detail: 'Creator can mint unlimited new tokens' });
      }
      if (isFreezable) {
        dangerFlags.push({ severity: 'critical', label: 'Freeze Active', detail: 'Creator can freeze your wallet' });
      }
      if (lpLockedPct < 80) {
        dangerFlags.push({ severity: 'high', label: 'LP Unlocked', detail: `Only ${lpLockedPct.toFixed(1)}% of LP is locked` });
      }
      if (top10Pct > 25) {
        dangerFlags.push({ severity: 'medium', label: `Top 10 holds ${top10Pct.toFixed(1)}%`, detail: 'High holder concentration — dump risk' });
      }

      // Compute risk level from flags + score
      const hasCritical = dangerFlags.some(f => f.severity === 'critical');
      const hasHigh = dangerFlags.some(f => f.severity === 'high');
      const riskLevel: RiskLevel = hasCritical ? 'critical' : hasHigh ? 'high' : score < 30 ? 'low' : 'medium';

      return {
        address: mintAddress,
        chainId: 'solana',
        source: 'rugcheck',
        checked: true,
        score,
        riskLevel,
        dangerFlags,
        raw: {
          mintAuthority: data.mintAuthority ?? null,
          freezeAuthority: data.freezeAuthority ?? null,
          lpLockedPct,
          topHoldersPct: top10Pct,
          score,
        },
      };
    } catch {
      return {
        address: mintAddress, chainId: 'solana', source: 'unavailable',
        checked: false, score: null, riskLevel: 'medium',
        dangerFlags: [{ severity: 'medium', label: 'Unverified', detail: 'RugCheck API unavailable' }],
        raw: {},
      };
    }
  }, TTL.SAFETY);
}

// ── GoPlus (EVM: BSC, Base, ETH) ────────────────────────────

const EVM_CHAIN_ID_MAP: Record<string, string> = {
  bsc: '56',
  base: '8453',
  ethereum: '1',
  eth: '1',
};

/**
 * Audit an EVM token using GoPlus API.
 * Returns honeypot detection, buy/sell tax, mintable, ownership takeover risk.
 */
export async function auditEVMToken(
  contractAddress: string,
  chainId: ChainId = 'bsc',
): Promise<ExternalAuditResult> {
  const goPlusChainId = EVM_CHAIN_ID_MAP[chainId] ?? '56';

  return cacheGetOrCompute(`goplus:${chainId}:${contractAddress}`, async () => {
    if (isSandboxed()) {
      return {
        address: contractAddress, chainId, source: 'unavailable',
        checked: false, score: null, riskLevel: 'low', dangerFlags: [], raw: {},
      };
    }

    try {
      const resp = await fetch(
        `https://api.gopluslabs.io/api/v1/token_security/${goPlusChainId}?contract_addresses=${contractAddress}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) throw new Error(`GoPlus HTTP ${resp.status}`);
      const data = await resp.json();
      const result = data.result?.[contractAddress.toLowerCase()];

      if (!result) {
        return {
          address: contractAddress, chainId, source: 'unavailable',
          checked: false, score: null, riskLevel: 'medium',
          dangerFlags: [{ severity: 'medium', label: 'Data Unavailable', detail: 'GoPlus has no data for this contract' }],
          raw: {},
        };
      }

      const isHoneypot = result.is_honeypot === '1';
      const buyTax = parseFloat(result.buy_tax || '0') * 100;
      const sellTax = parseFloat(result.sell_tax || '0') * 100;
      const isMintable = result.is_mintable === '1';
      const canTakeOwnership = result.can_take_back_ownership === '1';
      const isProxy = result.is_proxy === '1';
      const isOpenSource = result.is_open_source === '1';

      const dangerFlags: DangerFlag[] = [];

      if (isHoneypot) {
        dangerFlags.push({ severity: 'critical', label: 'HONEYPOT', detail: 'You cannot sell this token' });
      }
      if (sellTax > 10) {
        dangerFlags.push({ severity: 'high', label: `High Sell Tax (${sellTax.toFixed(1)}%)`, detail: 'You lose a large % when selling' });
      }
      if (buyTax > 10) {
        dangerFlags.push({ severity: 'medium', label: `High Buy Tax (${buyTax.toFixed(1)}%)`, detail: 'You pay extra when buying' });
      }
      if (isMintable) {
        dangerFlags.push({ severity: 'high', label: 'Mintable', detail: 'Owner can mint new tokens' });
      }
      if (canTakeOwnership) {
        dangerFlags.push({ severity: 'high', label: 'Owner Proxy', detail: 'Ownership can be taken back' });
      }
      if (!isOpenSource) {
        dangerFlags.push({ severity: 'medium', label: 'Closed Source', detail: 'Contract code is not verified' });
      }

      const hasCritical = dangerFlags.some(f => f.severity === 'critical');
      const hasHigh = dangerFlags.some(f => f.severity === 'high');
      const riskLevel: RiskLevel = hasCritical ? 'critical' : hasHigh ? 'high' : dangerFlags.length > 0 ? 'medium' : 'low';

      return {
        address: contractAddress,
        chainId,
        source: 'goplus',
        checked: true,
        score: null,
        riskLevel,
        dangerFlags,
        raw: {
          isHoneypot,
          buyTax,
          sellTax,
          isMintable,
          canTakeOwnership,
          isProxy,
          isOpenSource,
        },
      };
    } catch {
      return {
        address: contractAddress, chainId, source: 'unavailable',
        checked: false, score: null, riskLevel: 'medium',
        dangerFlags: [{ severity: 'medium', label: 'Unverified', detail: 'GoPlus API unavailable' }],
        raw: {},
      };
    }
  }, TTL.SAFETY);
}

// ── Unified Audit Router ─────────────────────────────────────

/**
 * Run external safety audit for any chain.
 * Solana → RugCheck, EVM (BSC/Base/ETH) → GoPlus.
 */
export async function auditTokenExternal(
  chainId: ChainId,
  address: string,
): Promise<ExternalAuditResult> {
  if (chainId === 'solana') {
    return auditSolanaToken(address);
  }
  return auditEVMToken(address, chainId);
}

/**
 * Get a quick risk summary for UI badges.
 * Returns null if audit is unavailable.
 */
export function getRiskSummary(result: ExternalAuditResult): {
  level: RiskLevel;
  label: string;
  flagCount: number;
} | null {
  if (!result.checked) return null;

  const labels: Record<RiskLevel, string> = {
    low: 'Safe',
    medium: 'Caution',
    high: 'Risky',
    critical: 'Danger',
  };

  return {
    level: result.riskLevel,
    label: labels[result.riskLevel],
    flagCount: result.dangerFlags.length,
  };
}
