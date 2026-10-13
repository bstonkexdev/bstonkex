// Cupcak8 Swap — Automated On-Chain Security Audit Worker
// Runs RugCheck (Solana) + GoPlus (EVM) in background, caches 5min,
// attaches SecurityFlags to token records in the trenches store.

import { hsetAll, getCached, setCached, hgetall } from './trenches-store.js';

const RUGCHECK_BASE = 'https://api.rugcheck.xyz/v1';
const GOPLUS_BASE = 'https://api.gopluslabs.io/api/v1';
const CACHE_TTL = 5 * 60_000; // 5 minutes
const AUDIT_DELAY = 2_000; // Wait 2s after token creation before auditing

interface SecurityResult {
  risk: 'safe' | 'caution' | 'risky' | 'danger' | 'unknown';
  score: number | null;
  mintAuthority: boolean | null;
  freezeAuthority: boolean | null;
  lpLockedPct: number | null;
  top10Pct: number | null;
  honeypot: boolean | null;
  buyTaxPct: number | null;
  sellTaxPct: number | null;
  auditedAt: number;
}

// Pending audit queue (debounce)
const pending = new Map<string, { chainId: string; address: string }>();
let processing = false;

/** Queue a token for security audit (debounced). */
export function queueSecurityAudit(chainId: string, address: string): void {
  const key = `${chainId}:${address}`;
  if (getCached(`sec:${key}`)) return; // Already audited
  pending.set(key, { chainId, address });
}

/** Process the audit queue. Call periodically or on-demand. */
export async function processAuditQueue(): Promise<number> {
  if (processing || pending.size === 0) return 0;
  processing = true;
  let audited = 0;

  try {
    for (const [key, { chainId, address }] of pending) {
      pending.delete(key);
      if (getCached(`sec:${key}`)) continue;

      try {
        const result = chainId === 'solana'
          ? await auditSolana(address)
          : await auditEvm(chainId, address);

        setCached(`sec:${key}`, result, CACHE_TTL);

        // Store in trenches hash
        hsetAll(`token:${address}`, {
          secRisk: result.risk,
          secScore: String(result.score ?? ''),
          secMintAuth: String(result.mintAuthority ?? ''),
          secFreezeAuth: String(result.freezeAuthority ?? ''),
          secLpLocked: String(result.lpLockedPct ?? ''),
          secTop10: String(result.top10Pct ?? ''),
          secHoneypot: String(result.honeypot ?? ''),
          secBuyTax: String(result.buyTaxPct ?? ''),
          secSellTax: String(result.sellTaxPct ?? ''),
          secAuditedAt: String(result.auditedAt),
        });

        audited++;
      } catch {
        // Audit failed — cache a 'unknown' result to avoid retry loops
        const unknown: SecurityResult = {
          risk: 'unknown', score: null, mintAuthority: null, freezeAuthority: null,
          lpLockedPct: null, top10Pct: null, honeypot: null, buyTaxPct: null, sellTaxPct: null,
          auditedAt: Date.now(),
        };
        setCached(`sec:${key}`, unknown, 60_000); // Short TTL for failures
      }

      // Rate limit: 1 audit per 500ms
      await new Promise(r => setTimeout(r, 500));
    }
  } finally {
    processing = false;
  }

  return audited;
}

/** Audit a Solana token via RugCheck. */
async function auditSolana(mint: string): Promise<SecurityResult> {
  const res = await fetch(`${RUGCHECK_BASE}/tokens/${mint}/report/summary`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RugCheck ${res.status}`);
  const data = await res.json();

  const score = data.score ?? null;
  const risk = score == null ? 'unknown' : score >= 80 ? 'safe' : score >= 50 ? 'caution' : score >= 20 ? 'risky' : 'danger';

  return {
    risk,
    score,
    mintAuthority: data.mintAuthority ?? false,
    freezeAuthority: data.freezeAuthority ?? false,
    lpLockedPct: data.lpLockedPct ?? null,
    top10Pct: data.topHoldersPct ?? null,
    honeypot: null,
    buyTaxPct: null,
    sellTaxPct: null,
    auditedAt: Date.now(),
  };
}

/** Audit an EVM token via GoPlus. */
async function auditEvm(chainId: string, address: string): Promise<SecurityResult> {
  const chainNum = chainId === 'bsc' ? '56' : chainId === 'base' ? '8453' : null;
  if (!chainNum) throw new Error(`Unsupported chain: ${chainId}`);

  const res = await fetch(
    `${GOPLUS_BASE}/token_security/${chainNum}?contract_addresses=${address.toLowerCase()}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`GoPlus ${res.status}`);
  const json = await res.json();
  const token = json.result?.[address.toLowerCase()];
  if (!token) throw new Error('Token not found in GoPlus');

  const honeypot = token.is_honeypot === '1';
  const buyTax = parseFloat(token.buy_tax || '0') * 100;
  const sellTax = parseFloat(token.sell_tax || '0') * 100;
  const top10 = token.holder_count ? null : null; // GoPlus doesn't always provide

  const risk = honeypot ? 'danger'
    : sellTax > 10 ? 'risky'
    : buyTax > 5 || sellTax > 5 ? 'caution'
    : 'safe';

  return {
    risk,
    score: honeypot ? 0 : sellTax > 10 ? 20 : sellTax > 5 ? 50 : 85,
    mintAuthority: null,
    freezeAuthority: null,
    lpLockedPct: null,
    top10Pct: top10,
    honeypot,
    buyTaxPct: buyTax,
    sellTaxPct: sellTax,
    auditedAt: Date.now(),
  };
}

/** Get security result from cache. */
export function getSecurityResult(chainId: string, address: string): SecurityResult | null {
  return getCached(`sec:${chainId}:${address}`);
}

/** Start periodic audit processing. */
export function startSecurityWorker(intervalMs = 10_000): () => void {
  const timer = setInterval(() => processAuditQueue().catch(() => {}), intervalMs);
  return () => clearInterval(timer);
}
