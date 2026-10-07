import { useEffect } from 'react';
import { AppProvider, useApp } from './lib/context';
import Header from './components/Header';
import SearchModal from './components/SearchModal';
import TradeConfirmModal from './components/TradeConfirmModal';
import WalletModal from './components/WalletModal';
import NetworkMismatch from './components/NetworkMismatch';
import EmergencyBanner from './components/EmergencyBanner';
import LandingPage from './components/LandingPage';
import MarketsPage from './components/MarketsPage';
import TokenPage from './components/TokenPage';
import PortfolioPage from './components/PortfolioPage';
import ReferralPage from './components/ReferralPage';
import WatchlistPage from './components/WatchlistPage';
import ActivityPage from './components/ActivityPage';
import FeeDashboard from './components/FeeDashboard';
import DeploymentCenter from './components/admin/DeploymentCenter';
import ProductionTerminal from './components/ProductionTerminal';
import { startPricePolling, stopPricePolling } from './lib/engine/price-engine';
import { startActivityPolling, stopActivityPolling } from './lib/engine/activity-engine';
import { initWebVitals, trackPageLoad } from './lib/engine/perf-monitor';
import { initInfraState } from './lib/engine/infra-state';
import { startRpcMonitoring, stopRpcMonitoring } from './lib/engine/rpc-manager';

function Router() {
  const { page } = useApp();
  switch (page) {
    case 'landing': return <LandingPage />;
    case 'markets': return <MarketsPage />;
    case 'trade': return <TokenPage />;
    case 'portfolio': return <PortfolioPage />;
    case 'watchlist': return <WatchlistPage />;
    case 'referrals': return <ReferralPage />;
    case 'fees': return <FeeDashboard />;
    case 'activity': return <ActivityPage />;
    case 'admin': return <DeploymentCenter />;
    default: return <LandingPage />;
  }
}

function EngineInitializer() {
  useEffect(() => {
    initInfraState();
    startPricePolling(30_000);
    startActivityPolling(20_000);
    startRpcMonitoring(60_000);
    initWebVitals();
    trackPageLoad();
    return () => { stopPricePolling(); stopActivityPolling(); stopRpcMonitoring(); };
  }, []);
  return null;
}

function MobileNav() {
  const { page, setPage, notifications } = useApp();
  const unread = notifications.filter(n => !n.read).length;
  const items = [
    { id: 'landing' as const, label: 'Home', icon: '⌂' },
    { id: 'markets' as const, label: 'Markets', icon: '◈' },
    { id: 'trade' as const, label: 'Trade', icon: '⇄' },
    { id: 'activity' as const, label: 'Activity', icon: '⚡' },
    { id: 'portfolio' as const, label: 'Wallet', icon: '⬡' },
  ];
  return (
    <nav className="mobile-nav">
      {items.map(item => (
        <button key={item.id}
          className={`mobile-nav-item ${page === item.id ? 'active' : ''}`}
          onClick={() => setPage(item.id)}>
          <span style={{ fontSize: 16, position: 'relative' }}>
            {item.icon}
            {item.id === 'portfolio' && unread > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4, width: 8, height: 8,
                borderRadius: '50%', background: 'var(--amber)',
              }} />
            )}
          </span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ProductionTerminal>
        <EngineInitializer />
        <Header />
        <EmergencyBanner />
        <Router />
        <SearchModal />
        <TradeConfirmModal />
        <WalletModal />
        <NetworkMismatch />
        <MobileNav />
      </ProductionTerminal>
    </AppProvider>
  );
}