import { useState, useRef, useEffect, useCallback } from 'react';
import { CHAINS, CONFIGURED_CHAINS } from '../lib/config';
import type { ChainId } from '../lib/config';
import ChainIcon from './ChainIcon';

interface Props {
  value: ChainId | 'all';
  onChange: (chain: ChainId | 'all') => void;
}

export default function ChainSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close on click outside (desktop)
  useEffect(() => {
    if (!open || isMobile) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, isMobile]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleSelect = useCallback((id: ChainId | 'all') => {
    onChange(id);
    setOpen(false);
  }, [onChange]);

  const displayChain = value === 'all' ? null : CHAINS[value];
  const label = value === 'all' ? 'ALL' : displayChain?.shortName ?? 'SELECT';

  return (
    <div ref={containerRef} className="chain-selector-wrap">
      {/* Trigger button */}
      <button className="chain-selector-trigger" onClick={() => setOpen(v => !v)}>
        <ChainIcon chainId={value} size={14} />
        <span className="chain-selector-label">{label}</span>
        <svg width="7" height="7" viewBox="0 0 12 12" fill="none"
          style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Desktop floating panel */}
      {open && !isMobile && (
        <div className="chain-selector-panel">
          <div className="chain-selector-header">SELECT CHAIN</div>
          <button
            className={`chain-selector-option ${value === 'all' ? 'active' : ''}`}
            onClick={() => handleSelect('all')}
          >
            <ChainIcon chainId="all" size={22} />
            <div className="chain-option-info">
              <span className="chain-option-name">All Chains</span>
              <span className="chain-option-id">ALL NETWORKS</span>
            </div>
            {value === 'all' && <span className="chain-check">✓</span>}
          </button>
          {CONFIGURED_CHAINS.map(chain => (
            <button
              key={chain.id}
              className={`chain-selector-option ${value === chain.id ? 'active' : ''}`}
              onClick={() => handleSelect(chain.id)}
            >
              <ChainIcon chainId={chain.id} size={22} />
              <div className="chain-option-info">
                <span className="chain-option-name">{chain.name}</span>
                <span className="chain-option-id">{chain.shortName}</span>
              </div>
              {value === chain.id && <span className="chain-check">✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Mobile bottom sheet */}
      {open && isMobile && (
        <div className="chain-sheet-overlay" onClick={() => setOpen(false)}>
          <div className="chain-sheet" onClick={e => e.stopPropagation()}>
            <div className="chain-sheet-handle" />
            <div className="chain-selector-header">SELECT CHAIN</div>
            <button
              className={`chain-sheet-option ${value === 'all' ? 'active' : ''}`}
              onClick={() => handleSelect('all')}
            >
              <ChainIcon chainId="all" size={26} />
              <span className="chain-sheet-name">All Chains</span>
              <span className="chain-sheet-id">ALL</span>
              {value === 'all' && <span className="chain-check">✓</span>}
            </button>
            {CONFIGURED_CHAINS.map(chain => (
              <button
                key={chain.id}
                className={`chain-sheet-option ${value === chain.id ? 'active' : ''}`}
                onClick={() => handleSelect(chain.id)}
              >
                <ChainIcon chainId={chain.id} size={26} />
                <span className="chain-sheet-name">{chain.name}</span>
                <span className="chain-sheet-id">{chain.shortName}</span>
                {value === chain.id && <span className="chain-check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}