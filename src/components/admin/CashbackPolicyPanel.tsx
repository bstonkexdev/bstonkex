// Cupcak8 Swap Cashback Policy Panel — admin-only cashback configuration
import { useState, useEffect } from 'react';
import type { WalletState } from '../../lib/wallet';
import { getCashbackPolicy, updateCashbackPolicy, type CashbackPolicy } from '../../lib/engine/cashback-engine';

interface Props {
  wallet: WalletState;
}

export default function CashbackPolicyPanel({ wallet }: Props) {
  const [policy, setPolicy] = useState<CashbackPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [rateBps, setRateBps] = useState(0);
  const [claimMin, setClaimMin] = useState(10);
  const [exclusions, setExclusions] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmEnable, setConfirmEnable] = useState(false);

  useEffect(() => {
    getCashbackPolicy().then(p => {
      setPolicy(p);
      setRateBps(p.rateBps);
      setClaimMin(p.claimMinimum);
      setExclusions(p.exclusions.join(', '));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!wallet.address) return;
    setSaving(true);
    const result = await updateCashbackPolicy({
      rateBps,
      ratePct: rateBps / 100,
      claimMinimum: claimMin,
      exclusions: exclusions.split(',').map(s => s.trim()).filter(Boolean),
      enabled: confirmEnable,
    }, wallet.address);

    if (result.ok) {
      setMsg(confirmEnable ? 'Cashback policy ENABLED' : 'Cashback policy saved (disabled)');
      setEditing(false);
      setConfirmEnable(false);
      const updated = await getCashbackPolicy();
      setPolicy(updated);
    } else {
      setMsg(result.error || 'Failed to save');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 5000);
  };

  if (loading) {
    return <div style={{ padding: 16, fontSize: 8, color: 'var(--text-dim)' }}>Loading cashback policy...</div>;
  }

  if (!policy) {
    return <div style={{ padding: 16, fontSize: 8, color: 'var(--red)' }}>Failed to load cashback policy</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 0', borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.06em', marginBottom: 4 }}>
            CASHBACK POLICY
          </div>
          <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>
            Configure trading cashback for all users. Disabled until explicitly enabled.
          </div>
        </div>
        <span style={{
          padding: '3px 8px', borderRadius: 3, fontSize: 7, fontWeight: 900,
          background: policy.enabled ? 'var(--lime-bg)' : 'var(--bg-elevated)',
          color: policy.enabled ? 'var(--green)' : 'var(--text-dim)',
          border: `1px solid ${policy.enabled ? 'var(--green)' : 'var(--border)'}`,
        }}>
          {policy.enabled ? 'ENABLED' : 'DISABLED'}
        </span>
      </div>

      {/* Policy Display */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        padding: 12, borderRadius: 6, border: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        <div style={{ fontSize: 7 }}>
          <span style={{ color: 'var(--text-dim)' }}>Rate: </span>
          <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{(policy.rateBps / 100).toFixed(2)}% of platform fee</span>
        </div>
        <div style={{ fontSize: 7 }}>
          <span style={{ color: 'var(--text-dim)' }}>Claim Min: </span>
          <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>${policy.claimMinimum}</span>
        </div>
        <div style={{ fontSize: 7 }}>
          <span style={{ color: 'var(--text-dim)' }}>Eligible Fee: </span>
          <span style={{ color: 'var(--text-bright)' }}>{policy.eligibleFeeField}</span>
        </div>
        <div style={{ fontSize: 7 }}>
          <span style={{ color: 'var(--text-dim)' }}>Exclusions: </span>
          <span style={{ color: 'var(--text-bright)' }}>{policy.exclusions.length > 0 ? policy.exclusions.join(', ') : 'None'}</span>
        </div>
        <div style={{ fontSize: 7, gridColumn: 'span 2' }}>
          <span style={{ color: 'var(--text-dim)' }}>Last Updated: </span>
          <span style={{ color: 'var(--text-bright)' }}>
            {policy.lastUpdated ? new Date(policy.lastUpdated).toLocaleString() : 'Never'}
            {policy.updatedBy && ` by ${policy.updatedBy.slice(0, 8)}...`}
          </span>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: 8, borderRadius: 4, fontSize: 8,
          background: msg.includes('ENABLED') || msg.includes('saved') ? 'var(--yellow-bg)' : 'var(--red-bg)',
          color: msg.includes('ENABLED') || msg.includes('saved') ? 'var(--green)' : 'var(--red)',
        }}>
          {msg}
        </div>
      )}

      {/* Edit Form */}
      {editing ? (
        <div style={{
          padding: 12, borderRadius: 6, border: '1px solid var(--border)',
          background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-bright)' }}>EDIT POLICY</div>

          <label style={{ fontSize: 7, color: 'var(--text-dim)' }}>
            Cashback Rate (basis points, 100 = 1% of platform fee)
            <input
              type="number"
              value={rateBps}
              onChange={e => setRateBps(Number(e.target.value))}
              min={0} max={5000}
              style={{
                width: '100%', padding: '6px 8px', marginTop: 2,
                background: 'var(--bg-deep)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text-bright)', fontSize: 8,
              }}
            />
            <span style={{ fontSize: 6, color: 'var(--cyan)' }}>
              = {(rateBps / 100).toFixed(2)}% of platform fee → on $1000 trade (0.40% fee = $4), cashback = ${(4 * rateBps / 10000).toFixed(4)}
            </span>
          </label>

          <label style={{ fontSize: 7, color: 'var(--text-dim)' }}>
            Claim Minimum ($)
            <input
              type="number"
              value={claimMin}
              onChange={e => setClaimMin(Number(e.target.value))}
              min={0}
              style={{
                width: '100%', padding: '6px 8px', marginTop: 2,
                background: 'var(--bg-deep)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text-bright)', fontSize: 8,
              }}
            />
          </label>

          <label style={{ fontSize: 7, color: 'var(--text-dim)' }}>
            Exclusions (comma-separated symbols)
            <input
              type="text"
              value={exclusions}
              onChange={e => setExclusions(e.target.value)}
              placeholder="e.g. MEME, TEST"
              style={{
                width: '100%', padding: '6px 8px', marginTop: 2,
                background: 'var(--bg-deep)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text-bright)', fontSize: 8,
              }}
            />
          </label>

          {/* Enable confirmation */}
          <div style={{
            padding: 8, borderRadius: 4,
            background: confirmEnable ? 'var(--lime-bg)' : 'var(--lime-bg)',
            border: `1px solid ${confirmEnable ? 'var(--green)' : 'var(--amber)'}`,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 7 }}>
              <input
                type="checkbox"
                checked={confirmEnable}
                onChange={e => setConfirmEnable(e.target.checked)}
              />
              <span style={{ color: confirmEnable ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
                {confirmEnable ? 'Cashback will be ENABLED for all users' : 'Enable cashback (requires explicit confirmation)'}
              </span>
            </label>
            {confirmEnable && (
              <div style={{ fontSize: 6, color: 'var(--amber)', marginTop: 4, lineHeight: 1.5 }}>
                Warning: Enabling cashback will start accruing rewards for all eligible trades.
                Ensure the policy rate and exclusions are correct before confirming.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => { setEditing(false); setConfirmEnable(false); }}>
              CANCEL
            </button>
            <button
              className="btn btn-sm btn-lime"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'SAVING...' : confirmEnable ? 'SAVE & ENABLE' : 'SAVE (DISABLED)'}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-lime" onClick={() => setEditing(true)}>
          EDIT POLICY
        </button>
      )}

      {/* Info */}
      <div style={{
        padding: 10, borderRadius: 4,
        background: 'var(--cyan-bg)', border: '1px solid var(--cyan-bg)',
        fontSize: 6, color: 'var(--text-dim)', lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 700, color: 'var(--cyan)', marginBottom: 4 }}>SECURITY NOTES</div>
        <div>Cashback policy is stored in the cashback_policy collection (inbox visibility — admin-only reads).</div>
        <div>Cashback rewards are stored in cashback_rewards (authenticated — users read their own records).</div>
        <div>Referral and cashback accounting are separate. Total allocations must not exceed the platform fee.</div>
        <div>Claims are ledger-settled. No wallet transfers occur without a verified payout processor.</div>
      </div>
    </div>
  );
}