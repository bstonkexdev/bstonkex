import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { REFERRAL_TIERS, MIN_CLAIM_AMOUNT, formatUsd, shortenAddress, PLATFORM_FEE_PCT } from '../lib/config';
import { createProfile, getProfile, getReferralLink, getReferralHistory, getRefFromUrl, setReferrer, getClaimHistory, getReferralAnalytics, type ReferralProfile, type ReferralRecord, type ClaimRecord, type ReferralAnalytics } from '../lib/referral';
import TierProgress from './referral/TierProgress';
import ClaimFlow from './referral/ClaimFlow';
import ReferralWalletList from './referral/ReferralWalletList';
import RewardHistory from './referral/RewardHistory';
import ClaimHistory from './referral/ClaimHistory';

type Tab = 'overview' | 'referrals' | 'rewards' | 'claims' | 'analytics';

export default function ReferralPage() {
  const { wallet, connect } = useApp();
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [history, setHistory] = useState<ReferralRecord[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [analytics, setAnalytics] = useState<ReferralAnalytics | null>(null);
  const [username, setUsername] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refInput, setRefInput] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  const reload = () => {
    if (!wallet.address) return;
    getProfile(wallet.address).then(setProfile);
    getReferralHistory(wallet.address).then(setHistory);
    getClaimHistory(wallet.address).then(setClaims);
    getReferralAnalytics(wallet.address).then(setAnalytics);
  };

  useEffect(() => { reload(); }, [wallet.address]);
  useEffect(() => { const ref = getRefFromUrl(); if (ref) setRefInput(ref); }, []);

  const handleCreate = async () => {
    if (!wallet.address || !username.trim()) return;
    setCreating(true);
    const ok = await createProfile(username.trim().toLowerCase(), wallet.address);
    if (ok) { setStatusMsg('Profile created!'); reload(); }
    else { setStatusMsg('Username taken or error occurred.'); }
    setCreating(false);
  };

  const handleSetReferrer = async () => {
    if (!wallet.address || !refInput.trim()) return;
    const ok = await setReferrer(wallet.address, refInput.trim().toLowerCase());
    if (ok) { setStatusMsg('Referrer set. This cannot be changed.'); reload(); }
    else { setStatusMsg('Could not set referrer.'); }
  };

  const copyLink = () => {
    if (!profile) return;
    navigator.clipboard.writeText(getReferralLink(profile.username));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = () => {
    if (!profile || !navigator.share) return;
    navigator.share({ title: 'BSTONKEX Referral', url: getReferralLink(profile.username) }).catch(() => {});
  };

  // ── Not connected ──
  if (!wallet.connected) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, minHeight: '60vh' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.12em' }}>REFERRAL CENTER</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Connect wallet to access referral system</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-cyan" onClick={() => connect('evm')}>Connect EVM</button>
            <button className="btn" onClick={() => connect('solana')}>Connect Solana</button>
          </div>
        </div>
      </div>
    );
  }

  // ── No profile ──
  if (!profile) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: '24px 12px' }}>
        <div style={{ maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="panel">
            <div className="panel-header"><span className="led" /> CREATE REFERRAL PROFILE</div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                Create a unique username to earn a share of BSTONKEX platform fees from your referred traders.
              </div>
              <input className="input" placeholder="Choose a username..." value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} maxLength={20} />
              <button className="btn btn-full btn-cyan" onClick={handleCreate} disabled={creating || username.length < 3}>
                {creating ? 'CREATING...' : 'CREATE PROFILE'}
              </button>
              {refInput && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 4 }}>REFERRED BY @ {refInput}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="input" value={refInput} onChange={e => setRefInput(e.target.value)} placeholder="Referral username" />
                    <button className="btn btn-sm" onClick={handleSetReferrer}>SET</button>
                  </div>
                  <div style={{ fontSize: 7, color: 'var(--amber)', marginTop: 4 }}>Referrer cannot be changed once set</div>
                </div>
              )}
              {statusMsg && <div style={{ fontSize: 9, color: 'var(--cyan)' }}>{statusMsg}</div>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-header"><span className="led" /> REFERRAL TIERS</div>
            <div style={{ padding: 8 }}>
              {REFERRAL_TIERS.map((tier, i) => (
                <div key={tier.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(22,40,72,0.3)' }}>
                  <span style={{ fontWeight: 700, fontSize: 10, color: i === 0 ? 'var(--text)' : i === 1 ? 'var(--cyan)' : i === 2 ? 'var(--amber)' : 'var(--purple)' }}>{tier.name}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{formatUsd(tier.minVolume)}{tier.maxVolume ? ` — ${formatUsd(tier.maxVolume)}` : '+'}</span>
                  <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: 10 }}>{tier.sharePct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──
  const tier = profile.currentTier;
  const nextTier = profile.nextTier;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>REFERRAL CENTER</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 7, color: 'var(--green)' }}>● LIVE</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {(['overview', 'referrals', 'rewards', 'claims', 'analytics'] as Tab[]).map(t => (
          <button key={t} style={{
            padding: '6px 12px', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
            background: tab === t ? 'var(--bg)' : 'transparent',
            border: 'none', borderBottom: tab === t ? '2px solid var(--cyan)' : '2px solid transparent',
            color: tab === t ? 'var(--text-bright)' : 'var(--text-dim)',
            cursor: 'pointer', fontFamily: 'var(--font)',
          }} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <div className="stat-box"><span className="stat-label">YOUR TIER</span>
                <span className="stat-value" style={{ color: tier.sharePct >= 30 ? 'var(--amber)' : 'var(--cyan)' }}>{tier.name} — {tier.sharePct}%</span></div>
              <div className="stat-box"><span className="stat-label">30-DAY VOL</span>
                <span className="stat-value">{formatUsd(profile.rollingVolume30d)}</span></div>
              <div className="stat-box"><span className="stat-label">FEE SHARE</span>
                <span className="stat-value text-green">{tier.sharePct}%</span></div>
              <div className="stat-box"><span className="stat-label">CLAIMABLE</span>
                <span className="stat-value text-green">{formatUsd(profile.claimableRewards)}</span></div>
              <div className="stat-box"><span className="stat-label">PENDING</span>
                <span className="stat-value text-amber">{formatUsd(profile.pendingRewards)}</span></div>
              <div className="stat-box"><span className="stat-label">TOTAL EARNED</span>
                <span className="stat-value">{formatUsd(profile.totalEarned)}</span></div>
              <div className="stat-box"><span className="stat-label">REFERRALS</span>
                <span className="stat-value">{profile.totalReferrals}</span></div>
              <div className="stat-box"><span className="stat-label">ACTIVE</span>
                <span className="stat-value">{profile.activeReferrals}</span></div>
            </div>

            {/* Referral link */}
            <div className="panel">
              <div className="panel-header"><span className="led" /> REFERRAL LINK</div>
              <div style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="input" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, background: 'var(--bg-primary)' }}>
                  {getReferralLink(profile.username)}
                </div>
                <button className="btn btn-sm btn-cyan" onClick={copyLink}>{copied ? 'COPIED!' : 'COPY'}</button>
                {navigator.share && <button className="btn btn-sm" onClick={shareLink}>SHARE</button>}
              </div>
            </div>

            {/* Tier progress */}
            <div className="panel">
              <div className="panel-header"><span className="led" /> TIER PROGRESS</div>
              <TierProgress currentTier={tier} nextTier={nextTier} rollingVolume30d={profile.rollingVolume30d} />
            </div>

            {/* Claim */}
            <div className="panel">
              <div className="panel-header"><span className="led" /> CLAIM REWARDS</div>
              <div style={{ padding: 8 }}>
                <ClaimFlow claimableRewards={profile.claimableRewards} onClaimed={reload} />
              </div>
            </div>

            {/* Fee relationship explanation */}
            <div className="panel">
              <div className="panel-header"><span className="led" /> HOW IT WORKS</div>
              <div style={{ padding: 8, fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                <div>Trade Value → BSTONKEX Fee ({(PLATFORM_FEE_PCT * 100).toFixed(2)}%) → Your Share ({tier.sharePct}%) → Treasury ({100 - tier.sharePct}%)</div>
                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 8 }}>
                  Example: $10,000 trade → ${(10000 * PLATFORM_FEE_PCT).toFixed(2)} fee → ${((10000 * PLATFORM_FEE_PCT * tier.sharePct) / 100).toFixed(2)} your share
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'referrals' && (
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-header"><span className="led" /> YOUR REFERRALS ({profile.totalReferrals})</div>
            <ReferralWalletList walletAddress={wallet.address} />
          </div>
        )}

        {tab === 'rewards' && (
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-header"><span className="led" /> REWARD HISTORY</div>
            <RewardHistory history={history} />
          </div>
        )}

        {tab === 'claims' && (
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-header"><span className="led" /> CLAIM HISTORY</div>
            <ClaimHistory claims={claims} />
          </div>
        )}

        {tab === 'analytics' && analytics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <div className="stat-box"><span className="stat-label">30D VOLUME</span><span className="stat-value">{formatUsd(analytics.volume30d)}</span></div>
              <div className="stat-box"><span className="stat-label">7D VOLUME</span><span className="stat-value">{formatUsd(analytics.volume7d)}</span></div>
              <div className="stat-box"><span className="stat-label">TOTAL REWARDS</span><span className="stat-value text-green">{formatUsd(analytics.totalRewards)}</span></div>
              <div className="stat-box"><span className="stat-label">AVG TRADE</span><span className="stat-value">{formatUsd(analytics.avgTradeValue)}</span></div>
              <div className="stat-box"><span className="stat-label">TRADE COUNT</span><span className="stat-value">{analytics.tradeCount}</span></div>
            </div>
            {analytics.tradeCount === 0 && (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>INSUFFICIENT DATA</div>
            )}
          </div>
        )}

        {statusMsg && <div style={{ fontSize: 9, color: 'var(--cyan)', marginTop: 8 }}>{statusMsg}</div>}
      </div>
    </div>
  );
}