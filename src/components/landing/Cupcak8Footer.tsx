// Cupcak8 — Footer
// Organized link groups, brand mark, supported chains, copyright
import { useApp } from '../../lib/context';
import { CONFIGURED_CHAINS } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import ChainIcon from '../ChainIcon';

type Page = Parameters<ReturnType<typeof useApp>['setPage']>[0];

interface FooterLink {
  id: Page;
  label: string;
}

const TRADING_LINKS: FooterLink[] = [
  { id: 'markets', label: 'Markets' },
  { id: 'trade', label: 'Trade' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'watchlist', label: 'Watchlist' },
];

const REWARDS_LINKS: FooterLink[] = [
  { id: 'launchpad', label: 'Launchpad' },
  { id: 'reward', label: 'Rewards' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'activity', label: 'Activity' },
];

const INFO_LINKS: FooterLink[] = [
  { id: 'settings', label: 'Settings' },
];

function FooterLinkButton({ link, onClick }: { link: FooterLink; onClick: (id: Page) => void }) {
  return (
    <button
      onClick={() => onClick(link.id)}
      style={{
        background: 'none', border: 'none', padding: 0,
        cursor: 'pointer', textAlign: 'left',
        fontSize: 12, color: 'var(--text-dim)',
        transition: 'color 0.15s',
        lineHeight: 1.4,
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#E8547C'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; }}
    >
      {link.label}
    </button>
  );
}

function LinkColumn({ title, links, onClick }: { title: string; links: FooterLink[]; onClick: (id: Page) => void }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#E8547C',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 10, fontFamily: 'var(--font-pixel)',
      }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {links.map(l => <FooterLinkButton key={l.id} link={l} onClick={onClick} />)}
      </div>
    </div>
  );
}

export default function Cupcak8Footer() {
  const { setPage } = useApp();

  return (
    <footer style={{
      borderTop: '2px solid var(--border)',
      background: 'var(--bg-surface)',
      flexShrink: 0,
    }}>
      <style>{`
        .footer-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr 1fr;
          gap: 28px;
          padding: 32px 24px 28px;
          max-width: 1000px;
          margin: 0 auto;
          box-sizing: border-box;
          width: 100%;
        }
        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr 1fr;
            gap: 24px 20px;
            padding: 24px 16px 20px;
          }
        }
        @media (max-width: 400px) {
          .footer-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        }
      `}</style>

      <div className="footer-grid">
        {/* Brand column */}
        <div>
          <div style={{
            fontFamily: 'var(--font-pixel)', fontSize: 11, color: '#E8547C',
            marginBottom: 8,
          }}>Cupcak8 Swap</div>
          <div style={{
            fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6,
            maxWidth: 240,
          }}>
            Sweet Looks. Serious Trading.
          </div>
          <div style={{
            display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12,
          }}>
            {CONFIGURED_CHAINS.map(c => (
              <span key={c.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
                padding: '2px 6px', border: '1px solid var(--border)',
                borderRadius: 4,
              }}>
                <ChainIcon chainId={c.id as ChainId} size={10} />
                {c.shortName}
              </span>
            ))}
          </div>
        </div>

        {/* Trading */}
        <LinkColumn title="Trading" links={TRADING_LINKS} onClick={setPage} />

        {/* Rewards */}
        <LinkColumn title="Rewards" links={REWARDS_LINKS} onClick={setPage} />

        {/* Info */}
        <div>
          <LinkColumn title="Info" links={INFO_LINKS} onClick={setPage} />
          <div style={{ marginTop: 14 }}>
            <div style={{
              fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6,
            }}>
              Non-custodial · On-chain transactions
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '12px 24px',
        textAlign: 'center', fontSize: 10, color: 'var(--text-muted)',
      }}>
        © {new Date().getFullYear()} Cupcak8 Swap · Multichain Trading Terminal
      </div>
    </footer>
  );
}