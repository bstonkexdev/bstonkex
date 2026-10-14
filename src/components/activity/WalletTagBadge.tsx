// Cupcak8 Swap — Wallet Tag Badge Component
// Renders wallet tags (SmartMoney, KOL, Sniper, Cabal, Followed, Creator)
// Matches ave.ai badge style: icon + shortened address

import type { WalletTags } from '../../lib/engine/trade-stream';

interface Props {
  tags: WalletTags;
  trader: string;       // Shortened address (e.g., "*1307")
  tradeCount?: number;  // Trades on this token
  compact?: boolean;    // Compact mode for trade list
}

const BG = '#12161f';
const GREEN = '#10b981';
const CYAN = '#0088FF';
const PURPLE = '#a78bfa';
const AMBER = '#FFD700';
const RED = '#ef4444';
const TEXT_DIM = 'rgba(255,255,255,0.35)';

// ── Tag Config ───────────────────────────────────────────────

interface TagConfig {
  icon: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  priority: number; // Higher = shown first
}

const TAG_CONFIGS: Record<keyof WalletTags, TagConfig> = {
  isCreator:   { icon: '👑', label: 'CREATOR', color: AMBER,  bg: 'rgba(255,215,0,0.1)',  border: 'rgba(255,215,0,0.3)',  priority: 100 },
  isSmartMoney:{ icon: '🍃', label: 'SMART',   color: GREEN,  bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', priority: 90 },
  isKOL:       { icon: '📢', label: 'KOL',     color: PURPLE, bg: 'rgba(167,139,250,0.1)',border: 'rgba(167,139,250,0.3)',priority: 80 },
  isSniper:    { icon: '⚡', label: 'SNIPER',  color: CYAN,   bg: 'rgba(0,136,255,0.1)',  border: 'rgba(0,136,255,0.3)', priority: 70 },
  isCabal:     { icon: '🤝', label: 'CABAL',   color: RED,    bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)', priority: 60 },
  isFollowed:  { icon: '👁', label: 'FOLLOW',  color: AMBER,  bg: 'rgba(255,215,0,0.1)',  border: 'rgba(255,215,0,0.3)', priority: 50 },
};

// ── Main Component ──────────────────────────────────────────

export default function WalletTagBadge({ tags, trader, tradeCount, compact }: Props) {
  // Get active tags sorted by priority
  const activeTags = (Object.keys(tags) as Array<keyof WalletTags>)
    .filter(key => tags[key])
    .map(key => ({ key, ...TAG_CONFIGS[key] }))
    .sort((a, b) => b.priority - a.priority);

  const primaryTag = activeTags[0];

  if (compact) {
    // Compact mode: single badge with primary tag icon + trader
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 9,
        fontWeight: 700,
        fontFamily: 'monospace',
      }}>
        {primaryTag && (
          <span style={{
            fontSize: 8,
            padding: '1px 4px',
            borderRadius: 3,
            border: `1px solid ${primaryTag.border}`,
            background: primaryTag.bg,
            color: primaryTag.color,
          }}>
            {primaryTag.icon}
          </span>
        )}
        <span style={{ color: primaryTag ? primaryTag.color : TEXT_DIM }}>
          {trader}
        </span>
        {tradeCount != null && tradeCount > 1 && (
          <span style={{ fontSize: 7, color: TEXT_DIM }}>
            ({tradeCount})
          </span>
        )}
      </span>
    );
  }

  // Full mode: all tags + trader
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 9,
        fontWeight: 800,
        fontFamily: 'monospace',
        color: primaryTag ? primaryTag.color : TEXT_DIM,
      }}>
        {trader}
        {tradeCount != null && tradeCount > 1 && (
          <span style={{ fontSize: 7, color: TEXT_DIM, marginLeft: 2 }}>
            ({tradeCount})
          </span>
        )}
      </span>
      {activeTags.map(tag => (
        <span key={tag.key} style={{
          fontSize: 7,
          fontWeight: 800,
          padding: '1px 5px',
          borderRadius: 3,
          border: `1px solid ${tag.border}`,
          background: tag.bg,
          color: tag.color,
          letterSpacing: '0.05em',
        }}>
          {tag.icon} {tag.label}
        </span>
      ))}
    </span>
  );
}