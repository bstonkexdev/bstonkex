// BSTONKEX App Context — global state for wallet, chain, navigation, confirmations
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ChainId } from './config';
import type { WalletState } from './wallet';
import { checkExistingConnection, connectEvm, connectSolana, disconnectWallet, onEvmAccountsChanged, onEvmChainChanged, onSolanaDisconnect, onSolanaAccountChanged, switchNetwork, refreshBalance } from './wallet';

export type Page = 'landing' | 'markets' | 'trade' | 'portfolio' | 'watchlist' | 'referrals' | 'fees' | 'activity' | 'admin';

export interface TradeToken {
  chainId: ChainId;
  address: string;
  name: string;
  symbol: string;
}

export interface ConfirmState {
  side: 'buy' | 'sell';
  tokenSymbol: string;
  amountUsd: number;
  estimatedOutput: string;
  platformFee: string;
  dexFee: string;
  networkFee: string;
  priceImpact: number;
  slippage: number;
  minReceived: string;
  route: string[];
}

export interface TxNotification {
  id: string;
  type: 'pending' | 'confirmed' | 'failed' | 'approval' | 'market' | 'whale' | 'alert' | 'info';
  title: string;
  message: string;
  txHash?: string;
  chainId?: ChainId;
  timestamp: number;
  read: boolean;
  priority?: 'info' | 'important' | 'warning' | 'critical';
}

interface AppState {
  page: Page;
  setPage: (p: Page) => void;
  tradeToken: TradeToken | null;
  setTradeToken: (t: TradeToken | null) => void;
  wallet: WalletState;
  connect: (type: 'evm' | 'solana') => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: ChainId) => void;
  refreshWalletBalance: () => Promise<void>;
  walletError: string | null;
  activeChain: ChainId;
  setActiveChain: (c: ChainId) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  // Trade confirmation
  confirmState: ConfirmState | null;
  setConfirmState: (s: ConfirmState | null) => void;
  // Wallet modal
  walletModal: 'evm' | 'solana' | null;
  setWalletModal: (m: 'evm' | 'solana' | null) => void;
  // Notifications
  notifications: TxNotification[];
  addNotification: (n: Omit<TxNotification, 'id' | 'timestamp' | 'read'>) => void;
  clearNotification: (id: string) => void;
}

