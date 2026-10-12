// Cupcak8 — Mobile Bottom Navigation Bar
// HOME · MARKET · REWARDS · MONITOR · WALLET
import { useApp } from '../lib/context';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  page: string;
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <circle cx="17" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon />, page: 'landing' },
  { id: 'market', label: 'Market', icon: <ChartIcon />, page: 'markets' },
  { id: 'rewards', label: 'Rewards', icon: <GiftIcon />, page: 'reward' },
  { id: 'monitor', label: 'Monitor', icon: <ActivityIcon />, page: 'activity' },
  { id: 'wallet', label: 'Wallet', icon: <WalletIcon />, page: 'portfolio' },
];

export default function BottomNav() {
  const { page, setPage } = useApp();

  function isActive(item: NavItem): boolean {
    if (item.id === 'home') return page === 'landing';
    if (item.id === 'wallet') return page === 'portfolio' || page === 'watchlist';
    return page === item.page;
  }

  return (
    <nav className="mobile-bottom-nav">
      <div className="mobile-bottom-nav-inner" style={{
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        height: 56,
      }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item);
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.page as any)}
              aria-label={item.label}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, padding: '4px 8px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? '#E8547C' : '#3D2B1F',
                transition: 'color 0.15s',
                minWidth: 48,
              }}
            >
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 24,
                opacity: active ? 1 : 0.6,
              }}>{item.icon}</span>
              <span style={{
                fontSize: 9, fontWeight: active ? 800 : 600,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
              }}>{item.label}</span>
              {active && (
                <span style={{
                  width: 16, height: 2, borderRadius: 1,
                  background: '#E8547C',
                  marginTop: -1,
                }} />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}