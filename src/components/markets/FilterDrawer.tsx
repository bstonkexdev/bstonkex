import { useState } from 'react';
import { CHAINS, CONFIGURED_CHAINS } from '../../lib/config';
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
    local.chains.length > 0,
    !!local.minMcap, !!local.maxMcap, !!local.minLiquidity,
    !!local.minVolume, !!local.maxAge, !!local.minHolders,
    local.riskLevel && local.riskLevel !== 'Any',
    local.securityLevel && local.securityLevel !== 'Any',
    local.buyPressure && local.buyPressure !== 'Any',
    local.smartMoney && local.smartMoney !== 'Any',
  ].filter(Boolean).length;

  return (
    <div className="filter-drawer-overlay" onClick={onClose}>
      <div className="filter-drawer" onClick={e => e.stopPropagation()}>
        <div className="filter-drawer-header">
          <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.1em' }}>FILTERS</span>
          {activeCount > 0 && <span style={{ fontSize: 8, color: 'var(--cyan)' }}>{activeCount} ACTIVE</span>}
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={onClose} style={{ fontSize: 8 }}>✕</button>
        </div>

        <div className="filter-drawer-body">
          {/* Chains */}
          <FilterSection label="CHAIN">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {CONFIGURED_CHAINS.map(c => (
                <button key={c.id}
                  className={`filter-chip ${local.chains.includes(c.id as ChainId) ? 'active' : ''}`}
                  onClick={() => toggleChain(c.id as ChainId)}
                  style={{ borderColor: c.color, color: local.chains.includes(c.id as ChainId) ? c.color : undefined, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  <ChainIcon chainId={c.id as ChainId} size={10} />{c.shortName}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Market Cap */}
          <FilterSection label="MARKET CAP">
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="filter-input" placeholder="Min" type="number" value={local.minMcap}
                onChange={e => setLocal(f => ({ ...f, minMcap: e.target.value }))} />
              <input className="filter-input" placeholder="Max" type="number" value={local.maxMcap}
                onChange={e => setLocal(f => ({ ...f, maxMcap: e.target.value }))} />
            </div>
          </FilterSection>

          {/* Liquidity */}
          <FilterSection label="LIQUIDITY">
            <input className="filter-input" placeholder="Min liquidity" type="number" value={local.minLiquidity}
              onChange={e => setLocal(f => ({ ...f, minLiquidity: e.target.value }))} />
          </FilterSection>

          {/* Volume */}
          <FilterSection label="24H VOLUME">
            <input className="filter-input" placeholder="Min volume" type="number" value={local.minVolume}
              onChange={e => setLocal(f => ({ ...f, minVolume: e.target.value }))} />
          </FilterSection>

          {/* Age */}
          <FilterSection label="MAX AGE">
            <div style={{ display: 'flex', gap: 4 }}>
              {AGE_OPTIONS.map(a => (
                <button key={a} className={`filter-chip ${local.maxAge === a ? 'active' : ''}`}
                  onClick={() => setLocal(f => ({ ...f, maxAge: f.maxAge === a ? '' : a }))}>
                  {a}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Holders */}
          <FilterSection label="MIN HOLDERS">
            <input className="filter-input" placeholder="Min holders" type="number" value={local.minHolders}
              onChange={e => setLocal(f => ({ ...f, minHolders: e.target.value }))} />
          </FilterSection>

          {/* Risk */}
          <FilterSection label="RISK LEVEL">
            <div style={{ display: 'flex', gap: 4 }}>
              {RISK_OPTIONS.map(r => (
                <button key={r} className={`filter-chip ${local.riskLevel === r ? 'active' : ''}`}
                  onClick={() => setLocal(f => ({ ...f, riskLevel: r }))}>
                  {r}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Security */}
          <FilterSection label="SECURITY">
            <div style={{ display: 'flex', gap: 4 }}>
              {SECURITY_OPTIONS.map(s => (
                <button key={s} className={`filter-chip ${local.securityLevel === s ? 'active' : ''}`}
                  onClick={() => setLocal(f => ({ ...f, securityLevel: s }))}>
                  {s}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Buy Pressure */}
          <FilterSection label="BUY PRESSURE">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BUY_PRESSURE.map(b => (
                <button key={b} className={`filter-chip ${local.buyPressure === b ? 'active' : ''}`}
                  onClick={() => setLocal(f => ({ ...f, buyPressure: b }))}>
                  {b}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Smart Money */}
          <FilterSection label="SMART MONEY">
            <div style={{ display: 'flex', gap: 4 }}>
              {SMART_MONEY.map(s => (
                <button key={s} className={`filter-chip ${local.smartMoney === s ? 'active' : ''}`}
                  onClick={() => setLocal(f => ({ ...f, smartMoney: s }))}>
                  {s}
                </button>
              ))}
            </div>
          </FilterSection>
        </div>

        <div className="filter-drawer-footer">
          <button className="btn btn-sm" onClick={() => { setLocal(DEFAULT_FILTERS); onApply(DEFAULT_FILTERS); }}
            style={{ fontSize: 8 }}>
            RESET ALL
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm btn-cyan" onClick={() => { onApply(local); onClose(); }}
            style={{ fontSize: 8 }}>
            APPLY FILTERS
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="filter-section">
      <div className="filter-section-label">{label}</div>
      {children}
    </div>
  );
}

export type { FilterState };
export { DEFAULT_FILTERS };