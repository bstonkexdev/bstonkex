import { CONFIGURED_CHAINS } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import ChainIcon from '../ChainIcon';

export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)', padding: '12px 16px',
      display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start',
      fontSize: 8, color: 'var(--text-dim)', background: 'var(--bg-panel)',
    }}>
      {/* Brand */}
      <div style={{ minWidth: 120 }}>
        <div style={{ fontWeight: 900, fontSize: 11, color: 'var(--text-bright)', letterSpacing: '0.1em', marginBottom: 4 }}>BSTONKEX</div>
        <div style={{ fontSize: 7, lineHeight: 1.6 }}>
          Multi-Chain Trading Terminal<br />
          Non-Custodial · Multi-Chain · Real Data
        </div>
      </div>
      {/* Navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>NAVIGATION</span>
        {['Markets', 'Trade', 'Portfolio', 'Activity', 'Watchlist', 'Referrals'].map(l => (
          <span key={l} style={{ cursor: 'pointer' }}>{l}</span>
        ))}
      </div>
      {/* Supported Chains */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>SUPPORTED CHAINS</span>
        {CONFIGURED_CHAINS.map(c => (
          <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChainIcon chainId={c.id as ChainId} size={10} />
            <span style={{ color: c.color, fontWeight: 700 }}>{c.shortName}</span>
            <span>{c.name}</span>
          </span>
        ))}
      </div>
      {/* Risk Disclosure */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <span style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 2, display: 'block' }}>RISK DISCLOSURE</span>
        <span style={{ fontSize: 7, lineHeight: 1.5 }}>
          Trading digital assets involves significant risk. Prices can change rapidly. Slippage, network failures, and liquidity issues may occur.
          Smart contract risks exist. Past performance does not guarantee future results.
          BSTONKEX is non-custodial and does not guarantee execution, liquidity, or profits.
        </span>
      </div>
      {/* Bottom bar */}
      <div style={{
        width: '100%', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4,
        display: 'flex', justifyContent: 'space-between', fontSize: 7, color: 'var(--text-muted)',
      }}>
        <span>BSTONKEX v1.0.0 · NON-CUSTODIAL · MULTI-CHAIN · {CONFIGURED_CHAINS.length} CHAINS ACTIVE</span>
        <span>Terms · Privacy · Risk Disclosure</span>
      </div>
    </footer>
  );
}