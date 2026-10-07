import type { TradeStatus } from '../lib/trading';

interface Props {
  status: TradeStatus;
  txHash?: string;
  error?: string;
  chainId?: string;
}

const LIFECYCLE_STAGES: { key: string; label: string; statuses: TradeStatus[] }[] = [
  { key: 'quote', label: 'QUOTE', statuses: ['preparing'] },
  { key: 'validate', label: 'VALIDATE', statuses: ['preparing'] },
  { key: 'simulate', label: 'SIMULATE', statuses: ['preparing'] },
  { key: 'sign', label: 'SIGN', statuses: ['awaiting_signature', 'signing', 'awaiting_approval', 'approving'] },
  { key: 'broadcast', label: 'BROADCAST', statuses: ['submitting'] },
  { key: 'pending', label: 'PENDING', statuses: ['pending'] },
  { key: 'confirm', label: 'CONFIRM', statuses: ['pending'] },
  { key: 'confirmed', label: 'DONE', statuses: ['confirmed'] },
];

function getStageState(stage: typeof LIFECYCLE_STAGES[0], current: TradeStatus): 'complete' | 'active' | 'failed' | 'pending' {
  if (current === 'failed') {
    // Find which stage was active
    if (stage.statuses.includes(current) || stage.key === 'sign') return 'failed';
    const idx = LIFECYCLE_STAGES.findIndex(s => s.key === stage.key);
    const signIdx = LIFECYCLE_STAGES.findIndex(s => s.key === 'sign');
    return idx < signIdx ? 'complete' : 'pending';
  }
  if (current === 'confirmed') {
    return stage.key === 'confirmed' ? 'complete' : 'complete';
  }

  // Map current status to stage index
  const statusToStage: Record<string, number> = {
    'preparing': 0,
    'awaiting_approval': 3, 'approving': 3,
    'awaiting_signature': 3, 'signing': 3,
    'submitting': 4,
    'pending': 5,
  };
  const currentIdx = statusToStage[current] ?? -1;
  const stageIdx = LIFECYCLE_STAGES.findIndex(s => s.key === stage.key);

  if (stageIdx < currentIdx) return 'complete';
  if (stageIdx === currentIdx) return 'active';
  return 'pending';
}

export default function TxLifecycle({ status, txHash, error, chainId }: Props) {
  if (status === 'idle') return null;

  const isFailed = status === 'failed';
  const isConfirmed = status === 'confirmed';

  return (
    <div style={{
      padding: 8,
      border: `1px solid ${isFailed ? 'var(--red)' : isConfirmed ? 'var(--green)' : 'var(--amber)'}`,
      background: isFailed ? 'rgba(255,48,96,0.04)' : isConfirmed ? 'rgba(0,255,136,0.04)' : 'rgba(255,170,0,0.04)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
        color: isFailed ? 'var(--red)' : isConfirmed ? 'var(--green)' : 'var(--amber)',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: isFailed ? 'var(--red)' : isConfirmed ? 'var(--green)' : 'var(--amber)',
          animation: !isFailed && !isConfirmed ? 'blink 1s ease-in-out infinite' : 'none',
        }} />
        {isFailed ? 'TRANSACTION FAILED' : isConfirmed ? 'TRADE CONFIRMED' : `STATUS: ${status.toUpperCase().replace(/_/g, ' ')}`}
      </div>

      {/* Progress steps */}
      {!isFailed && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
          {LIFECYCLE_STAGES.map(stage => {
            const state = getStageState(stage, status);
            return (
              <div key={stage.key} style={{
                flex: 1, textAlign: 'center', padding: '2px 0',
                fontSize: 6, fontWeight: 700, letterSpacing: '0.05em',
                background: state === 'complete' ? 'var(--green)' : state === 'active' ? 'var(--amber)' : 'var(--border)',
                color: state === 'complete' || state === 'active' ? 'var(--bg)' : 'var(--text-dim)',
                opacity: state === 'pending' ? 0.4 : 1,
              }}>
                {stage.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {isFailed && error && (
        <div style={{ fontSize: 8, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 4 }}>
          {error}
        </div>
      )}

      {/* TX Hash */}
      {txHash && (
        <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>
          TX: {txHash.slice(0, 10)}...{txHash.slice(-6)}
        </div>
      )}
    </div>
  );
}