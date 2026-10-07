import { useState } from 'react';
import { formatUsd, MIN_CLAIM_AMOUNT } from '../../lib/config';
import { claimRewards } from '../../lib/engine/fee-engine';

interface Props {
  claimableRewards: number;
  onClaimed: () => void;
}

export default function ClaimFlow({ claimableRewards, onClaimed }: Props) {
  const [status, setStatus] = useState<'idle' | 'confirming' | 'claiming' | 'claimed' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [claimedAmount, setClaimedAmount] = useState(0);

  const handleClaim = async () => {
    setStatus('claiming');
    setError('');
    try {
      // In production, this would call the backend claim API
      // which handles the actual settlement
      const result = await claimRewards('');
      if (result.success) {
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
      <div style={{
        padding: 12, border: '1px solid var(--green)', background: 'var(--green-bg)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--green)', marginBottom: 4 }}>CLAIMED ✓</div>
        <div style={{ fontSize: 10, color: 'var(--text-bright)' }}>{formatUsd(claimedAmount)}</div>
        <div style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 4 }}>Rewards have been settled</div>
        <button className="btn btn-sm" style={{ marginTop: 8, fontSize: 8 }} onClick={() => setStatus('idle')}>CLOSE</button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div style={{ padding: 12, border: '1px solid var(--red)', background: 'var(--red-bg)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)', marginBottom: 4 }}>CLAIM FAILED</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{error}</div>
        <button className="btn btn-sm" style={{ marginTop: 8, fontSize: 8 }} onClick={() => setStatus('idle')}>TRY AGAIN</button>
      </div>
    );
  }

  if (status === 'claiming') {
    return (
      <div style={{ padding: 12, border: '1px solid var(--amber)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>PROCESSING CLAIM...</div>
        <div className="led-sm led-amber led-blink" style={{ margin: '8px auto' }} />
        <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>Please wait while your claim is processed</div>
      </div>
    );
  }

  if (status === 'confirming') {
    return (
      <div style={{ padding: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 8, textAlign: 'center' }}>
          CONFIRM CLAIM
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
            <span style={{ color: 'var(--text-dim)' }}>AMOUNT</span>
            <span style={{ fontWeight: 700, color: 'var(--green)' }}>{formatUsd(claimableRewards)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
            <span style={{ color: 'var(--text-dim)' }}>MINIMUM</span>
            <span>{formatUsd(MIN_CLAIM_AMOUNT)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
            <span style={{ color: 'var(--text-dim)' }}>SETTLEMENT</span>
            <span style={{ color: 'var(--text-dim)' }}>BACKEND</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-full" onClick={() => setStatus('idle')}>CANCEL</button>
          <button className="btn btn-sm btn-full btn-green" onClick={handleClaim}>CONFIRM CLAIM</button>
        </div>
      </div>
    );
  }

  // Idle
  if (claimableRewards < MIN_CLAIM_AMOUNT) {
    return (
      <div style={{ padding: 8, fontSize: 8, color: 'var(--text-dim)', textAlign: 'center' }}>
        MINIMUM CLAIM {formatUsd(MIN_CLAIM_AMOUNT)}<br />
        <span style={{ color: 'var(--amber)' }}>{formatUsd(MIN_CLAIM_AMOUNT - claimableRewards)} more required</span>
      </div>
    );
  }

  return (
    <button className="btn btn-lg btn-green btn-full" onClick={() => setStatus('confirming')}>
      CLAIM {formatUsd(claimableRewards)}
    </button>
  );
}