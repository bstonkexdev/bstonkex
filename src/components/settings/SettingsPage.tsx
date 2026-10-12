// Cupcak8 Swap — Settings & Preferences Page
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../lib/context';
import { loadSettings, saveSettings, resetSettings, DEFAULT_SETTINGS, type UserSettings } from '../../lib/settings-store';
import WalletSection from './WalletSection';
import TradingSection from './TradingSection';
import NetworkSection from './NetworkSection';
import AccountSection from './AccountSection';
import SecuritySection from './SecuritySection';
import MascotLogo from '../MascotLogo';
import HowItWorksSection from './HowItWorksSection';

export default function SettingsPage() {
  const { wallet } = useApp();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings().then(s => { setSettings(s); setLoading(false); });
  }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMsg({ text, type });
    if (type === 'success') setTimeout(() => setMsg(null), 3000);
  };

  const handleTradingChange = useCallback((trading: UserSettings['trading']) => {
    setSettings(prev => ({ ...prev, trading }));
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const result = await saveSettings(settings);
    setSaving(false);
    if (result.ok) {
      showMsg('Settings saved', 'success');
      setHasChanges(false);
    } else {
      showMsg(result.error || 'Failed to save', 'error');
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    setSaving(true);
    setMsg(null);
    const result = await resetSettings();
    setSaving(false);
    if (result.ok) {
      setSettings(DEFAULT_SETTINGS);
      setHasChanges(false);
      showMsg('Settings reset to defaults', 'success');
    } else {
      showMsg(result.error || 'Failed to reset', 'error');
    }
  };

  if (loading) {
    return (
      <div className="ref-page">
        <div className="ref-section" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ref-page">
      <div className="ref-section">
        {/* Header */}
        <div className="ref-header">
          <MascotLogo size={32} color="#E8547C" />
          <div className="ref-title" style={{ marginTop: 6 }}>SETTINGS & PREFERENCES</div>
          <div className="ref-subtitle">Manage your wallet, trading, and account settings</div>
        </div>

        {/* Status message */}
        {msg && (
          <div style={{
            padding: '10px 14px', marginBottom: 12,
            background: msg.type === 'success' ? 'var(--lime-bg)' : 'var(--red-bg)',
            border: `1px solid ${msg.type === 'success' ? 'var(--lime-dim)' : 'var(--red)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: 11, color: msg.type === 'success' ? 'var(--lime-dim)' : 'var(--red)',
          }}>
            {msg.text}
          </div>
        )}

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <WalletSection />
          <TradingSection settings={settings.trading} onChange={handleTradingChange} />
          <NetworkSection />
          <AccountSection />
          <SecuritySection />
          <HowItWorksSection />
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 16, paddingTop: 14,
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{
              flex: 1, padding: '12px', background: hasChanges ? '#E8547C' : 'var(--bg-elevated)',
              border: `1px solid ${hasChanges ? '#E8547C' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', color: hasChanges ? '#fff' : 'var(--text-dim)',
              fontSize: 13, fontWeight: 700, cursor: hasChanges ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'SAVING...' : 'SAVE SETTINGS'}
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            style={{
              padding: '12px 20px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            RESET
          </button>
        </div>

        {!wallet.connected && (
          <div style={{
            marginTop: 12, padding: '10px 12px',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)', fontSize: 10, color: 'var(--text-dim)',
            textAlign: 'center', lineHeight: 1.6,
          }}>
            Connect your wallet to access all settings and save preferences.
          </div>
        )}
      </div>
    </div>
  );
}