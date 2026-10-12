// Cupcak8 Swap — Claim Flow
import { useState } from 'react';
import { formatUsd, MIN_CLAIM_AMOUNT } from '../../lib/config';
import { claimRewards } from '../../lib/referral';

interface Props {
  username: string;
  claimableRewards: number;
  onClaimed: () => void;
}

export default function ClaimFlow({ username, claimableRewards, onClaimed }: Props) {
  const [status, setStatus] = useState<'idle' | 'confirming' | 'claiming' | 'claimed' | 'claim_pending' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [claimedAmount, setClaimedAmount] = useState(0);

  const handleClaim = async () => {
    if (!username) { setError('No username — cannot claim'); setStatus('failed'); return; }
    setStatus('claiming');
    setError('');
    try {
      const result = await claimRewards(username);
      if (result.success && result.pending) {
        setClaimedAmount(result.amount);
        setStatus('claim_pending');
        onClaimed();
      } else if (result.success) {
        setClaimedAmount(result.amount);
        setStatus('claimed');
        onClaimed();
      } else {
        setError(result.error || 'CLAIM FAILED');
        setStatus('failed');
      }
    } catch (e: any) {
      setError(e.message || 'CLAIM FAILED');
      setStatus('failed');
    }
  };

  if (status === 'claimed') {
    return (
      <div className="ref-card" style={{ borderColor: 'var(--lime-dim)', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--lime-dim)', marginBottom: 4 }}>CLAIMED ✓</div>
        <div style={{ fontSize: 11, color: 'var(--text-bright)' }}>{formatUsd(claimedAmount)}</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>Rewards settled</div>
        <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setStatus('idle')}>CLOSE</button>
      </div>
    );
  }

  if (status === 'claim_pending') {
    return (
      <div className="ref-card" style={{ borderColor: 'var(--yellow)', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--yellow-dim)', marginBottom: 4 }}>CLAIM SUBMITTED</div>
        <div style={{ fontSize: 11, color: 'var(--text-bright)' }}>{formatUsd(claimedAmount)}</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
          Your claim has been submitted and is pending backend processing.
        </div>
        <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setStatus('idle')}>CLOSE</button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="ref-card" style={{ borderColor: 'var(--red)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)', marginBottom: 4 }}>CLAIM FAILED</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{error}</div>
        <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setStatus('idle')}>TRY AGAIN</button>
      </div>
    );
  }

  if (status === 'claiming') {
    return (
      <div className="ref-card" style={{ borderColor: 'var(--yellow)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--yellow-dim)', marginBottom: 4 }}>PROCESSING CLAIM...</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>Please wait while your claim is processed</div>
      </div>
    );
  }

  if (status === 'confirming') {
    return (
      <div className="ref-card">
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 8, textAlign: 'center' }}>
          CONFIRM CLAIM
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          <div className="ref-stat-row"><span className="ref-stat-label">AMOUNT</span><span style={{ fontWeight: 700, color: '#E8547C' }}>{formatUsd(claimableRewards)}</span></div>
          <div className="ref-stat-row"><span className="ref-stat-label">MINIMUM</span><span>{formatUsd(MIN_CLAIM_AMOUNT)}</span></div>
          <div className="ref-stat-row"><span className="ref-stat-label">SETTLEMENT</span><span style={{ color: 'var(--text-dim)' }}>BACKEND LEDGER</span></div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-full" onClick={() => setStatus('idle')}>CANCEL</button>
          <button className="btn btn-sm btn-full btn-pink" onClick={handleClaim}>CONFIRM CLAIM</button>
        </div>
      </div>
    );
  }

  // Idle
  if (claimableRewards < MIN_CLAIM_AMOUNT) {
    return (
      <div className="ref-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>MINIMUM CLAIM {formatUsd(MIN_CLAIM_AMOUNT)}</div>
        <div style={{ fontSize: 10, color: 'var(--yellow-dim)', marginTop: 2 }}>{formatUsd(Math.max(0, MIN_CLAIM_AMOUNT - claimableRewards))} more required</div>
      </div>
    );
  }

  return (
    <button className="btn btn-lg btn-pink btn-full" onClick={() => setStatus('confirming')}>
      Claim {formatUsd(claimableRewards)}
    </button>
  );
}