const defaultWallet: WalletState = {
  connected: false, address: null, chainId: null, balance: null, provider: null,
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('landing');
  const [tradeToken, setTradeToken] = useState<TradeToken | null>(null);
  const [wallet, setWallet] = useState<WalletState>(defaultWallet);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [activeChain, setActiveChain] = useState<ChainId>('bsc');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [walletModal, setWalletModal] = useState<'evm' | 'solana' | null>(null);
  const [notifications, setNotifications] = useState<TxNotification[]>([]);

  // Check existing connection on mount
  useEffect(() => { checkExistingConnection().then(setWallet).catch(() => {}); }, []);

  // Listen for wallet account / chain changes
  useEffect(() => {
    const off1 = onEvmAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setWallet(defaultWallet);
        addNotification({ type: 'failed', title: 'WALLET DISCONNECTED', message: 'Your wallet has been disconnected.' });
      } else {
        setWallet(prev => ({ ...prev, address: accounts[0] }));
        // Refresh balance for new account
        if (accounts[0]) {
          refreshBalance(accounts[0], activeChain, 'evm').then(bal => {
            setWallet(prev => ({ ...prev, balance: bal }));
          }).catch(() => {});
        }
      }
    });
    const off2 = onEvmChainChanged((chainId) => {
      const mapped = chainId === '0x38' ? 'bsc' : chainId === '0x2105' ? 'base' : chainId === '0x1237' ? 'robinhood' : null;
      setWallet(prev => ({ ...prev, chainId: mapped }));
      if (mapped && mapped !== activeChain) {
        addNotification({ type: 'approval', title: 'NETWORK CHANGED', message: `Wallet switched to ${mapped.toUpperCase()}` });
      }
    });
    // Solana listeners
    const off3 = onSolanaDisconnect(() => {
      setWallet(defaultWallet);
      addNotification({ type: 'failed', title: 'SOLANA DISCONNECTED', message: 'Your Solana wallet has been disconnected.' });
    });
    const off4 = onSolanaAccountChanged((publicKey) => {
      if (!publicKey) {
        setWallet(defaultWallet);
        addNotification({ type: 'failed', title: 'ACCOUNT CHANGED', message: 'Solana account disconnected.' });
      } else {
        setWallet(prev => ({ ...prev, address: publicKey }));
        refreshBalance(publicKey, 'solana', 'solana').then(bal => {
          setWallet(prev => ({ ...prev, balance: bal }));
        }).catch(() => {});
        addNotification({ type: 'info', title: 'ACCOUNT CHANGED', message: `Switched to ${publicKey.slice(0, 8)}...` });
      }
    });
    return () => { off1(); off2(); off3(); off4(); };
  }, [activeChain]);

  const addNotification = useCallback((n: Omit<TxNotification, 'id' | 'timestamp' | 'read'>) => {
    const notification: TxNotification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications(prev => [notification, ...prev].slice(0, 50));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const connect = useCallback(async (type: 'evm' | 'solana') => {
    setWalletError(null);
    try {
      const state = type === 'evm' ? await connectEvm() : await connectSolana();
      setWallet(state);
      if (state.chainId) setActiveChain(state.chainId);
      addNotification({ type: 'confirmed', title: 'WALLET CONNECTED', message: `${state.address?.slice(0, 8)}... on ${state.chainId?.toUpperCase() || 'unknown'}` });
    } catch (err: any) {
      const msgs: Record<string, string> = {
        NO_EVM_WALLET: 'No EVM wallet detected. Install MetaMask or OKX Wallet.',
        NO_SOLANA_WALLET: 'No Solana wallet detected. Install Phantom or Solflare.',
        USER_REJECTED: 'Connection rejected by user.',
      };
      setWalletError(msgs[err.message] || err.message || 'Connection failed');
    }
  }, [addNotification]);

  const disconnect = useCallback(async () => {
    await disconnectWallet(wallet.provider);
    setWallet(defaultWallet);
    addNotification({ type: 'approval', title: 'WALLET DISCONNECTED', message: 'Your wallet has been disconnected.' });
  }, [wallet.provider, addNotification]);

  const switchChain = useCallback((chainId: ChainId) => {
    setActiveChain(chainId);
    if (wallet.connected && wallet.provider === 'evm') {
      switchNetwork(chainId).catch(() => {});
    }
    // Refresh balance on new chain
    if (wallet.connected && wallet.address) {
      refreshBalance(wallet.address, chainId, wallet.provider || 'evm').then(bal => {
        setWallet(prev => ({ ...prev, balance: bal, chainId }));
      }).catch(() => {});
    }
  }, [wallet]);

  const refreshWalletBalance = useCallback(async () => {
    if (!wallet.connected || !wallet.address || !wallet.provider) return;
    const bal = await refreshBalance(wallet.address, activeChain, wallet.provider);
    setWallet(prev => ({ ...prev, balance: bal }));
  }, [wallet, activeChain]);

  const goToTrade = useCallback((token: TradeToken) => {
    setTradeToken(token);
    setPage('trade');
    setActiveChain(token.chainId);
  }, []);

  const value: AppState = {
    page,
    setPage: (p: Page) => { setPage(p); if (p !== 'trade') setTradeToken(null); },
    tradeToken,
    setTradeToken: goToTrade,
    wallet, connect, disconnect, switchChain, refreshWalletBalance, walletError,
    activeChain, setActiveChain,
    searchOpen, setSearchOpen,
    menuOpen, setMenuOpen,
    confirmState, setConfirmState,
    walletModal, setWalletModal,
    notifications, addNotification, clearNotification,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}