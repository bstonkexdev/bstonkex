// Cupcak8 Swap Referrals Tab — Cupcak8 pink themed
import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { shortenAddress, formatUsd } from '../../lib/config';
import {
  getReferredWallets,
  isValidUsername, isUsernameAvailable, sanitizeUsername,
  createProfile, setReferrer, getRefFromUrl,
  type ReferralProfile, type ReferredWallet,
} from '../../lib/referral';
import ReferralLinkCard from '../referral/ReferralLinkCard';
import TierProgress from '../referral/TierProgress';
import ReferralRules from '../referral/ReferralRules';

interface Props {
  profile: ReferralProfile | null;
  onProfileChange: () => void;
}

export default function ReferralsTab({ profile, onProfileChange }: Props) {
  const { wallet, setWalletModal } = useApp();
  const [referred, setReferred] = useState<ReferredWallet[]>([]);
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [creating, setCreating] = useState(false);
  const [refInput, setRefInput] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'info' | 'warn' | 'error' | 'success'>('info');

  const showStatus = (msg: string, type: typeof statusType) => {
    setStatusMsg(msg); setStatusType(type);
    if (type !== 'error') setTimeout(() => setStatusMsg(''), 4000);
  };

  useEffect(() => {
    if (wallet.address && profile) {
      getReferredWallets(wallet.address).then(setReferred).catch(() => {});
    }
  }, [wallet.address, profile]);

  useEffect(() => {
    const ref = getRefFromUrl();
    if (ref) setRefInput(ref);
  }, []);

  useEffect(() => {
    if (!username || username.length < 3) { setUsernameStatus('idle'); return; }
    if (!isValidUsername(username)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      const ok = await isUsernameAvailable(username);
      setUsernameStatus(ok ? 'ok' : 'taken');
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  const handleCreate = async () => {
    if (!wallet.address || !username.trim()) return;
    setCreating(true);
    const result = await createProfile(username.trim(), wallet.address);
    if (result.ok) {
      showStatus('Profile created!', 'success');
      onProfileChange();
    } else {
      showStatus(result.error || 'Profile creation failed', 'error');
    }
    setCreating(false);
  };

  const handleSetReferrer = async () => {
    if (!wallet.address || !refInput.trim()) return;
    const result = await setReferrer(wallet.address, refInput.trim());
    if (result.ok) {
      showStatus('Referrer set. This is permanent.', 'success');
      onProfileChange();
    } else {
      showStatus(result.error || 'Could not set referrer', 'error');
    }
  };

  if (!wallet.connected) {
    return (
      <div className="ref-card" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 8 }}>
          Connect Wallet
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>
          Connect to manage your referral profile
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-pink" onClick={() => setWalletModal('evm')}>Connect EVM</button>
          <button className="btn" onClick={() => setWalletModal('solana')}>Connect Solana</button>
        </div>
      </div>
    );
  }

  // No profile yet
  if (!profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="ref-card">
          <div className="ref-card-header">CREATE REFERRAL PROFILE</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.6 }}>
            Choose a unique username (3-20 characters). This becomes your permanent referral identity.
          </div>
          <input
            className={`ref-input ${usernameStatus === 'ok' ? 'ok' : usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'error' : ''}`}
            placeholder="Choose a username..."
            value={username}
            onChange={e => setUsername(sanitizeUsername(e.target.value))}
            maxLength={20}
          />
          <div className={`ref-username-check ${usernameStatus}`}>
            {usernameStatus === 'checking' && 'Checking availability...'}
            {usernameStatus === 'ok' && 'Username available'}
            {usernameStatus === 'taken' && 'Username already taken'}
            {usernameStatus === 'invalid' && username.length > 0 && 'Must be 3-20 chars: letters, numbers, underscore'}
          </div>
          <button
            className="btn btn-full btn-pink"
            style={{ marginTop: 8 }}
            onClick={handleCreate}
            disabled={creating || usernameStatus !== 'ok'}
          >
            {creating ? 'CREATING...' : 'CREATE PROFILE'}
          </button>
        </div>

        {refInput && (
          <div className="ref-card">
            <div className="ref-card-header">REFERRED BY</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#E8547C', marginBottom: 8 }}>@{refInput}</div>
            <div style={{ fontSize: 9, color: 'var(--yellow-dim)', marginBottom: 8 }}>Referrer cannot be changed once set</div>
            <button className="btn btn-full btn-pink" onClick={handleSetReferrer}>
              Confirm Referrer
            </button>
          </div>
        )}

        {statusMsg && <div className={`ref-alert ${statusType}`}>{statusMsg}</div>}
        <ReferralRules currentTier={{ name: 'STARTER', minVolume: 0, maxVolume: 9999, sharePct: 10 }} />
      </div>
    );
  }

  const tier = profile.currentTier;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {statusMsg && <div className={`ref-alert ${statusType}`}>{statusMsg}</div>}

      {/* Referral Link */}
      <ReferralLinkCard username={profile.username} />

      {/* Tier Progress */}
      <div className="ref-card">
        <div className="ref-card-header">TIER PROGRESS</div>
        <TierProgress currentTier={tier} nextTier={profile.nextTier} rollingVolume30d={profile.rollingVolume30d} />
      </div>

      {/* Referred Wallets */}
      <div className="ref-card">
        <div className="ref-card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>YOUR REFERRALS</span>
          <span style={{ color: '#E8547C', fontWeight: 800 }}>{profile.totalReferrals}</span>
        </div>
        {referred.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '10px 0' }}>
            No referrals yet. Share your link to start earning.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {referred.slice(0, 20).map((w, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', borderBottom: i < referred.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 10,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-bright)' }}>
                  {shortenAddress(w.wallet, 4)}
                </span>
                <span style={{ color: w.status === 'active' ? 'var(--lime-dim)' : 'var(--text-dim)' }}>
                  {formatUsd(w.volume30d)} vol
                </span>
                <span style={{
                  padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                  background: w.status === 'active' ? 'var(--lime-bg)' : 'var(--bg-elevated)',
                  color: w.status === 'active' ? 'var(--lime-dim)' : 'var(--text-dim)',
                  fontSize: 8, fontWeight: 700,
                }}>
                  {w.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rules */}
      <ReferralRules currentTier={tier} />
    </div>
  );
}