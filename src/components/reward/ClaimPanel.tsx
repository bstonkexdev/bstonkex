// Cupcak8 Swap — Claim request panel, $10 minimum
import { useState } from 'react';
import { submitClaim } from '../../lib/reward-api';
import type { BackendRewardSummary, ClaimRecord } from '../../lib/reward-types';
import { MIN_CLAIM_USD } from '../../lib/reward-rules';
import { formatUsd } from '../../lib/config';

interface Props {
  summary: BackendRewardSummary | null;
  claims: ClaimRecord[];
  onClaimSubmitted: () => void;
}

export default function ClaimPanel({ summary, claims, onClaimSubmitted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const claimable = summary ? summary.claimableCashback + summary.claimableReferral : null;
  const canClaim = claimable !== null && claimable >= MIN_CLAIM_USD;

  const hasRecentClaim = claims.some(c =>
    c.status === 'claim_requested' || c.status === 'processing'
  );

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitClaim('combined');
      setSuccess(result.message);
      onClaimSubmitted();
    } catch (e: any) {
      setError(e.message || 'Claim request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      padding: 16, background: 'var(--bg-surface)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, color: 'var(--text-bright)',
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12,
      }}>
        Claim Rewards
      </div>

      {claimable === null ? (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Loading claimable balance...</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
            Available: <span style={{ fontWeight: 800, color: '#E8547C' }}>{formatUsd(claimable)}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 12 }}>
            Minimum claim: ${MIN_CLAIM_USD.toFixed(2)}
          </div>

          {hasRecentClaim && (
            <div style={{
              padding: '8px 12px', background: 'var(--yellow-bg)',
              border: '1px solid var(--yellow)', borderRadius: 'var(--radius-sm)',
              fontSize: 10, color: 'var(--yellow-dim)', marginBottom: 12,
            }}>
              You have a pending claim request. It will be processed after verification.
            </div>
          )}

          <button
            onClick={handleClaim}
            disabled={!canClaim || loading || hasRecentClaim}
            style={{
              width: '100%', padding: '10px 16px',
              background: canClaim && !loading && !hasRecentClaim ? '#E8547C' : 'var(--bg-elevated)',
              border: `1px solid ${canClaim && !loading && !hasRecentClaim ? '#E8547C' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              color: canClaim && !loading && !hasRecentClaim ? '#fff' : 'var(--text-dim)',
              fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
              textTransform: 'uppercase', cursor: canClaim && !loading && !hasRecentClaim ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'SUBMITTING...' : hasRecentClaim ? 'CLAIM PENDING' : `REQUEST CLAIM (MIN $${MIN_CLAIM_USD})`}
          </button>
        </>
      )}

      {error && (
        <div style={{
          marginTop: 10, padding: '8px 12px', background: 'var(--red-bg)',
          border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)',
          color: 'var(--red)', fontSize: 11,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          marginTop: 10, padding: '8px 12px', background: 'var(--lime-bg)',
          border: '1px solid var(--lime-dim)', borderRadius: 'var(--radius-sm)',
          color: 'var(--lime-dim)', fontSize: 11,
        }}>
          {success}
        </div>
      )}
    </div>
  );
}