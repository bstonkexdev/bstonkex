// Cupcak8 Swap — Account & Referral Settings Section
import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { shortenAddress } from '../../lib/config';
import { getProfile, type ReferralProfile } from '../../lib/referral';

export default function AccountSection() {
  const { wallet } = useApp();
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet.address) { setProfile(null); return; }
    setLoading(true);
    getProfile(wallet.address).then(p => { setProfile(p); setLoading(false); }).catch(() => setLoading(false));
  }, [wallet.address]);

  if (!wallet.connected) {
    return (
      <div className="ref-card">
        <div className="ref-card-header">ACCOUNT & REFERRAL</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: 12 }}>
          Connect your wallet to view account information.
        </div>
      </div>
    );
  }

  return (
    <div className="ref-card">
      <div className="ref-card-header">ACCOUNT & REFERRAL</div>

      {loading ? (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: 12 }}>
          Loading account info...
        </div>
      ) : profile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoRow label="Username" value={`@${profile.username}`} valueColor="#E8547C" />
          <InfoRow label="Referrer" value={profile.referrerUsername ? `@${profile.referrerUsername}` : 'None'} />
          <InfoRow label="Total Referrals" value={String(profile.totalReferrals)} />
          <InfoRow label="Tier" value={`${profile.currentTier.name} (${profile.currentTier.sharePct}%)`} valueColor="#E8547C" />
          <InfoRow label="30d Volume" value={`$${profile.rollingVolume30d.toLocaleString()}`} />
          <InfoRow label="Wallet" value={shortenAddress(profile.walletAddress, 6)} />

          <div style={{
            marginTop: 4, padding: '8px 10px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.6,
          }}>
            Referral usernames are permanent and case-insensitive. Referrer binding cannot be changed once set.
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: 12 }}>
          No referral profile found. Visit the Referral & Cashback page to create one.
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: valueColor || 'var(--text-bright)' }}>{value}</span>
    </div>
  );
}