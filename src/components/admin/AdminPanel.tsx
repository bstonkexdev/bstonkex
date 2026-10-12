// Cupcak8 Swap Admin Panel — main container with tab navigation
import { useState } from 'react';
import type { WalletState } from '../../lib/wallet';
import { isAdminWallet } from '../../lib/engine/admin-auth';
import AdminDashboard from './AdminDashboard';
import ReferralPermissions from './ReferralPermissions';
import SystemHealth from './SystemHealth';
import AuditLog from './AuditLog';
import CashbackPolicyPanel from './CashbackPolicyPanel';

type AdminTab = 'dashboard' | 'permissions' | 'cashback' | 'health' | 'audit';

interface Props {
  wallet: WalletState;
}

const TABS: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'permissions', label: 'Permissions', icon: '⚿' },
  { id: 'cashback', label: 'Cashback Policy', icon: '💰' },
  { id: 'health', label: 'Health', icon: '♥' },
  { id: 'audit', label: 'Audit Log', icon: '≡' },
];

export default function AdminPanel({ wallet }: Props) {
  const [tab, setTab] = useState<AdminTab>('dashboard');

  if (!wallet.address || !isAdminWallet(wallet.address)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 16, padding: 32, textAlign: 'center',
      }}>
        <div style={{ fontSize: 24, color: 'var(--red)' }}>⚿</div>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          ACCESS DENIED
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-dim)', maxWidth: 300, lineHeight: 1.6 }}>
          This panel is restricted to authorized administrators. Connect an admin wallet to continue.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 960, margin: '0 auto' }}>
      {/* Admin Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 0 12px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, color: 'var(--lime)' }}>◈</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
            ADMIN PANEL
          </span>
        </div>
        <div style={{
          fontSize: 7, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', border: '1px solid var(--green)', borderRadius: 3,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 7,
              fontWeight: 900,
              letterSpacing: '0.06em',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: tab === t.id ? 'var(--lime)' : 'transparent',
              color: tab === t.id ? '#000' : 'var(--text-dim)',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 9 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ padding: '16px 0' }}>
        {tab === 'dashboard' && <AdminDashboard wallet={wallet} />}
        {tab === 'permissions' && <ReferralPermissions wallet={wallet} />}
        {tab === 'cashback' && <CashbackPolicyPanel wallet={wallet} />}
        {tab === 'health' && <SystemHealth />}
        {tab === 'audit' && <AuditLog />}
      </div>
    </div>
  );
}