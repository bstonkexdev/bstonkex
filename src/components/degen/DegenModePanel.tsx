// Cupcak8 Swap — Degen Mode Panel (wallet section)
// Simple ON/OFF: passwordless trading, user still chooses every trade
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { CHAINS } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import {
  isDegenOn, onDegenChange, enableDegen, disableDegen,
  getNativeSymbol,
} from '../../lib/engine/degen-mode';

const D = {
  text: 'var(--text)', textSec: 'var(--text)', textMuted: 'var(--text-dim)',
  border: 'var(--border)', bgPanel: 'var(--bg-surface)', bg: 'var(--bg-deep)', bgAlt: 'var(--bg-elevated)',
  gold: 'var(--yellow)', goldBg: 'var(--yellow-bg)',
  green: 'var(--green)', greenBg: 'var(--green-bg)',
  red: 'var(--red)', redBg: 'var(--red-bg)',
  mono: "var(--font-mono)",
} as const;

interface Props {
  walletAddress: string;
  activeChain: ChainId;
}

export default memo(function DegenModePanel({ walletAddress, activeChain }: Props) {
  const [on, setOn] = useState(isDegenOn());
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    return onDegenChange((isOn) => setOn(isOn));
  }, []);

  // Auto-disable on wallet change
  const prevWallet = useRef(walletAddress);
  useEffect(() => {
    if (prevWallet.current && prevWallet.current !== walletAddress) {
      disableDegen();
      setShowConfirm(false);
    }
    prevWallet.current = walletAddress;
  }, [walletAddress]);

  const chain = CHAINS[activeChain];
  const nativeSym = getNativeSymbol(activeChain);

  return (
    <div style={{
      border: `1px solid ${on ? D.green : D.border}`, borderRadius: 6,
      padding: 10, background: D.bgPanel, marginTop: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: D.text, marginBottom: 4 }}>
        DEGEN MODE
      </div>

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: on ? D.green : D.textMuted,
          animation: on ? 'degen-pulse 1.5s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: on ? D.green : D.textMuted }}>
          {on ? 'ON' : 'OFF'}
        </span>
      </div>

      <div style={{ fontSize: 10, color: D.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
        {on
          ? 'Passwordless trading enabled. You still choose every trade.'
          : 'No active trading session.'}
      </div>

      {/* ON state */}
      {on && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
            <span style={{ color: 'var(--text-dim)' }}>CHAIN</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: D.mono, fontWeight: 600 }}>
              {chain?.shortName || activeChain.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
            <span style={{ color: 'var(--text-dim)' }}>MODE</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: D.mono, fontWeight: 600 }}>
              Passwordless
            </span>
          </div>
        </div>
      )}

      {/* Enable / Disable */}
      {!on && !showConfirm && (
        <button onClick={() => setShowConfirm(true)} style={{
          width: '100%', padding: '8px', background: D.gold, border: 'none',
          borderRadius: 4, color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>
          ENABLE DEGEN MODE
        </button>
      )}

      {/* Enable confirmation */}
      {!on && showConfirm && (
        <div style={{
          padding: 10, borderRadius: 4, marginBottom: 8,
          background: D.goldBg, border: `1px solid ${D.gold}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: D.gold, marginBottom: 4 }}>
            ENABLE DEGEN MODE
          </div>
          <div style={{ fontSize: 10, color: D.textSec, lineHeight: 1.4, marginBottom: 8 }}>
            Degen Mode allows you to submit manual trades without repeating
            the normal confirmation/password step. You still choose every
            BUY and SELL. Cupcak8 Swap never chooses trades for you.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowConfirm(false)} style={{
              flex: 1, padding: '8px', background: D.bgAlt, border: `1px solid ${D.border}`,
              borderRadius: 4, color: D.textMuted, fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}>
              CANCEL
            </button>
            <button onClick={() => { enableDegen(walletAddress, activeChain); setShowConfirm(false); }} style={{
              flex: 2, padding: '8px', background: D.gold, border: 'none',
              borderRadius: 4, color: '#000', fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}>
              ENABLE
            </button>
          </div>
        </div>
      )}

      {on && (
        <button onClick={disableDegen} style={{
          width: '100%', padding: '8px', background: 'transparent',
          border: `1px solid ${D.red}`, borderRadius: 4,
          color: D.red, fontSize: 10, fontWeight: 700, cursor: 'pointer',
        }}>
          DISABLE DEGEN MODE
        </button>
      )}

      <style>{`
        @keyframes degen-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
});
