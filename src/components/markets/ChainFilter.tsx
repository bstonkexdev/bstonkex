import { CHAINS, CONFIGURED_CHAINS } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { ChainReadiness } from '../../lib/engine/chain-readiness';
import ChainIcon from '../ChainIcon';

interface Props {
  selected: ChainId | 'all';
  onChange: (chain: ChainId | 'all') => void;
  readiness: ChainReadiness[];
}

export default function ChainFilter({ selected, onChange, readiness }: Props) {
  const chainStatus = (chainId: string): 'live' | 'delayed' | 'offline' => {
    const r = readiness.find(c => c.chainId === chainId);
    if (!r) return 'offline';
    if (r.mode === 'trading_enabled') return 'live';
    if (r.mode === 'market_data_only') return 'delayed';
    return 'offline';
  };

  return (
    <div style={{
      display: 'flex', gap: 4,
      padding: '6px 16px',
      borderBottom: 'var(--pixel) solid var(--border)',
      flexShrink: 0,
      overflowX: 'auto',
      alignItems: 'center',
    }}>
      {/* Label */}
      <span style={{
        fontSize: 7, fontWeight: 700,
        color: 'var(--text-dim)',
        letterSpacing: '0.08em',
        marginRight: 4,
        flexShrink: 0,
      }}>
        CHAIN
      </span>

      {/* ALL button */}
      <button
        className={`btn btn-sm ${selected === 'all' ? 'btn-cyan' : ''}`}
        style={{ fontSize: 8, padding: '2px 8px', minWidth: 0 }}
        onClick={() => onChange('all')}
      >
        ALL CHAINS
      </button>

      {/* Chain buttons */}
      {CONFIGURED_CHAINS.map(chain => {
        const status = chainStatus(chain.id);
        const statusColor = status === 'live' ? 'var(--green)' : status === 'delayed' ? 'var(--amber)' : 'var(--red)';

        return (
          <button
            key={chain.id}
            className={`btn btn-sm ${selected === chain.id ? 'btn-cyan' : ''}`}
            style={{
              fontSize: 8, padding: '2px 8px', minWidth: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            onClick={() => onChange(chain.id)}
          >
            <ChainIcon chainId={chain.id as ChainId} size={12} />
            <span style={{ color: chain.color }}>{chain.shortName}</span>
            <span style={{
              width: 4, height: 4, borderRadius: '50%',
              background: statusColor,
              boxShadow: status === 'live' ? `0 0 3px ${statusColor}` : 'none',
              flexShrink: 0,
            }} />
          </button>
        );
      })}
    </div>
  );
}