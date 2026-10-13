// Cupcak8 Swap — Security Badges
// Real-time token risk badges using RugCheck + GoPlus external audits.
// Displays honeypot, mint, freeze, LP lock, holder concentration warnings.

import { useState, useEffect } from 'react';
import { auditTokenExternal, getRiskSummary, type ExternalAuditResult, type RiskLevel } from '../../lib/engine/external-safety';
import type { ChainId } from '../../lib/config';

// ── Risk Level Colors ────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'bg-emerald-950 text-emerald-400 border-emerald-800',
  medium: 'bg-yellow-900/60 text-yellow-300 border-yellow-600/50',
  high: 'bg-orange-950 text-orange-400 border-orange-800',
  critical: 'bg-red-900/80 text-red-300 border-red-500',
};

// ── Individual Badge ─────────────────────────────────────────

function Badge({
  children,
  variant = 'neutral',
  pulse = false,
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'safe' | 'warn' | 'danger';
  pulse?: boolean;
}) {
  const styles = {
    neutral: 'bg-gray-800 text-gray-300 border-gray-700',
    safe: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    warn: 'bg-yellow-900/60 text-yellow-300 border-yellow-600/50',
    danger: 'bg-red-900/80 text-red-300 border-red-500',
  };

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border font-mono text-[10px] whitespace-nowrap ${
        styles[variant]
      } ${pulse ? 'animate-pulse' : ''}`}
    >
      {children}
    </span>
  );
}

// ── Main Security Badges Component ───────────────────────────

export interface SecurityBadgesProps {
  chainId: ChainId;
  address: string;
  /** Pre-fetched audit result (optional — fetches on mount if not provided) */
  audit?: ExternalAuditResult | null;
  /** Compact mode — show only critical warnings */
  compact?: boolean;
}

export function SecurityBadges({ chainId, address, audit: preFetched, compact = false }: SecurityBadgesProps) {
  const [audit, setAudit] = useState<ExternalAuditResult | null>(preFetched ?? null);
  const [loading, setLoading] = useState(!preFetched);

  useEffect(() => {
    if (preFetched) {
      setAudit(preFetched);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    auditTokenExternal(chainId, address)
      .then(result => {
        if (!cancelled) {
          setAudit(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [chainId, address, preFetched]);

  if (loading) {
    return (
      <div className="flex items-center gap-1">
        <div className="w-12 h-4 bg-gray-800 rounded animate-pulse" />
        <div className="w-16 h-4 bg-gray-800 rounded animate-pulse" />
      </div>
    );
  }

  if (!audit || !audit.checked) return null;

  const isSolana = chainId === 'solana';
  const raw = audit.raw as Record<string, any>;

  // In compact mode, only show critical/high risks
  const showAll = !compact;

  return (
    <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
      {/* Risk Level Badge */}
      <span className={`px-1.5 py-0.5 rounded border font-bold ${RISK_COLORS[audit.riskLevel]}`}>
        {getRiskSummary(audit)?.label ?? 'Unknown'}
        {audit.score != null && ` · ${audit.score}`}
      </span>

      {/* Honeypot (EVM) */}
      {raw.isHoneypot && (
        <Badge variant="danger" pulse>
          🚨 HONEYPOT
        </Badge>
      )}

      {/* Mint Authority */}
      {(raw.isMintable || (isSolana && raw.mintAuthority)) ? (
        <Badge variant="warn">⚠️ Mint</Badge>
      ) : showAll ? (
        <Badge variant="safe">✓ No Mint</Badge>
      ) : null}

      {/* Freeze Authority (Solana) */}
      {(isSolana && raw.freezeAuthority) && (
        <Badge variant="danger">❄️ Freeze</Badge>
      )}

      {/* LP Lock (Solana) */}
      {isSolana && raw.lpLockedPct != null && (
        raw.lpLockedPct < 80 ? (
          <Badge variant="warn">🔓 LP {raw.lpLockedPct.toFixed(0)}%</Badge>
        ) : showAll ? (
          <Badge variant="safe">🔒 LP {raw.lpLockedPct.toFixed(0)}%</Badge>
        ) : null
      )}

      {/* Top 10 Holders (Solana) */}
      {isSolana && raw.topHoldersPct > 20 && (
        <Badge variant="warn">👥 Top10: {raw.topHoldersPct.toFixed(0)}%</Badge>
      )}

      {/* Sell Tax (EVM) */}
      {!isSolana && raw.sellTax > 10 && (
        <Badge variant="danger">💸 Sell Tax {raw.sellTax.toFixed(0)}%</Badge>
      )}

      {/* Buy Tax (EVM) */}
      {!isSolana && raw.buyTax > 10 && (
        <Badge variant="warn">💸 Buy Tax {raw.buyTax.toFixed(0)}%</Badge>
      )}

      {/* Closed Source (EVM) */}
      {!isSolana && raw.isOpenSource === false && showAll && (
        <Badge variant="warn">🔍 Closed Source</Badge>
      )}
    </div>
  );
}

export default SecurityBadges;
