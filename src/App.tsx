// Cupcak8 Swap — Main Application Shell
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
import AdminPanel from './components/admin/AdminPanel';
import LaunchpadPage from './components/LaunchpadPage';
import TerminalPage from './components/terminal/TerminalPage';
import SettingsPage from './components/settings/SettingsPage';
import Notifications from './components/Notifications';
import BottomNav from './components/BottomNav';
import { startPricePolling, stopPricePolling } from './lib/engine/price-engine';
import { startActivityPolling, stopActivityPolling } from './lib/engine/activity-engine';
import { initWebVitals, trackPageLoad } from './lib/engine/perf-monitor';
import { initInfraState } from './lib/engine/infra-state';
import { startRpcMonitoring, stopRpcMonitoring } from './lib/engine/rpc-manager';
import { initIndexer, stopIndexer } from './lib/engine/indexer/init';

function Router() {
  const { page, wallet } = useApp();
  switch (page) {
    case 'landing': return <LandingPage />;
    case 'markets': return <MarketsPage />;
    case 'token': return <TokenPage />;
    case 'trade': return <TerminalPage />;
    case 'portfolio': return <PortfolioPage />;
    case 'watchlist': return <WatchlistPage />;
    case 'referrals': return <ReferralPage />;
    case 'reward': return <ReferralPage />;
    case 'fees': return <FeeDashboard />;
    case 'activity': return <ActivityPage />;
    case 'launchpad': return <MarketsPage />;
    case 'admin': return <AdminPanel wallet={wallet} />;
    case 'settings': return <SettingsPage />;
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
    initIndexer();
    return () => { stopPricePolling(); stopActivityPolling(); stopRpcMonitoring(); stopIndexer(); };
  }, []);
  return null;
}

export default function App() {
  return (
    <AppProvider>
      <EngineInitializer />
      <Header />
      <Router />
      <SearchModal />
      <TradeConfirmModal />
      <WalletModal />
      <NetworkMismatch />
      <EmergencyBanner />
      <Notifications />
      <BottomNav />
    </AppProvider>
  );
}