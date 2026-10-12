// Cupcak8 Swap — Chain-Specific Launchpad Logo Selector
// Horizontal row of launchpad logos that updates dynamically with chain selection
import { memo, useEffect, useRef, useState } from 'react';
import type { ChainId } from '../../lib/config';
import {
  getLaunchpadsForChain, getLaunchpadLogo,
  type LaunchpadLogo,
} from '../../lib/launchpad-logos';

interface Props {
  chain: ChainId | 'all';
  selectedLaunchpad: string | null;
  onSelect: (id: string | null) => void;
}

export default memo(function LaunchpadLogoSelector({ chain, selectedLaunchpad, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());

  // Reset selection when chain changes
  const prevChain = useRef(chain);
  useEffect(() => {
    if (prevChain.current !== chain) {
      prevChain.current = chain;
      if (selectedLaunchpad) onSelect(null);
    }
  }, [chain, selectedLaunchpad, onSelect]);

  if (chain === 'all') return null;

  const launchpadIds = getLaunchpadsForChain(chain);
  if (launchpadIds.length === 0) return null;

  const logos: LaunchpadLogo[] = launchpadIds
    .map(id => getLaunchpadLogo(id))
    .filter((l): l is LaunchpadLogo => l !== null);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 12px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      overflow: 'hidden',
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap',
      }}>
        LAUNCHPADS
      </span>
      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 5, overflowX: 'auto',
          scrollbarWidth: 'none', flex: 1, minWidth: 0,
          WebkitOverflowScrolling: 'touch',
        }}
        className="launchpad-logo-scroll"
      >
        {logos.map(lp => {
          const isActive = selectedLaunchpad === lp.id;
          return (
            <button
              key={lp.id}
              onClick={() => onSelect(isActive ? null : lp.id)}
              title={lp.displayName}
              style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center',
                gap: 5, padding: '3px 8px',
                background: isActive ? lp.bgColor : 'var(--bg-elevated)',
                border: `1.5px solid ${isActive ? lp.color : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', flexShrink: 0,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = lp.color; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              {/* Logo */}
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: lp.bgColor,
                border: `1px solid ${lp.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {!failedLogos.has(lp.id) ? (
                  <img
                    src={lp.imgSrc}
                    alt={lp.displayName}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={() => setFailedLogos(prev => new Set(prev).add(lp.id))}
                  />
                ) : (
                  <span style={{
                    fontSize: 7, fontWeight: 900,
                    fontFamily: 'var(--font-mono)',
                    color: lp.color,
                    letterSpacing: '-0.02em',
                  }}>{lp.initials}</span>
                )}
              </div>
              {/* Label */}
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: isActive ? lp.color : 'var(--text-dim)',
                whiteSpace: 'nowrap', lineHeight: 1,
              }}>
                {lp.displayName}
              </span>
            </button>
          );
        })}
      </div>
      {/* Clear selection */}
      {selectedLaunchpad && (
        <button
          onClick={() => onSelect(null)}
          style={{
            padding: '4px 10px', fontSize: 10, fontWeight: 700,
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: 'var(--text-dim)', flexShrink: 0,
            whiteSpace: 'nowrap', transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
        >
          ✕ Clear
        </button>
      )}
      <style>{`
        .launchpad-logo-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
});
