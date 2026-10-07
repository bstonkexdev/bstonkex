// BSTONKEX Wallet Connection — EVM (MetaMask/OKX) + Solana (Phantom/Flare)
// Enhanced with real balance fetching via chain adapters
import { CHAINS, type ChainId } from './config';
import { getChainAdapter } from './engine/chain-registry';
import { isSandboxed } from './engine/sandbox';

export interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: ChainId | null;
  balance: string | null;
  provider: 'evm' | 'solana' | null;
}

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, cb: (...args: any[]) => void) => void;
      removeListener: (event: string, cb: (...args: any[]) => void) => void;
      selectedAddress?: string;
      chainId?: string;
    };
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
      signAndSendTransaction: (tx: any) => Promise<{ signature: string }>;
      on: (event: string, cb: (...args: any[]) => void) => void;
      removeListener: (event: string, cb: (...args: any[]) => void) => void;
      publicKey?: { toString: () => string };
      isConnected?: boolean;
    };
    okxwallet?: {
      ethereum?: Window['ethereum'];
      solana?: Window['solana'];
    };
  }
}

function detectEvmProvider(): typeof window.ethereum | undefined {
  if (window.ethereum) return window.ethereum;
  if (window.okxwallet?.ethereum) return window.okxwallet.ethereum;
  return undefined;
}

function detectSolanaProvider(): typeof window.solana | undefined {
  if (window.solana?.isPhantom) return window.solana;
  if (window.okxwallet?.solana) return window.okxwallet.solana;
  return undefined;
}

function evmChainToId(hexChainId: string): ChainId | null {
  const map: Record<string, ChainId> = {
    '0x38': 'bsc',       // BNB Chain (56)
    '0x2105': 'base',    // Base (8453)
    '0x1237': 'robinhood', // Robinhood (4663)
  };
  return map[hexChainId?.toLowerCase()] || null;
}

/** Fetch native balance using the chain adapter for accuracy. */
async function fetchNativeBalance(address: string, chainId: ChainId): Promise<string | null> {
  if (isSandboxed()) return null; // RPCs blocked in preview

  try {
    const adapter = getChainAdapter(chainId);
    if (adapter) {
      return await adapter.getNativeBalance(address);
    }
  } catch { /* fall through to provider */ }

  // Fallback: use provider
  const provider = CHAINS[chainId]?.isEvm ? detectEvmProvider() : null;
  if (provider) {
    try {
      const bal = await provider.request({ method: 'eth_getBalance', params: [address, 'latest'] });
      return (parseInt(bal, 16) / 1e18).toFixed(4);
    } catch { /* ignore */ }
  }
  return null;
}

/** Fetch Solana balance via RPC. */
async function fetchSolanaBalance(address: string): Promise<string | null> {
  if (isSandboxed()) return null; // RPCs blocked in preview

  try {
    const adapter = getChainAdapter('solana');
    if (adapter) {
      return await adapter.getNativeBalance(address);
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
    });
    const data = await res.json();
    if (data.result?.value !== undefined) {
      return (data.result.value / 1e9).toFixed(6);
    }
  } catch { /* ignore */ }
  return null;
}

export async function connectEvm(): Promise<WalletState> {
  const provider = detectEvmProvider();
  if (!provider) throw new Error('NO_EVM_WALLET');
  try {
    const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
    const chainId: string = await provider.request({ method: 'eth_chainId' });
    const address = accounts[0];
    const chain = evmChainToId(chainId);
    const balance = chain ? await fetchNativeBalance(address, chain) : null;
    return { connected: true, address: address || null, chainId: chain, balance, provider: 'evm' };
  } catch (err: any) {
    if (err?.code === 4001) throw new Error('USER_REJECTED');
    throw err;
  }
}

export async function connectSolana(): Promise<WalletState> {
  const provider = detectSolanaProvider();
  if (!provider) throw new Error('NO_SOLANA_WALLET');
  try {
    const resp = await provider.connect();
    const address = resp.publicKey.toString();
    const balance = await fetchSolanaBalance(address);
    return { connected: true, address, chainId: 'solana', balance, provider: 'solana' };
  } catch (err: any) {
    if (err?.message?.includes('User rejected')) throw new Error('USER_REJECTED');
    throw err;
  }
}

