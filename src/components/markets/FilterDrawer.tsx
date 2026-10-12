// Cupcak8 Swap — Filter Drawer
// Slide-out filter panel with warm cream background, pink apply button
import { useState } from 'react';
import { CONFIGURED_CHAINS } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import ChainIcon from '../ChainIcon';

interface FilterState {
  chains: ChainId[];
  minMcap: string;
  maxMcap: string;
  minLiquidity: string;
  minVolume: string;
  maxAge: string;
  minHolders: string;
  riskLevel: string;
  securityLevel: string;
  dex: string;
  buyPressure: string;
  smartMoney: string;
}

const DEFAULT_FILTERS: FilterState = {
  chains: [], minMcap: '', maxMcap: '', minLiquidity: '', minVolume: '',
  maxAge: '', minHolders: '', riskLevel: '', securityLevel: '',
  dex: '', buyPressure: '', smartMoney: '',
};

const AGE_OPTIONS = ['1h', '6h', '24h', '7d', '30d'];
const RISK_OPTIONS = ['Any', 'Low', 'Medium', 'High'];
const SECURITY_OPTIONS = ['Any', 'Good', 'Warning', 'Danger'];
const BUY_PRESSURE = ['Any', '>60% Buys', '>70% Buys', '>80% Buys'];
const SMART_MONEY = ['Any', 'Active', 'None'];

interface Props {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onApply: (f: FilterState) => void;
}

export default function FilterDrawer({ open, onClose, filters, onApply }: Props) {
  const [local, setLocal] = useState(filters);
  if (!open) return null;

  const toggleChain = (id: ChainId) => {
    setLocal(f => ({
      ...f,
      chains: f.chains.includes(id) ? f.chains.filter(c => c !== id) : [...f.chains, id],
    }));
  };

  const activeCount = [
    local.chains.length > 0, !!local.minMcap, !!local.maxMcap, !!local.minLiquidity,
    !!local.minVolume, !!local.maxAge, !!local.minHolders,
    local.riskLevel && local.riskLevel !== 'Any',
    local.securityLevel && local.securityLevel !== 'Any',
    local.buyPressure && local.buyPressure !== 'Any',
    local.smartMoney && local.smartMoney !== 'Any',
  ].filter(Boolean).length;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(61,43,31,0.25)', backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 901,
        width: 340, maxWidth: '90vw', background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 20px rgba(61,43,31,0.08)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.2s ease-out',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-bright)', letterSpacing: '0.06em' }}>
            ⚙ Filters
          </span>
          {activeCount > 0 && (
            <span style={{
              background: 'var(--green-bg)', color: '#E8547C',
              padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
            }}>{activeCount}</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '4px 10px',
            cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)',
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          <Section label="Network">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CONFIGURED_CHAINS.map(c => {
                const active = local.chains.includes(c.id as ChainId);
                return (
                  <button key={c.id} onClick={() => toggleChain(c.id as ChainId)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 12px', fontSize: 11, fontWeight: 700,
                    background: active ? 'var(--green-bg)' : 'var(--bg-elevated)',
                    border: `1px solid ${active ? '#E8547C' : 'var(--border)'}`,
                    borderRadius: 16, cursor: 'pointer',
                    color: active ? '#E8547C' : 'var(--text-dim)',
                    transition: 'all 0.12s',
                  }}>
                    <ChainIcon chainId={c.id as ChainId} size={10} />{c.shortName}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label="Market Cap">
            <div style={{ display: 'flex', gap: 8 }}>
              <FilterInput placeholder="Min" value={local.minMcap} onChange={v => setLocal(f => ({ ...f, minMcap: v }))} />
              <FilterInput placeholder="Max" value={local.maxMcap} onChange={v => setLocal(f => ({ ...f, maxMcap: v }))} />
            </div>
          </Section>

          <Section label="Min Liquidity">
            <FilterInput placeholder="Min liquidity ($)" value={local.minLiquidity} onChange={v => setLocal(f => ({ ...f, minLiquidity: v }))} />
          </Section>

          <Section label="24H Volume">
            <FilterInput placeholder="Min volume ($)" value={local.minVolume} onChange={v => setLocal(f => ({ ...f, minVolume: v }))} />
          </Section>

          <Section label="Max Age">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {AGE_OPTIONS.map(a => (
                <Chip key={a} active={local.maxAge === a}
                  onClick={() => setLocal(f => ({ ...f, maxAge: f.maxAge === a ? '' : a }))}>{a}</Chip>
              ))}
            </div>
          </Section>

          <Section label="Risk Level">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {RISK_OPTIONS.map(r => (
                <Chip key={r} active={local.riskLevel === r}
                  onClick={() => setLocal(f => ({ ...f, riskLevel: r }))}>{r}</Chip>
              ))}
            </div>
          </Section>

          <Section label="Buy Pressure">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BUY_PRESSURE.map(b => (
                <Chip key={b} active={local.buyPressure === b}
                  onClick={() => setLocal(f => ({ ...f, buyPressure: b }))}>{b}</Chip>
              ))}
            </div>
          </Section>

          <Section label="Smart Money">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SMART_MONEY.map(s => (
                <Chip key={s} active={local.smartMoney === s}
                  onClick={() => setLocal(f => ({ ...f, smartMoney: s }))}>{s}</Chip>
              ))}
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
        }}>
          <button onClick={() => { setLocal(DEFAULT_FILTERS); onApply(DEFAULT_FILTERS); }} style={{
            padding: '8px 16px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>Reset</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => { onApply(local); onClose(); }} style={{
            padding: '10px 24px', background: '#E8547C', border: 'none',
            borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', transition: 'background 0.12s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#D14068'}
            onMouseLeave={e => e.currentTarget.style.background = '#E8547C'}
          >Apply Filters</button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 14px', fontSize: 11, fontWeight: 600,
      background: active ? 'var(--green-bg)' : 'var(--bg-elevated)',
      border: `1px solid ${active ? '#E8547C' : 'var(--border)'}`,
      borderRadius: 16, cursor: 'pointer',
      color: active ? '#E8547C' : 'var(--text-dim)',
      transition: 'all 0.12s',
    }}>{children}</button>
  );
}

function FilterInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input type="number" placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)} style={{
        width: '100%', padding: '7px 12px', fontSize: 12,
        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-elevated)', color: 'var(--text-bright)',
        outline: 'none', boxSizing: 'border-box',
      }}
      onFocus={e => e.currentTarget.style.borderColor = '#E8547C'}
      onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
    />
  );
}

export type { FilterState };
export { DEFAULT_FILTERS };