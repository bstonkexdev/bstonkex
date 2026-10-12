// Cupcak8 Swap History & Claims — Cupcak8 pink themed
import { useState, useMemo } from 'react';
import { formatUsd } from '../../lib/config';
import type { UnifiedHistoryEntry } from '../../lib/rewards';
import type { ClaimRecord } from '../../lib/referral';

interface Props {
  history: UnifiedHistoryEntry[];
  claims: ClaimRecord[];
  onClaimReferral: () => void;
  onClaimCashback: () => void;
  claimableReferral: number;
  claimableCashback: number;
}

type SourceFilter = 'all' | 'referral' | 'cashback';
type StatusFilter = 'all' | 'pending' | 'claimable' | 'claimed';

export default function HistoryClaims({
  history, claims, onClaimReferral, onClaimCashback, claimableReferral, claimableCashback,
}: Props) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tab, setTab] = useState<'history' | 'claims'>('history');

  const filtered = useMemo(() => {
    let items = history;
    if (sourceFilter !== 'all') items = items.filter(h => h.source === sourceFilter);
    if (statusFilter !== 'all') items = items.filter(h => h.status === statusFilter);
    return items;
  }, [history, sourceFilter, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className={`btn btn-sm ${tab === 'history' ? 'btn-pink' : ''}`}
          onClick={() => setTab('history')}
        >
          HISTORY
        </button>
        <button
          className={`btn btn-sm ${tab === 'claims' ? 'btn-pink' : ''}`}
          onClick={() => setTab('claims')}
        >
          CLAIMS
        </button>
      </div>

      {tab === 'history' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {(['all', 'referral', 'cashback'] as SourceFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  style={{
                    fontSize: 9, padding: '4px 10px',
                    background: sourceFilter === s ? 'rgba(232,84,124,0.08)' : 'transparent',
                    border: `1px solid ${sourceFilter === s ? '#E8547C' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    color: sourceFilter === s ? '#E8547C' : 'var(--text-dim)',
                    fontWeight: sourceFilter === s ? 700 : 400,
                  }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {(['all', 'pending', 'claimable', 'claimed'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    fontSize: 9, padding: '4px 10px',
                    background: statusFilter === s ? 'rgba(232,84,124,0.08)' : 'transparent',
                    border: `1px solid ${statusFilter === s ? '#E8547C' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    color: statusFilter === s ? '#E8547C' : 'var(--text-dim)',
                    fontWeight: statusFilter === s ? 700 : 400,
                  }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* History Table */}
          <div className="ref-card" style={{ padding: 0, overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 10, color: 'var(--text-dim)' }}>
                No reward history found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>DATE</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>SOURCE</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>VOLUME</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>FEE</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>REWARD</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 100).map((entry, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>
                          {new Date(entry.date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontSize: 8, fontWeight: 700,
                            background: entry.source === 'referral' ? 'rgba(232,84,124,0.08)' : 'rgba(184,169,232,0.08)',
                            color: entry.source === 'referral' ? '#E8547C' : 'var(--lavender)',
                          }}>
                            {entry.source.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-bright)' }}>
                          {formatUsd(entry.tradeVolume)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-dim)' }}>
                          {formatUsd(entry.feeGenerated)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--lime-dim)', fontWeight: 700 }}>
                          {formatUsd(entry.reward)}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontSize: 8, fontWeight: 700,
                            color: entry.status === 'claimed' ? 'var(--lime-dim)' : entry.status === 'claimable' ? '#E8547C' : 'var(--yellow-dim)',
                          }}>
                            {entry.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'claims' && (
        <>
          {/* Claim Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {claimableReferral >= 10 && (
              <button className="btn btn-pink" onClick={onClaimReferral}>
                Claim Referral ({formatUsd(claimableReferral)})
              </button>
            )}
            {claimableCashback >= 10 && (
              <button className="btn btn-pink" onClick={onClaimCashback}>
                Claim Cashback ({formatUsd(claimableCashback)})
              </button>
            )}
          </div>

          {/* Claim History */}
          <div className="ref-card" style={{ padding: 0, overflow: 'hidden' }}>
            {claims.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 10, color: 'var(--text-dim)' }}>
                No claims yet. Rewards are ledger-settled — no wallet transfer occurs.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>DATE</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>AMOUNT</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>STATUS</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>NOTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.slice(0, 50).map((claim, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>
                          {new Date(claim.date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--lime-dim)', fontWeight: 700 }}>
                          {formatUsd(claim.amount)}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontSize: 8, fontWeight: 700,
                            color: claim.status === 'confirmed' ? 'var(--lime-dim)' : 'var(--yellow-dim)',
                          }}>
                            {claim.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-dim)', fontSize: 9 }}>
                          Ledger-settled
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: '6px 0', lineHeight: 1.6 }}>
            Claims are recorded in the Cupcak8 Swap ledger. This does not transfer funds to your wallet.
            A verified payout processor is required for actual fund disbursement.
          </div>
        </>
      )}
    </div>
  );
}