export async function disconnectWallet(provider: 'evm' | 'solana' | null): Promise<void> {
  if (provider === 'solana') {
    const sol = detectSolanaProvider();
    if (sol) await sol.disconnect().catch(() => {});
  }
}

export async function switchNetwork(chainId: ChainId): Promise<void> {
  const chain = CHAINS[chainId];
  if (!chain.isEvm || !chain.chainIdHex) return;
  const provider = detectEvmProvider();
  if (!provider) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainIdHex }],
    });
  } catch (err: any) {
    if (err?.code === 4902) throw new Error('CHAIN_NOT_ADDED');
    throw err;
  }
}

export async function checkExistingConnection(): Promise<WalletState> {
  const evmProvider = detectEvmProvider();
  if (evmProvider?.selectedAddress) {
    const chainId = evmProvider.chainId || '0x38';
    const chain = evmChainToId(chainId);
    const balance = chain ? await fetchNativeBalance(evmProvider.selectedAddress, chain) : null;
    return { connected: true, address: evmProvider.selectedAddress, chainId: chain, balance, provider: 'evm' };
  }
  const solProvider = detectSolanaProvider();
  if (solProvider?.isConnected && solProvider.publicKey) {
    const address = solProvider.publicKey.toString();
    const balance = await fetchSolanaBalance(address);
    return { connected: true, address, chainId: 'solana', balance, provider: 'solana' };
  }
  return { connected: false, address: null, chainId: null, balance: null, provider: null };
}

/** Refresh balance for a connected wallet. */
export async function refreshBalance(address: string, chainId: ChainId, provider: 'evm' | 'solana'): Promise<string | null> {
  if (provider === 'solana') return fetchSolanaBalance(address);
  return fetchNativeBalance(address, chainId);
}

export function onEvmAccountsChanged(cb: (accounts: string[]) => void): () => void {
  const provider = detectEvmProvider();
  if (!provider) return () => {};
  provider.on('accountsChanged', cb);
  return () => provider.removeListener('accountsChanged', cb);
}

export function onEvmChainChanged(cb: (chainId: string) => void): () => void {
  const provider = detectEvmProvider();
  if (!provider) return () => {};
  provider.on('chainChanged', cb);
  return () => provider.removeListener('chainChanged', cb);
}

export function onSolanaDisconnect(cb: () => void): () => void {
  const provider = detectSolanaProvider();
  if (!provider) return () => {};
  provider.on('disconnect', cb);
  return () => provider.removeListener('disconnect', cb);
}

export function onSolanaAccountChanged(cb: (publicKey: string | null) => void): () => void {
  const provider = detectSolanaProvider();
  if (!provider) return () => {};
  const handler = (publicKey: { toString: () => string } | null) => {
    cb(publicKey ? publicKey.toString() : null);
  };
  provider.on('accountChanged', handler);
  return () => provider.removeListener('accountChanged', handler);
}

/** Detect if Solana wallet is Phantom or Solflare. */
export function getSolanaWalletName(): string | null {
  if (window.solana?.isPhantom) return 'Phantom';
  if (window.okxwallet?.solana) return 'OKX Wallet';
  return null;
}

/** Validate Solana cluster matches expected network. */
export async function validateSolanaCluster(): Promise<{ cluster: string; valid: boolean }> {
  try {
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getClusterNodes', params: [] }),
    });
    const data = await res.json();
    if (data.result && Array.isArray(data.result) && data.result.length > 0) {
      return { cluster: 'mainnet-beta', valid: true };
    }
    return { cluster: 'unknown', valid: false };
  } catch {
    return { cluster: 'unreachable', valid: false };
  }
}

export function getAvailableWallets(): { evm: boolean; solana: boolean } {
  return { evm: !!detectEvmProvider(), solana: !!detectSolanaProvider() };
}