// Cupcak8 Swap — Degen Mode Toggle (compact, for Buy/Sell panel)
// Simple ON/OFF — user still chooses every trade manually
import { useState, useEffect, memo } from 'react';
import { useApp } from '../../lib/context';
import { CHAINS } from '../../lib/config';
import { isDegenOn, isDegenActiveFor, onDegenChange, getNativeSymbol } from '../../lib/engine/degen-mode';

const D = {
  text: 'var(--text)', textSec: 'var(--text)', textMuted: 'var(--text-dim)',
  border: 'var(--border)', bgPanel: 'var(--bg-surface)', bgAlt: 'var(--bg-elevated)',
  gold: 'var(--yellow)', goldBg: 'var(--yellow-bg)',
  green: 'var(--green)', red: 'var(--red)',
  mono: "var(--font-mono)",
} as const;

interface Props {
  enabled: boolean;
  onToggle: (on: boolean) => void;
}

export default memo(function DegenModeToggle({ enabled, onToggle }: Props) {
  const { wallet, activeChain, setPage } = useApp();
  const [degenOn, setDegenOn] = useState(isDegenOn());

  useEffect(() => {
    return onDegenChange((isOn) => setDegenOn(isOn));
  }, []);

  const active = degenOn && isDegenActiveFor(wallet.address, activeChain);

  return (
    <div style={{
      background: D.bgPanel, border: `1px solid ${active ? D.gold : D.border}`,
      borderRadius: 6, padding: '8px 10px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: D.text, letterSpacing: '0.03em' }}>
          DEGEN MODE
        </span>
        <button onClick={() => {
          if (!active) {
            setPage('portfolio');
            return;
          }
          onToggle(!enabled);
        }} style={{
          padding: '3px 10px', fontSize: 9, fontWeight: 700,
          background: enabled && active ? D.gold : D.bgAlt,
          border: `1px solid ${enabled && active ? D.gold : D.border}`,
          borderRadius: 3, cursor: 'pointer',
          color: enabled && active ? '#000' : D.textMuted,
          transition: 'all 0.12s',
        }}>
          {enabled && active ? 'ON' : 'OFF'}
        </button>
      </div>

      {!active && (
        <div style={{ fontSize: 9, color: D.textMuted, marginTop: 4 }}>
          Not enabled —{' '}
          <button onClick={() => setPage('portfolio')} style={{
            background: 'none', border: 'none', color: D.gold,
            fontSize: 9, fontWeight: 600, cursor: 'pointer', padding: 0,
          }}>
            Enable in Wallet
          </button>
        </div>
      )}

      {active && enabled && (
        <div style={{ fontSize: 9, color: D.green, marginTop: 4 }}>
          Passwordless trading active
        </div>
      )}

      {active && !enabled && (
        <div style={{ fontSize: 9, color: D.textMuted, marginTop: 4 }}>
          Available — toggle ON to skip wallet confirmation
        </div>
      )}
    </div>
  );
});
