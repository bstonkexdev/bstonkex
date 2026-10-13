// Cupcak8 Swap Wallet Chain Registry — the nine networks of the wallet chain selector.
// Every chain id / RPC below was verified live before enabling balances or actions.
// Native assets come from chainid.network (BSC=BNB, Arc=USDC, Stable=USDT0, Hyper=HYPE …) —
// they are NOT assumed identical across EVM networks.
import { CHAIN_LOGOS } from '../assets/wallet-chains';
import type { ChainId } from './config';

export type WalletChainKey = 'bsc' | 'base' | 'eth' | 'arc' | 'sol' | 'robinhood' | 'ink' | 'hyper' | 'stable';

export interface WalletChain {
  key: WalletChainKey;
  /** Selector label (matches spec order: BSC, BASE, ETH, ARC, SOL, ROBINHOOD, INK, HYPER, STABLE). */
  name: string;
  displayName: string;
  logo: string;
  kind: 'evm' | 'solana';
  nativeSymbol: string;
  nativeDecimals: number;
  numericChainId: number | null;
  chainIdHex: string | null;
  rpcUrls: string[];
  explorerUrl: string | null;
  /** Verified Blockscout API v2 base (token auto-discovery), null when unavailable. */
  blockscoutApi: string | null;
  /** How real balances are read for this network. */
  balances: 'adapter' | 'rpc' | 'unverified';
  /** Native sends work through the connected wallet on a verified network config. */
  sendSupported: boolean;
  /** Cupcak8 Swap trading chain id when swap routing is wired, else null. */
  swapChainId: ChainId | null;
  /** Human-readable capability notes (honest limitations). */
  note: string;
}

export const WALLET_CHAINS: WalletChain[] = [
  {
    key: 'bsc', name: 'BSC', displayName: 'BNB Smart Chain', logo: CHAIN_LOGOS.bsc, kind: 'evm',
    nativeSymbol: 'BNB', nativeDecimals: 18, numericChainId: 56, chainIdHex: '0x38',
    rpcUrls: ['https://bsc-dataseed1.bnbchain.org', 'https://bsc-dataseed2.bnbchain.org'],
    explorerUrl: 'https://bscscan.com', blockscoutApi: null,
    balances: 'adapter', sendSupported: true, swapChainId: 'bsc',
    note: 'Full Cupcak8 Swap integration — balances, send, swap.',
  },
  {
    key: 'base', name: 'BASE', displayName: 'Base', logo: CHAIN_LOGOS.base, kind: 'evm',
    nativeSymbol: 'ETH', nativeDecimals: 18, numericChainId: 8453, chainIdHex: '0x2105',
    rpcUrls: ['https://mainnet.base.org'], explorerUrl: 'https://basescan.org', blockscoutApi: null,
    balances: 'adapter', sendSupported: true, swapChainId: 'base',
    note: 'Full Cupcak8 Swap integration — balances, send, swap.',
  },
  {
    key: 'eth', name: 'ETH', displayName: 'Ethereum', logo: CHAIN_LOGOS.eth, kind: 'evm',
    nativeSymbol: 'ETH', nativeDecimals: 18, numericChainId: 1, chainIdHex: '0x1',
    rpcUrls: ['https://ethereum-rpc.publicnode.com'], explorerUrl: 'https://etherscan.io',
    blockscoutApi: 'https://eth.blockscout.com',
    balances: 'rpc', sendSupported: true, swapChainId: null,
    note: 'Balances + auto-discovered ERC-20s + send. Cupcak8 Swap swap routing is not configured for Ethereum mainnet.',
  },
  {
    key: 'arc', name: 'ARC', displayName: 'Arc', logo: CHAIN_LOGOS.arc, kind: 'evm',
    nativeSymbol: 'USDC', nativeDecimals: 18, numericChainId: 5042, chainIdHex: '0x13b2',
    rpcUrls: ['https://rpc.mainnet.arc.io'], explorerUrl: 'https://explorer.arc.io', blockscoutApi: null,
    balances: 'rpc', sendSupported: true, swapChainId: null,
    note: 'Chain id 5042 + RPC verified. Gas is paid in USDC (per chainid.network). No Cupcak8 Swap swap route.',
  },
  {
    key: 'sol', name: 'SOL', displayName: 'Solana', logo: CHAIN_LOGOS.sol, kind: 'solana',
    nativeSymbol: 'SOL', nativeDecimals: 9, numericChainId: null, chainIdHex: null,
    rpcUrls: ['https://api.mainnet-beta.solana.com'], explorerUrl: 'https://solscan.io', blockscoutApi: null,
    balances: 'adapter', sendSupported: false, swapChainId: 'solana',
    note: 'Balances + swap via Cupcak8 Swap. Native SOL transfers are disabled (no transfer tx builder wired).',
  },
  {
    key: 'robinhood', name: 'ROBINHOOD', displayName: 'Robinhood Chain', logo: CHAIN_LOGOS.robinhood, kind: 'evm',
    nativeSymbol: 'ETH', nativeDecimals: 18, numericChainId: 4663, chainIdHex: '0x1237',
    rpcUrls: ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood-rpc.publicnode.com'],
    explorerUrl: 'https://robinhoodchain.blockscout.com', blockscoutApi: null,
    balances: 'adapter', sendSupported: true, swapChainId: 'robinhood',
    note: 'Chain id 4663 verified. Swap availability additionally gated by Cupcak8 Swap chain readiness.',
  },
  {
    key: 'ink', name: 'INK', displayName: 'Ink', logo: CHAIN_LOGOS.ink, kind: 'evm',
    nativeSymbol: 'ETH', nativeDecimals: 18, numericChainId: 57073, chainIdHex: '0xdef1',
    rpcUrls: ['https://rpc-gel.inkonchain.com', 'https://rpc-qnd.inkonchain.com'],
    explorerUrl: 'https://explorer.inkonchain.com', blockscoutApi: 'https://explorer.inkonchain.com',
    balances: 'rpc', sendSupported: true, swapChainId: null,
    note: 'Chain id 57073 verified. Balances + auto-discovered tokens + send. No Cupcak8 Swap swap route.',
  },
  {
    key: 'hyper', name: 'HYPER', displayName: 'HyperEVM', logo: CHAIN_LOGOS.hyper, kind: 'evm',
    nativeSymbol: 'HYPE', nativeDecimals: 18, numericChainId: 999, chainIdHex: '0x3e7',
    rpcUrls: ['https://rpc.hyperliquid.xyz/evm'], explorerUrl: 'https://explorer.hyperliquid.xyz', blockscoutApi: null,
    balances: 'rpc', sendSupported: true, swapChainId: null,
    note: 'Chain id 999 verified at Hyperliquid\'s official EVM RPC. Gas is HYPE. No Cupcak8 Swap swap route.',
  },
  {
    key: 'stable', name: 'STABLE', displayName: 'Stable', logo: CHAIN_LOGOS.stable, kind: 'evm',
    nativeSymbol: 'USDT0', nativeDecimals: 18, numericChainId: 988, chainIdHex: '0x3dc',
    rpcUrls: ['https://rpc.stable.xyz'], explorerUrl: 'https://stablescan.xyz', blockscoutApi: null,
    balances: 'rpc', sendSupported: true, swapChainId: null,
    note: 'Chain id 988 verified. Gas is USDT0 (per chainid.network). No Cupcak8 Swap swap route.',
  },
];

