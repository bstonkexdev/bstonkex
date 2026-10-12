// Cupcak8 Swap — Chain Filter Pills
// Pink active state, warm hover, chain icons
import { memo } from 'react';
import { CONFIGURED_CHAINS } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import ChainIcon from '../ChainIcon';

interface Props {
  active: ChainId | 'all';
  onChange: (chain: ChainId | 'all') => void;
}

export default memo(function MarketChainFilter({ active, onChange }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 16px', overflowX: 'auto', flexShrink: 0,
    }}>
      <FilterPill label="All Chains" active={active === 'all'} onClick={() => onChange('all')} />
      {CONFIGURED_CHAINS.map(c => (
        <FilterPill
          key={c.id}
          label={c.shortName}
          icon={<ChainIcon chainId={c.id as ChainId} size={14} />}
          active={active === c.id}
          onClick={() => onChange(c.id as ChainId)}
        />
      ))}
    </div>
  );
});

function FilterPill({ label, icon, active, onClick }: {
  label: string; icon?: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '6px 14px', fontSize: 11, fontWeight: 700,
      background: active ? 'var(--green-bg)' : 'var(--bg-elevated)',
      border: `1px solid ${active ? '#E8547C' : 'var(--border)'}`,
      borderRadius: 20, cursor: 'pointer',
      color: active ? '#E8547C' : 'var(--text-dim)',
      letterSpacing: '0.02em', flexShrink: 0,
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-bright)'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.borderColor = 'var(--border)'; } }}
    >
      {icon}
      {label}
    </button>
  );
}