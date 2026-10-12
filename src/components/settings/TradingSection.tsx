// Cupcak8 Swap — Trading Preferences Settings Section
import type { TradingSettings } from '../../lib/settings-store';
import { PLATFORM_FEE_PCT } from '../../lib/config';

const SLIPPAGE_OPTIONS = [0.1, 0.5, 1, 3];
const DEADLINE_OPTIONS = [5, 10, 20, 30, 60];

interface Props {
  settings: TradingSettings;
  onChange: (s: TradingSettings) => void;
}

export default function TradingSection({ settings, onChange }: Props) {
  return (
    <div className="ref-card">
      <div className="ref-card-header">TRADING PREFERENCES</div>

      {/* Slippage Tolerance */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
          Slippage Tolerance
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SLIPPAGE_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => onChange({ ...settings, slippage: s })}
              style={{
                padding: '8px 16px',
                background: settings.slippage === s ? 'rgba(232,84,124,0.08)' : 'var(--bg-elevated)',
                border: `1px solid ${settings.slippage === s ? '#E8547C' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                fontSize: 12, fontWeight: settings.slippage === s ? 700 : 400,
                color: settings.slippage === s ? '#E8547C' : 'var(--text)',
              }}
            >
              {s}%
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
          Maximum price movement allowed before trade is rejected
        </div>
      </div>

      {/* Transaction Deadline */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
          Transaction Deadline
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DEADLINE_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => onChange({ ...settings, deadline: d })}
              style={{
                padding: '8px 14px',
                background: settings.deadline === d ? 'rgba(232,84,124,0.08)' : 'var(--bg-elevated)',
                border: `1px solid ${settings.deadline === d ? '#E8547C' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                fontSize: 12, fontWeight: settings.deadline === d ? 700 : 400,
                color: settings.deadline === d ? '#E8547C' : 'var(--text)',
              }}
            >
              {d}m
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
          Trade expires if not confirmed within this time
        </div>
      </div>

      {/* Toggle Settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <ToggleRow
          label="Trade Confirmations"
          description="Show confirmation modal before executing trades"
          value={settings.confirmTrades}
          onChange={v => onChange({ ...settings, confirmTrades: v })}
        />
        <ToggleRow
          label="Price Impact Warnings"
          description="Warn when price impact exceeds safe threshold"
          value={settings.showPriceImpact}
          onChange={v => onChange({ ...settings, showPriceImpact: v })}
        />
      </div>

      {/* Platform Fee Info */}
      <div style={{
        marginTop: 14, padding: '10px 12px', background: 'var(--bg-elevated)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6,
      }}>
        Cupcak8 Swap charges a fixed {(PLATFORM_FEE_PCT * 100).toFixed(2)}% platform fee on all trades.
        This fee is not configurable and funds the referral and cashback reward system.
      </div>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-bright)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 1 }}>{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11, flexShrink: 0,
          background: value ? '#E8547C' : 'var(--border)',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }} />
      </button>
    </div>
  );
}