export const WALLET_CHAIN_BY_KEY: Record<WalletChainKey, WalletChain> =
  Object.fromEntries(WALLET_CHAINS.map(c => [c.key, c])) as Record<WalletChainKey, WalletChain>;

/** Map a wallet chain to a Cupcak8 Swap trading chain when one exists. */
export function tradingChainFor(key: WalletChainKey): ChainId | null {
  return WALLET_CHAIN_BY_KEY[key]?.swapChainId ?? null;
}

/** Map a Cupcak8 Swap trading chain back to its wallet chain. */
export function walletChainForTrading(chainId: ChainId): WalletChain | null {
  return WALLET_CHAINS.find(c => c.swapChainId === chainId) ?? null;
}

/** Ask the wallet for its ACTUAL chain — never assume. */
export async function getConnectedEvmChainHex(): Promise<string | null> {
  const p = window.ethereum;
  if (!p) return null;
  try {
    const hex: string = await p.request({ method: 'eth_chainId' });
    return hex ? hex.toLowerCase() : null;
  } catch {
    return null;
  }
}

export interface SwitchResult {
  ok: boolean;
  method: 'already' | 'switched' | 'added' | 'no-provider' | 'not-evm' | 'failed';
  error?: string;
}

/**
 * Switch (or add) a network through the wallet's standard flow.
 * Success is only reported after the provider confirms (or reports it is already there).
 */
export async function switchOrAddChain(chain: WalletChain): Promise<SwitchResult> {
  if (chain.kind !== 'evm' || !chain.chainIdHex) return { ok: false, method: 'not-evm', error: 'Not an EVM network' };
  const p = window.ethereum;
  if (!p) return { ok: false, method: 'no-provider', error: 'No EVM wallet detected' };

  const current = await getConnectedEvmChainHex();
  if (current === chain.chainIdHex) return { ok: true, method: 'already' };

  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainIdHex }] });
    const after = await getConnectedEvmChainHex();
    if (after === chain.chainIdHex) return { ok: true, method: 'switched' };
    return { ok: false, method: 'failed', error: 'Wallet did not confirm the network switch' };
  } catch (err: any) {
    // 4902: chain not in wallet → standard add-network flow (verified config only)
    if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
      try {
        await p.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chain.chainIdHex,
            chainName: chain.displayName,
            nativeCurrency: { name: chain.nativeSymbol, symbol: chain.nativeSymbol, decimals: chain.nativeDecimals },
            rpcUrls: chain.rpcUrls,
            blockExplorerUrls: chain.explorerUrl ? [chain.explorerUrl] : undefined,
          }],
        });
        const after = await getConnectedEvmChainHex();
        if (after === chain.chainIdHex) return { ok: true, method: 'added' };
        return { ok: false, method: 'failed', error: 'Wallet did not confirm the added network' };
      } catch (addErr: any) {
        return { ok: false, method: 'failed', error: addErr?.code === 4001 ? 'User rejected' : 'Add-network failed' };
      }
    }
    return { ok: false, method: 'failed', error: err?.code === 4001 ? 'User rejected' : (err?.message || 'Switch failed') };
  }
}

export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

export function isValidSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

export function isValidAddress(chain: WalletChain, addr: string): boolean {
  return chain.kind === 'solana' ? isValidSolanaAddress(addr) : isValidEvmAddress(addr);
}
