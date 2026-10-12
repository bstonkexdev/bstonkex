// Cupcak8 Swap Cashback Dashboard — full dashboard with 6 metric cards, tier progress, monthly history
import { useState, useEffect, useCallback } from 'react';
import { formatUsd } from '../../lib/config';
import { CASHBACK_TIERS, MIN_CLAIM_AMOUNT } from '../../lib/config';
import { getCashbackPolicy, getUserCashbackRecords, claimCashback, type CashbackPolicy } from '../../lib/engine/cashback-engine';
import { computeDashboardData, type CashbackDashboardData } from '../../lib/engine/cashback-tiers';

interface Props {
  walletAddress: string | null;
  onBack: () => void;
}

export default function CashbackDashboard({ walletAddress, onBack }: Props) {
  const [policy, setPolicy] = useState<CashbackPolicy | null>(null);
  const [data, setData] = useState<CashbackDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const reload = useCallback(async () => {
    if (!walletAddress) { setLoading(false); return; }
    setLoading(true);
    try {
      const [p, records] = await Promise.all([
        getCashbackPolicy(),
        getUserCashbackRecords(walletAddress),
      ]);
      setPolicy(p);
      setData(computeDashboardData(records));
    } catch { /* ignore */ }
    setLoading(false);
  }, [walletAddress]);

  useEffect(() => { reload(); }, [reload]);

  const handleClaim = async () => {
    if (!walletAddress) return;
    setClaiming(true);
    const result = await claimCashback(walletAddress);
    if (result.success) {
      setMsg({ text: `Claim submitted: ${formatUsd(result.amount)}. Status: claim_requested. No funds have been transferred — a verified payout processor is required for actual settlement.`, type: 'success' });
      await reload();
    } else {
      setMsg({ text: result.error || 'Claim failed', type: 'error' });
    }
    setClaiming(false);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DashHeader onBack={onBack} />
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 9 }}>
          Loading cashback data...
        </div>
      </div>
    );
  }

  // ── No wallet ──
  if (!walletAddress || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DashHeader onBack={onBack} />
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 9 }}>
          Unable to load cashback data.
        </div>
      </div>
    );
  }

  // ── Policy disabled ──
  if (!policy?.enabled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DashHeader onBack={onBack} />
        <div style={{
          border: '1px solid var(--border)', borderRadius: 6, padding: '32px 16px',
          textAlign: 'center', background: 'var(--bg)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-dim)', marginBottom: 8,
            fontFamily: 'var(--font-pixel, var(--font))' }}>
            CASHBACK NOT ACTIVE
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto' }}>
            Cashback is disabled. An authorized administrator must configure and enable the
            cashback policy before rewards can accrue. No cashback is being earned on your trades.
          </div>
        </div>
        <TiersReference />
      </div>
    );
  }

  const { currentTier, nextTier, amountToNext, currentMonthVolume, lifetimeVolume,
          totalEarned, totalClaimed, availableToClaim, pendingAmount, reversedAmount, monthlyHistory } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DashHeader onBack={onBack} />

      {msg && (
        <div style={{
          padding: '8px 10px', borderRadius: 4, fontSize: 8, lineHeight: 1.5,
          border: `1px solid ${msg.type === 'success' ? 'var(--lime-dim)' : msg.type === 'error' ? 'var(--red-dim)' : 'var(--cyan-dim)'}`,
          background: msg.type === 'success' ? 'var(--lime-bg)' : msg.type === 'error' ? 'var(--red-bg)' : 'var(--cyan-bg)',
          color: msg.type === 'success' ? 'var(--lime-dim)' : msg.type === 'error' ? 'var(--red)' : '#E8547C',
        }}>
          {msg.text}
        </div>
      )}

      {/* ── 6 Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <MetricCard label="TOTAL ACCUMULATED VOLUME" value={formatUsd(lifetimeVolume)} color="var(--text-bright)" />
        <MetricCard label="THIS MONTH'S VOLUME" value={formatUsd(currentMonthVolume)} color="#E8547C" />
        <MetricCard label="CURRENT TIER" value={currentTier.name} sub={`${currentTier.ratePct}% rate`} color="#E8547C" />
        <MetricCard label="TOTAL CASHBACK EARNED" value={formatUsd(totalEarned)} color="#E8547C" />
        <MetricCard label="TOTAL CLAIMED" value={formatUsd(totalClaimed)} color="var(--lime-dim)" />
        <MetricCard label="AVAILABLE TO CLAIM" value={formatUsd(availableToClaim)} color={availableToClaim > 0 ? '#E8547C' : 'var(--text-bright)'} />
      </div>

      {/* ── Tier Progress ── */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px',
        background: 'var(--bg)',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 900, color: 'var(--text-bright)', marginBottom: 10,
          letterSpacing: '0.1em', fontFamily: 'var(--font-pixel, var(--font))',
        }}>
          MONTHLY TIER PROGRESS
        </div>

        {/* Tier bar */}
        <div style={{
          display: 'flex', gap: 2, marginBottom: 8,
          borderRadius: 3, overflow: 'hidden', height: 8,
          background: 'var(--bg-deep)',
        }}>
          {CASHBACK_TIERS.map((tier, i) => {
            const isActive = i <= CASHBACK_TIERS.findIndex(t => t.name === currentTier.name);
            return (
              <div key={tier.name} style={{
                flex: 1, background: isActive ? '#E8547C' : 'transparent',
                opacity: isActive ? (i === CASHBACK_TIERS.findIndex(t => t.name === currentTier.name) ? 1 : 0.5) : 0.15,
                transition: 'background 0.2s',
              }} />
            );
          })}
        </div>

        {/* Tier labels */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', fontSize: 7, color: 'var(--text-dim)',
          marginBottom: 10,
        }}>
          {CASHBACK_TIERS.map(t => (
            <span key={t.name} style={{
              color: t.name === currentTier.name ? '#E8547C' : 'var(--text-dim)',
              fontWeight: t.name === currentTier.name ? 800 : 400,
            }}>
              {t.name}
            </span>
          ))}
        </div>

        {/* Progress text */}
        <div style={{ fontSize: 8, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Current: <span style={{ color: '#E8547C', fontWeight: 700 }}>{currentTier.name}</span>
          {' '}({currentTier.ratePct}% cashback on eligible platform fees)
          {nextTier ? (
            <>
              {' · '}Next: <span style={{ color: '#E8547C', fontWeight: 700 }}>{nextTier.name}</span>
              {' '}at {formatUsd(nextTier.minVolume)} monthly volume
              {' · '}<span style={{ color: 'var(--yellow-dim)' }}>{formatUsd(amountToNext)} to go</span>
            </>
          ) : (
            <span style={{ color: 'var(--lime-dim)' }}> · Maximum tier reached</span>
          )}
        </div>
      </div>

      {/* ── Pending / Reversed (if any) ── */}
      {(pendingAmount > 0 || reversedAmount > 0) && (
        <div style={{ display: 'flex', gap: 8 }}>
          {pendingAmount > 0 && (
            <div style={{
              flex: 1, padding: '8px 10px', border: '1px solid var(--lime-bg)',
              borderRadius: 4, background: 'var(--lime-bg)', fontSize: 8,
            }}>
              <span style={{ color: 'var(--yellow-dim)' }}>Pending:</span>{' '}
              <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{formatUsd(pendingAmount)}</span>
            </div>
          )}
          {reversedAmount > 0 && (
            <div style={{
              flex: 1, padding: '8px 10px', border: '1px solid var(--red-bg)',
              borderRadius: 4, background: 'var(--red-bg)', fontSize: 8,
            }}>
              <span style={{ color: 'var(--red)' }}>Reversed:</span>{' '}
              <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{formatUsd(reversedAmount)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Claim Section ── */}
      {availableToClaim >= MIN_CLAIM_AMOUNT && (
        <div style={{
          border: '1px solid var(--lime-bg)', borderRadius: 6, padding: '12px 14px',
          background: 'var(--lime-bg)',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 900, color: '#E8547C', marginBottom: 6,
            letterSpacing: '0.1em', fontFamily: 'var(--font-pixel, var(--font))',
          }}>
            CLAIM CASHBACK
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.6 }}>
            {formatUsd(availableToClaim)} available to claim. Submitting will mark rewards as
            "claim_requested" — <strong>no funds will be transferred to your wallet</strong>.
            A verified payout processor is required for actual settlement.
          </div>
          <button
            className="btn btn-pink"
            disabled={claiming}
            onClick={handleClaim}
            style={{ width: '100%' }}
          >
            {claiming ? 'SUBMITTING...' : `REQUEST CLAIM ${formatUsd(availableToClaim)}`}
          </button>
        </div>
      )}

      {/* ── Monthly History Table ── */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
        background: 'var(--bg)',
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
          fontSize: 9, fontWeight: 900, color: 'var(--text-bright)',
          letterSpacing: '0.1em', fontFamily: 'var(--font-pixel, var(--font))',
        }}>
          MONTHLY HISTORY
        </div>

        {monthlyHistory.length === 0 ? (
          <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 8, color: 'var(--text-dim)' }}>
            No cashback records yet. Trades will appear here once cashback is earned.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>MONTH</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>VOLUME</th>
                  <th style={thStyle}>TIER</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>FEES</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>EARNED</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>CLAIMED</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>REMAINING</th>
                </tr>
              </thead>
              <tbody>
                {monthlyHistory.map((row) => (
                  <tr key={row.monthKey} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>{formatMonthKey(row.monthKey)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-bright)' }}>
                      {formatUsd(row.volume)}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '1px 4px', borderRadius: 2,
                        background: 'var(--cyan-bg)', color: '#E8547C',
                        fontSize: 7, fontWeight: 700,
                      }}>
                        {row.finalTier.name}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatUsd(row.eligibleFees)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#E8547C', fontWeight: 700 }}>
                      {formatUsd(row.cashbackEarned)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--lime-dim)' }}>
                      {formatUsd(row.claimed)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.remaining > 0 ? 'var(--yellow-dim)' : 'var(--text-dim)' }}>
                      {formatUsd(row.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tier Reference ── */}
      <TiersReference />

      {/* ── Calculation Details ── */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px',
        background: 'var(--bg)',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 900, color: 'var(--text-bright)', marginBottom: 8,
          letterSpacing: '0.1em', fontFamily: 'var(--font-pixel, var(--font))',
        }}>
          REWARD CALCULATION
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-dim)', lineHeight: 1.8 }}>
          <div>• Cashback is a percentage of the Cupcak8 Swap platform fee (0.40% of trade value), not trade principal.</div>
          <div>• Your tier rate ({currentTier.ratePct}%) is applied to eligible platform fees from your trades.</div>
          <div>• Tier is determined by your eligible trading volume within the current UTC calendar month.</div>
          <div>• At the start of each UTC month, your monthly volume resets to zero and tier resets to Novice.</div>
          <div>• Lifetime volume, reward history, and unpaid balances persist across month boundaries.</div>
          <div>• Referral and cashback rewards are separate — no double-allocation from the same fee.</div>
          <div style={{ color: 'var(--yellow-dim)', marginTop: 4 }}>
            • Settlement is ledger-only. No funds are transferred to your wallet. A verified payout processor is required.
          </div>
          <div style={{ color: 'var(--yellow-dim)', marginTop: 4 }}>
            • Combined referral + cashback rewards are capped at 50% of each collected platform fee.
          </div>
          <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>
            • Referral and cashback are separate ledger allocations — no double-counting from the same fee.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function DashHeader({ onBack }: { onBack: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
    }}>
      <button onClick={onBack} style={{
        padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 3,
        background: 'none', color: 'var(--text-dim)', fontSize: 8, cursor: 'pointer',
        fontFamily: 'var(--font-pixel, var(--font))',
      }}>
        {'<'}
      </button>
      <div style={{
        fontSize: 14, fontWeight: 900, color: '#E8547C', letterSpacing: '0.15em',
        fontFamily: 'var(--font-pixel, var(--font))',
      }}>
        CASHBACK DASHBOARD
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px',
      background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{
        fontSize: 7, color: 'var(--text-dim)', letterSpacing: '0.08em',
        fontFamily: 'var(--font-pixel, var(--font))',
      }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, color }}>{value}</div>
      {sub && <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>{sub}</div>}
    </div>
  );
}

function TiersReference() {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px',
      background: 'var(--bg)',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 900, color: 'var(--text-bright)', marginBottom: 8,
        letterSpacing: '0.1em', fontFamily: 'var(--font-pixel, var(--font))',
      }}>
        CASHBACK TIERS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {CASHBACK_TIERS.map(t => (
          <div key={t.name} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 8px', borderRadius: 3,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#E8547C' }}>{t.name}</span>
            <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>
              {t.maxVolume ? `${formatUsd(t.minVolume)} – ${formatUsd(t.maxVolume)}` : `${formatUsd(t.minVolume)}+`}
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#E8547C' }}>{t.ratePct}%</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 7, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.5 }}>
        Tier is determined by your eligible trading volume within the current UTC calendar month.
        Volume resets at the start of each month.
      </div>
    </div>
  );
}

function formatMonthKey(mk: string): string {
  const [y, m] = mk.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600,
  color: 'var(--text-dim)', fontSize: 7, letterSpacing: '0.05em',
  fontFamily: 'var(--font-pixel, var(--font))',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 10px', color: 'var(--text)', whiteSpace: 'nowrap',
};