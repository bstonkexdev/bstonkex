// Cupcak8 Swap — Chain-specific Launchpad Selector
// Shows real-time status for each launchpad integration
import { memo, useState, useEffect } from 'react';
import type { ChainId } from '../../lib/config';
import { getLaunchpads, type ChainLaunchpads } from '../../lib/launchpads';
import { getLaunchpadAdapterHealth, type LaunchpadHealth } from '../../lib/engine/launchpad-adapters';

interface Props {
  chain: ChainId | 'all';
  selectedLaunchpad: string | null;
  onSelect: (id: string | null) => void;
}

export default memo(function LaunchpadSelector({ chain, selectedLaunchpad, onSelect }: Props) {
  const data: ChainLaunchpads | null = getLaunchpads(chain);
  const [healthMap, setHealthMap] = useState<Record<string, LaunchpadHealth>>({});

  useEffect(() => {
    if (!data) return;
    const update = () => {
      const map: Record<string, LaunchpadHealth> = {};
      for (const lp of data.launchpads) {
        map[lp.id] = getLaunchpadAdapterHealth(lp.id);
      }
      setHealthMap(map);
    };
    update();
    const iv = setInterval(update, 10_000);
    return () => clearInterval(iv);
  }, [data]);

  if (!data) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 16px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-elevated)',
      overflowX: 'auto', flexShrink: 0,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.04em', flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        {data.label}
      </span>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {data.launchpads.map(lp => {
          const isActive = selectedLaunchpad === lp.id;
          const health = healthMap[lp.id];
          const statusColor = health?.status === 'active' ? 'var(--lime-dim)'
            : health?.status === 'indexing_delayed' ? 'var(--yellow-dim)'
            : health?.status === 'offline' ? 'var(--red)'
            : 'var(--text-muted)';
          const statusLabel = health?.status === 'active' ? 'Live'
            : health?.status === 'indexing_delayed' ? 'Delayed'
            : health?.status === 'offline' ? 'Offline'
            : null;

          return (
            <button
              key={lp.id}
              onClick={() => onSelect(isActive ? null : lp.id)}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 700,
                background: isActive ? 'var(--yellow-bg)' : 'var(--bg-surface)',
                border: `1px solid ${isActive ? 'var(--yellow)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: isActive ? 'var(--yellow-dim)' : 'var(--text-dim)',
                letterSpacing: '0.02em', flexShrink: 0,
                whiteSpace: 'nowrap',
                transition: 'all 0.12s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border-bright)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              {lp.shortName}
              {statusLabel && (
                <span style={{
                  fontSize: 9, fontWeight: 600, color: statusColor,
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: statusColor,
                  }} />
                  {statusLabel}
                </span>
              )}
              {!lp.enabled && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>⊘</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});