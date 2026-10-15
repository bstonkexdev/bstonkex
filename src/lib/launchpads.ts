// Cupcak8 Swap — Launchpad Registry (centralized configuration)
// Maps each chain to its official launchpads
// URLs are DATA SOURCES, not navigation destinations
import type { ChainId } from './config';

export interface Launchpad {
  id: string;
  name: string;
  shortName: string;
  officialUrl: string | null; // data source URL (not for user navigation)
  chainId: ChainId;
  enabled: boolean;
  verified: boolean;
  dataSource: string; // e.g. 'launchpad-indexer', 'dex-pair-tracking'
  trackingMethod: string; // e.g. 'pair-creation', 'token-mint', 'factory-contract'
  status: 'active' | 'indexing_delayed' | 'offline' | 'not_configured';
  factoryAddress?: string; // on-chain factory contract address
  badgeColor?: string; // UI badge color
  factoryNote?: string; // verification status note
}

export interface ChainLaunchpads {
  chainId: ChainId;
  label: string;
  launchpads: Launchpad[];
}

export const LAUNCHPAD_REGISTRY: Record<string, ChainLaunchpads> = {
  bsc: {
    chainId: 'bsc',
    label: 'BSC LAUNCHPADS',
    launchpads: [
      {
        id: 'flap', name: 'FLAP', shortName: 'FLAP', officialUrl: 'https://flap.sh/',
        chainId: 'bsc', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        factoryAddress: '0x1de460f363af910f51726def188f9004276bf4bc',
        badgeColor: '#EF4444',
        factoryNote: 'STAGE2 FAIL: Portal + VaultPortal deployed and active, but registered Launched topic 0x714aa393 not found in 1M blocks. Event ABI incorrect.',
      },
      {
        id: 'four-meme', name: 'FOUR.MEME', shortName: 'FOUR.MEME', officialUrl: 'https://four.meme/',
        chainId: 'bsc', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        factoryAddress: '0x5c952063c7fc8610ffdb798152d69f0b9550762b',
        badgeColor: '#F59E0B',
        factoryNote: 'STAGE2 FAIL: V1+V2 are proxy contracts (170 bytes). Zero TokenCreated events in 1M blocks. Need implementation addresses.',
      },
      {
        id: 'genius', name: 'GENIUS', shortName: 'GENIUS', officialUrl: 'https://genius.fun/',
        chainId: 'bsc', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        badgeColor: '#10B981',
        factoryNote: 'GENIUS FACTORY NOT VERIFIED — cannot independently verify from available sources',
      },
    ],
  },
  base: {
    chainId: 'base',
    label: 'BASE LAUNCHPADS',
    launchpads: [
      {
        id: 'o1-exchange', name: 'O1 EXCHANGE', shortName: 'O1 EXCHANGE', officialUrl: 'https://launch.o1.exchange/',
        chainId: 'base', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        badgeColor: '#8B5CF6',
        factoryNote: 'O1 EXCHANGE FACTORY NOT VERIFIED — cannot independently verify from available sources',
      },
      {
        id: 'basestonk', name: 'BASESTONK', shortName: 'STONK', officialUrl: 'https://basestonk.io/',
        chainId: 'base', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        badgeColor: '#3B82F6',
        factoryNote: 'BASESTONK MAINNET FACTORY NOT VERIFIED',
      },
      {
        id: 'b20', name: 'B20', shortName: 'B20', officialUrl: 'https://b20factory.xyz/',
        chainId: 'base', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        badgeColor: '#3B82F6',
        factoryNote: 'B20 MAINNET FACTORY NOT VERIFIED — Base Sepolia only',
      },
      {
        id: 'openlaunch-base', name: 'OPENLAUNCH', shortName: 'OPENLAUNCH', officialUrl: 'https://openlaunch.lol/',
        chainId: 'base', enabled: true, verified: true,
        dataSource: 'openlaunch-adapter', trackingMethod: 'factory-contract',
        status: 'active',
        badgeColor: '#EC4899',
        factoryNote: 'STAGE2 PASS: Real Launched event at block 52340723 (tx 0x5ccac465...). Token 0xdb4702eb..., creator 0x00000000002fa9a0. Topic 0xda18b133 verified.',
      },
    ],
  },
  solana: {
    chainId: 'solana',
    label: 'SOLANA LAUNCHPADS',
    launchpads: [
      {
        id: 'pumpfun', name: 'PUMP.FUN', shortName: 'PUMP.FUN', officialUrl: 'https://pump.fun/',
        chainId: 'solana', enabled: true, verified: true,
        dataSource: 'launchpad-indexer', trackingMethod: 'token-mint',
        status: 'active',
        factoryAddress: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
        badgeColor: '#10B981',
        factoryNote: 'STAGE2 PASS: Real tx at slot 454680764. Mint 2vVexEfR...pump, creator 26VenY5V... Program 6EF8r...6P.',
      },
      {
        id: 'stonkfun', name: 'STONKFUN', shortName: 'STONKFUN', officialUrl: 'https://stonk.fun/',
        chainId: 'solana', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'token-mint',
        status: 'not_configured',
        factoryAddress: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
        badgeColor: '#3B82F6',
        factoryNote: 'STONKFUN PROGRAM NOT VERIFIED',
      },
      {
        id: 'bags', name: 'BAGS', shortName: 'BAGS', officialUrl: 'https://bags.fm/',
        chainId: 'solana', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'token-mint',
        status: 'not_configured',
        badgeColor: '#F97316',
        factoryNote: 'BAGS FACTORY NOT VERIFIED',
      },
    ],
  },
  robinhood: {
    chainId: 'robinhood',
    label: 'ROBINHOOD LAUNCHPADS',
    launchpads: [
      {
        id: 'pons', name: 'PONS', shortName: 'PONS', officialUrl: 'https://ponslaunchpad.net/',
        chainId: 'robinhood', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        factoryNote: 'STAGE2 FAIL: Contract deployed (48708 bytes) on Robinhood mainnet. Zero events in 50k blocks. No creation event topic available.',
      },
      {
        id: 'long', name: 'LONG', shortName: 'LONG', officialUrl: 'https://longx.fun/',
        chainId: 'robinhood', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        factoryNote: 'LONG FACTORY NOT VERIFIED',
      },
      {
        id: 'ponsion', name: 'PONSION', shortName: 'PONSION', officialUrl: 'https://launchpad.ponsion.com/',
        chainId: 'robinhood', enabled: false, verified: false,
        dataSource: 'launchpad-indexer', trackingMethod: 'factory-contract',
        status: 'not_configured',
        factoryNote: 'PONSION FACTORY NOT VERIFIED',
      },
      {
        id: 'openlaunch-rh', name: 'OPENLAUNCH', shortName: 'OPENLAUNCH', officialUrl: 'https://openlaunch.lol/',
        chainId: 'robinhood', enabled: true, verified: true,
        dataSource: 'openlaunch-adapter', trackingMethod: 'factory-contract',
        status: 'active',
        factoryNote: 'STAGE2 PASS: 2 real Launched events decoded on Robinhood mainnet at blocks 83648412, 83650950. Topic 0xda18b133 matches Base.',
      },
    ],
  },
};

/** Get launchpads for a chain, or null if 'all' */
export function getLaunchpads(chainId: ChainId | 'all'): ChainLaunchpads | null {
  if (chainId === 'all') return null;
  return LAUNCHPAD_REGISTRY[chainId] ?? null;
}

/** Get a specific launchpad by chain + id */
export function getLaunchpad(chainId: ChainId, launchpadId: string): Launchpad | null {
  const chain = LAUNCHPAD_REGISTRY[chainId];
  if (!chain) return null;
  return chain.launchpads.find(lp => lp.id === launchpadId) ?? null;
}

/** Get all launchpad IDs for a chain (used for filtering) */
export function getChainLaunchpadIds(chainId: ChainId): string[] {
  const chain = LAUNCHPAD_REGISTRY[chainId];
  if (!chain) return [];
  return chain.launchpads.filter(lp => lp.enabled).map(lp => lp.id);
}

/** Get verified launchpads across all chains */
export function getVerifiedLaunchpads(): Launchpad[] {
  const result: Launchpad[] = [];
  for (const chain of Object.values(LAUNCHPAD_REGISTRY)) {
    result.push(...chain.launchpads.filter(lp => lp.verified));
  }
  return result;
}
