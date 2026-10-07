// BSTONKEX Admin Deployment Center — protected admin-only deployment interface
// Requires authorized admin wallet. Shows ACCESS DENIED for unauthorized wallets.
import { useState, useCallback } from 'react';
import { useApp } from '../../lib/context';
import { getAuthStatus } from '../../lib/engine/admin-auth';
import InfraDashboard from './InfraDashboard';
import CredentialPanel from './CredentialPanel';
import DeployWorkflow from './DeployWorkflow';
import DeploymentLogPanel from './DeploymentLog';
import RobinhoodPanel from './RobinhoodPanel';
import PipelineMonitor from './PipelineMonitor';

type AdminTab = 'infra' | 'deploy' | 'credentials' | 'robinhood' | 'pipeline' | 'log';

export default function DeploymentCenter() {
  const { wallet, connect, setPage } = useApp();
  const [activeTab, setActiveTab] = useState<AdminTab>('infra');

  const auth = getAuthStatus(wallet.address);

  // ── Gate 1: No wallet connected ──
  if (!wallet.connected) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: 20, color: 'var(--cyan)', marginBottom: 4 }}>⬡</div>
        <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          ADMIN DEPLOYMENT CENTER
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
          Connect your authorized admin wallet to access the deployment center.
          Only wallets configured via VITE_ADMIN_WALLETS can deploy to production.
        </div>
        <button className="btn btn-lg btn-cyan" onClick={() => connect('evm')} style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em' }}>
          CONNECT ADMIN WALLET
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setPage('landing')} style={{ fontSize: 8 }}>
          ← Back to App
        </button>
      </div>
    );
  }

  // ── Gate 2: Wallet connected but not authorized ──
  if (!auth.authorized) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: 24, color: 'var(--red)' }}>⊘</div>
        <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--red)', letterSpacing: '0.1em' }}>
          ACCESS DENIED
        </div>
        <div style={{
          padding: '8px 16px', borderRadius: 4,
          background: 'rgba(255,48,96,0.08)', border: '1px solid rgba(255,48,96,0.2)',
          fontSize: 9, color: 'var(--text)', textAlign: 'center', maxWidth: 400,
        }}>
          {auth.reason}
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 350, lineHeight: 1.6 }}>
          Connected: {wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}
          <br />
          This wallet is not in the authorized admin wallet list.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-cyan" onClick={() => connect('evm')} style={{ fontSize: 8 }}>
            SWITCH WALLET
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setPage('landing')} style={{ fontSize: 8 }}>
            ← Back to App
          </button>
        </div>
      </div>
    );
  }

  // ── Authorized: Show Deployment Center ──
  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'infra', label: 'INFRASTRUCTURE', icon: '◈' },
    { id: 'deploy', label: 'DEPLOY ALL', icon: '🚀' },
    { id: 'credentials', label: 'CREDENTIALS', icon: '🔑' },
    { id: 'robinhood', label: 'ROBINHOOD', icon: '◉' },
    { id: 'pipeline', label: 'PIPELINE', icon: '◉' },
    { id: 'log', label: 'LOGS', icon: '☰' },
  ];

  return (
    <div style={{
      width: '100%', maxWidth: 860, margin: '0 auto',
      padding: '16px 12px 40px',
      overflowX: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          ⬡ ADMIN DEPLOYMENT CENTER
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 7, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
            background: 'rgba(0,255,100,0.12)', color: 'var(--green)',
          }}>
            ✓ AUTHORIZED
          </span>
          <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>
            {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setPage('landing')} style={{ fontSize: 7 }}>
            EXIT
          </button>
        </div>
      </div>

      {/* Tab Navigation — horizontal scroll, always visible */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 16,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        paddingBottom: 4,
        borderBottom: '1px solid var(--border)',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 10px', borderRadius: '4px 4px 0 0', border: 'none', cursor: 'pointer',
              background: activeTab === tab.id ? 'var(--cyan)' : 'transparent',
              color: activeTab === tab.id ? '#000' : 'var(--text-muted)',
              fontSize: 7, fontWeight: 900, letterSpacing: '0.05em',
              whiteSpace: 'nowrap', flexShrink: 0,
              borderBottom: activeTab === tab.id ? '2px solid var(--cyan)' : '2px solid transparent',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content — NO fixed height, NO nested scroll, flows naturally */}
      <div>
        {activeTab === 'infra' && <InfraDashboard />}
        {activeTab === 'deploy' && <DeployWorkflow />}
        {activeTab === 'credentials' && <CredentialPanel />}
        {activeTab === 'robinhood' && <RobinhoodPanel />}
        {activeTab === 'pipeline' && <PipelineMonitor />}
        {activeTab === 'log' && <DeploymentLogPanel />}
      </div>
    </div>
  );
}