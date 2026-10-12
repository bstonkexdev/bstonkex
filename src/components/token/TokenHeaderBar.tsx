// Cupcak8 Swap — Token page header: identity + actions (responsive, shared by mobile/desktop)
import { useState } from 'react';
import type { ChainId } from '../../lib/config';
import { CHAINS, shortenAddress, explorerAddressUrl } from '../../lib/config';
import { formatAge } from '../../lib/token-page-data';
import ChainIcon from '../ChainIcon';

interface Props {
  symbol: string;
  name: string;
  icon: string | null;
  chainId: ChainId;
  /** Verified execution contract (or reference route contract) — '' = none. */
  address: string;
  pairCreatedAt: number | null;
  isWatched: boolean;
  onToggleWatch: () => void;
  onBack: () => void;
  onToggleFullscreen?: () => void;
  alertEnabled: boolean;
  onToggleAlert: () => void;
}

export default function TokenHeaderBar({
  symbol, name, icon, chainId, address, pairCreatedAt,
  isWatched, onToggleWatch, onBack, onToggleFullscreen, alertEnabled, onToggleAlert,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const chain = CHAINS[chainId];
  const age = formatAge(pairCreatedAt);

  const copy = async (text: string, tag: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); window.setTimeout(() => setCopied(''), 1200); } catch { /* ignore */ }
  };
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${symbol} on Cupcak8 Swap`, url }); return; } catch { /* fall through */ }
    }
    copy(url, 'link');
  };

  const iconBtn: React.CSSProperties = {
    minWidth: 34, height: 32, padding: '0 8px', fontSize: 13, lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)',
    cursor: 'pointer', borderRadius: 4,
    transition: 'background 0.12s, border-color 0.12s',
  };

  return (
    <div className="token-header-bar">
      {/* Back */}
      <button style={iconBtn} onClick={onBack} title="Back to markets" aria-label="Back">‹</button>

      {/* Logo */}
      {icon ? (
        <img src={icon} alt="" width={26} height={26}
          style={{ border: '1px solid var(--border)', borderRadius: 2, flexShrink: 0 }}
          onError={e => (e.currentTarget.style.display = 'none')} />
      ) : (
        <div style={{ width: 26, height: 26, border: '1px solid var(--border)', background: 'var(--bg-alt, #101624)', borderRadius: 2, flexShrink: 0 }} />
      )}

      {/* Name + symbol + chain badge */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-bright)', whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}>{symbol}</span>
          <span style={{
            fontSize: 7, fontWeight: 800, padding: '1px 4px', whiteSpace: 'nowrap',
            border: `1px solid ${chain.color}`, color: chain.color,
          }}>
            {chain.shortName}
          </span>
          <span style={{ fontSize: 8, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ChainIcon chainId={chainId} size={11} />
          {address ? (
            <button className="thb-chip" style={{ cursor: 'pointer' }} onClick={() => copy(address, 'addr')}
              title={address}>
              {copied === 'addr' ? 'COPIED' : shortenAddress(address, 4)} ⧉
            </button>
          ) : (
            <span className="thb-chip" style={{ color: 'var(--text-muted)' }}>NO CONTRACT</span>
          )}
          {age && <span className="thb-chip" title="Age of the primary liquidity pool">AGE {age}</span>}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 4 }} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
        <button style={{ ...iconBtn, color: alertEnabled ? 'var(--amber, #FFD700)' : 'var(--text-dim)', borderColor: alertEnabled ? 'var(--amber, #FFD700)' : 'var(--border)' }}
          onClick={onToggleAlert} title={alertEnabled ? 'Price alerts ON — click to disable' : 'Enable price alerts'} aria-label="Alerts">
          {alertEnabled ? '🔔' : '🔕'}
        </button>
        <button style={{ ...iconBtn, color: isWatched ? 'var(--amber, #FFD700)' : 'var(--text-dim)', borderColor: isWatched ? 'var(--amber, #FFD700)' : 'var(--border)' }}
          onClick={onToggleWatch} title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'} aria-label="Watchlist">
          {isWatched ? '★' : '☆'}
        </button>
        <button style={iconBtn} onClick={share} title="Share" aria-label="Share">↗</button>
        <div style={{ position: 'relative' }}>
          <button style={iconBtn} onClick={() => setMenuOpen(v => !v)} title="More" aria-label="More">⋯</button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
              <div className="thb-menu" style={{ position: 'absolute', right: 0, top: 32, zIndex: 50, minWidth: 170 }}>
                {address && (
                  <button onClick={() => { copy(address, 'addr2'); setMenuOpen(false); }}>
                    {copied === 'addr2' ? 'COPIED ✓' : 'COPY CONTRACT'}
                  </button>
                )}
                <button onClick={() => { share(); setMenuOpen(false); }}>COPY PAGE LINK</button>
                {address && (
                  <a href={explorerAddressUrl(chainId, address)} target="_blank" rel="noopener"
                    onClick={() => setMenuOpen(false)}>VIEW ON {chain.explorerName.toUpperCase()} ↗</a>
                )}
                {onToggleFullscreen && (
                  <button onClick={() => { onToggleFullscreen(); setMenuOpen(false); }}>FULLSCREEN CHART</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
