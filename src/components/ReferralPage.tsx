// Cupcak8 Swap Reward Center — landing page → referral/cashback dashboards
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../lib/context';
import { shortenAddress } from '../lib/config';
import MascotLogo from './MascotLogo';
import { getProfile, claimRewards as claimReferralRewards, type ReferralProfile } from '../lib/referral';
import { getUnifiedSummary, getUnifiedHistory, getUnifiedClaimHistory, type UnifiedRewardSummary, type UnifiedHistoryEntry } from '../lib/rewards';
import { claimCashback } from '../lib/engine/cashback-engine';
import type { ClaimRecord } from '../lib/referral';
import RewardLanding from './reward/RewardLanding';
import RewardOverview from './reward/RewardOverview';
import ReferralsTab from './reward/ReferralsTab';
import CashbackDashboard from './reward/CashbackDashboard';
import HistoryClaims from './reward/HistoryClaims';

type RewardView = 'landing' | 'dashboard';
type RewardTab = 'overview' | 'referrals' | 'cashback' | 'history';

const DASHBOARD_TABS: { id: RewardTab; label: string }[] = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'referrals', label: 'REFERRALS' },
  { id: 'cashback', label: 'CASHBACK' },
  { id: 'history', label: 'HISTORY & CLAIMS' },
];

export default function ReferralPage() {
  const { page, wallet, setWalletModal } = useApp();
  const [view, setView] = useState<RewardView>('landing');
  const [tab, setTab] = useState<RewardTab>('overview');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<UnifiedRewardSummary | null>(null);
  const [history, setHistory] = useState<UnifiedHistoryEntry[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const prevPage = useRef(page);

  // Reset to landing when REWARD nav is tapped while already on this page
  useEffect(() => {
    if (page === 'reward' && prevPage.current === 'reward' && view !== 'landing') {
      // User tapped REWARD again — could reset, but keep current view to avoid annoyance
    }
    prevPage.current = page;
  }, [page, view]);

  const showStatus = (msg: string, type: typeof statusType) => {
    setStatusMsg(msg); setStatusType(type);
    if (type !== 'error') setTimeout(() => setStatusMsg(''), 4000);
  };

  const reload = useCallback(async () => {
    if (!wallet.address) return;
    setLoading(true);
    try {
      const [s, h, c, p] = await Promise.all([
        getUnifiedSummary(wallet.address),
        getUnifiedHistory(wallet.address),
        getUnifiedClaimHistory(wallet.address),
        getProfile(wallet.address),
      ]);
      setSummary(s);
      setHistory(h);
      setClaims(c);
      setProfile(p);
    } catch { /* ignore */ }
    setLoading(false);
  }, [wallet.address]);

  const openDashboard = useCallback(async (initialTab: RewardTab) => {
    setTab(initialTab);
    setView('dashboard');
    if (!summary && wallet.address) {
      await reload();
    }
  }, [summary, wallet.address, reload]);

  const handleClaimReferral = async () => {
    if (!profile?.username) return;
    const result = await claimReferralRewards(profile.username);
    if (result.success) {
      showStatus(`Referral claim recorded: $${result.amount.toFixed(2)}. Ledger-settled.`, 'success');
      await reload();
    } else {
      showStatus(result.error || 'Claim failed', 'error');
    }
  };

  const handleClaimCashback = async () => {
    if (!wallet.address) return;
    const result = await claimCashback(wallet.address);
    if (result.success) {
      showStatus(`Cashback claim recorded: $${result.amount.toFixed(2)}. Ledger-settled.`, 'success');
      await reload();
    } else {
      showStatus(result.error || 'Claim failed', 'error');
    }
  };

  // ── Landing View ──
  if (view === 'landing') {
    return (
      <RewardLanding
        onOpenReferral={() => openDashboard('referrals')}
        onOpenCashback={() => openDashboard('cashback')}
      />
    );
  }

  // ── Dashboard View ──

  // Not connected
  if (!wallet.connected) {
    return (
      <div className="ref-page">
        <div className="ref-section">
          <div className="ref-header">
            <div className="ref-title">REWARD CENTER</div>
            <div className="ref-subtitle">Earn from referrals and trading cashback</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={() => setView('landing')}
              style={{
                padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)', color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer',
              }}
            >
              {'<'} Back
            </button>
          </div>
          <div style={{
            textAlign: 'center', padding: 32,
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            background: 'var(--bg-surface)',
          }}>
            <MascotLogo size={40} color="#E8547C" />
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 6, marginTop: 10 }}>
              Connect Your Wallet
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
              Access the reward center and start earning from referrals and trading
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setWalletModal('evm')} style={{
                padding: '10px 24px', background: '#E8547C', border: 'none',
                borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}>Connect EVM</button>
              <button onClick={() => setWalletModal('solana')} style={{
                padding: '10px 24px', background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                color: 'var(--text-dim)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>Connect Solana</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="ref-page">
        <div className="ref-section" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div className="led-sm led-green led-blink" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Loading reward data...</div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="ref-page">
        <div className="ref-section" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 12 }}>Unable to load reward data.</div>
          <button
            onClick={() => setView('landing')}
            style={{
              padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 4,
              background: 'none', color: 'var(--text-dim)', fontSize: 8, cursor: 'pointer',
            }}
          >
            {'<'} BACK TO REWARDS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ref-page">
      <div className="ref-section">
        {/* Header with back button */}
        <div className="ref-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
            <button
              onClick={() => setView('landing')}
              style={{
                padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 3,
                background: 'none', color: 'var(--text-dim)', fontSize: 8, cursor: 'pointer',
                fontFamily: 'var(--font-pixel, var(--font))',
              }}
            >
              {'<'}
            </button>
            <div className="ref-title" style={{ margin: 0 }}>REFERRAL & CASHBACK</div>
          </div>
          <div className="ref-subtitle">Invite friends, trade together, and earn rewards</div>
          <div className="ref-wallet-status connected">
            {shortenAddress(wallet.address ?? '', 5)} · {wallet.chainId?.toUpperCase() || 'CONNECTED'}
          </div>
        </div>

        {statusMsg && <div className={`ref-alert ${statusType}`}>{statusMsg}</div>}

        {/* Tabs */}
        <div className="ref-tabs">
          {DASHBOARD_TABS.map(t => (
            <button
              key={t.id}
              className={`ref-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => {
                setTab(t.id);
                if (!summary) reload();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'overview' && <RewardOverview summary={summary} />}

        {tab === 'referrals' && (
          <ReferralsTab profile={profile} onProfileChange={reload} />
        )}

        {tab === 'cashback' && (
          <CashbackDashboard walletAddress={wallet.address} onBack={() => setTab('overview')} />
        )}

        {tab === 'history' && (
          <HistoryClaims
            history={history}
            claims={claims}
            onClaimReferral={handleClaimReferral}
            onClaimCashback={handleClaimCashback}
            claimableReferral={profile?.claimableRewards ?? 0}
            claimableCashback={summary.cashbackPolicy.enabled ? summary.combinedClaimable - (profile?.claimableRewards ?? 0) : 0}
          />
        )}
      </div>
    </div>
  );
}