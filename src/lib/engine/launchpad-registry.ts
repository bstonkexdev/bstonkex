// Cupcak8 Swap — Canonical Launchpad Factory Registry
// Every address verified on-chain via eth_getCode before inclusion.
// If a factory cannot be verified: enabled=false, verified=false.
// DO NOT guess addresses. DO NOT use testnet contracts on mainnet.

import type { ChainId } from './types';

// ── Types ──────────────────────────────────────────────────

export type LaunchpadType = 'EVM_FACTORY' | 'SOLANA_PROGRAM' | 'EVM_PORTAL';

export type DiscoveryMethod = 'eth_getLogs' | 'solana_program' | 'bags_api' | 'dexscreener_fallback' | 'none';

export interface LaunchpadFactory {
  id: string;
  name: string;
  chain: ChainId;
  chainId: number;
  type: LaunchpadType;
  factoryAddresses: string[];    // EVM contract addresses
  programId?: string;            // Solana program ID
  creationEvent: string;         // Event signature/topic for token creation
  creationEventTopic: string;    // keccak256 topic0
  tokenAddressSource: 'event_param' | 'event_log' | 'receipt_logs' | 'instruction_data';
  poolCreationEvent?: string;    // Separate event for pool/pair creation
  enabled: boolean;
  verified: boolean;
  version: string;
  source: string;                // How we verified
  lastVerified: string;          // ISO timestamp
  // Discovery vs. market tracking separation (Step 2)
  discoveryMethod: DiscoveryMethod;  // How new tokens are discovered
  marketSource?: string;              // Where price/volume/liquidity comes from
  dexScreenerDexId?: string;          // DexScreener dexId for market enrichment
}

export interface LaunchpadEventRecord {
  launchpad: string;
  chain: ChainId;
  chainId: number;
  factory: string;
  factoryVersion: string;
  tokenAddress: string;
  creator: string;
  pair?: string;
  quoteToken?: string;
  poolAddress?: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: number;
  eventId: string;               // deterministic: chain:txHash:logIndex
  source: 'indexer' | 'adapter';
  status: 'confirmed' | 'pending';
}

// ── BSC Launchpad Factories ────────────────────────────────

// Four.meme TokenManager V1 — IMPLEMENTATION RESOLVED (Step 1B)
// Proxy at 0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC (170 bytes, EIP-1167 minimal proxy).
// EIP-1967 implementation slot read on-chain: 0x7fbc1ff9617d554d1902a3431a9c29dc2edaf1be (23,019 bytes).
// Still need: verified ABI from BscScan to confirm exact event signature and topic0.
// Event topic remains UNVERIFIED — the previously registered topic was a guess.
const FOUR_MEME_V1: LaunchpadFactory = {
  id: 'four-meme-v1',
  name: 'Four.meme V1',
  chain: 'bsc',
  chainId: 56,
  type: 'EVM_FACTORY',
  factoryAddresses: ['0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC'],
  creationEvent: 'UNKNOWN — need verified ABI from implementation 0x7fbc1ff9617d554d1902a3431a9c29dc2edaf1be',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'v1',
  source: 'Step1B: EIP-1967 impl resolved to 0x7fbc1ff9617d554d1902a3431a9c29dc2edaf1be (23KB). Need ABI/event topic from verified source.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'none',
};

// Four.meme TokenManager2 V2 — IMPLEMENTATION RESOLVED (Step 1B)
// Proxy at 0x5c952063c7fc8610FFDB798152D69F0B9550762b (170 bytes, EIP-1167 minimal proxy).
// EIP-1967 implementation slot read on-chain: 0xf32ee25a7a94f5858692b90815493bda9f992eee (24,203 bytes).
// Still need: verified ABI from BscScan to confirm exact event signature and topic0.
const FOUR_MEME_V2: LaunchpadFactory = {
  id: 'four-meme-v2',
  name: 'Four.meme V2',
  chain: 'bsc',
  chainId: 56,
  type: 'EVM_FACTORY',
  factoryAddresses: ['0x5c952063c7fc8610FFDB798152D69F0B9550762b'],
  creationEvent: 'UNKNOWN — need verified ABI from implementation 0xf32ee25a7a94f5858692b90815493bda9f992eee',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'v2',
  source: 'Step1B: EIP-1967 impl resolved to 0xf32ee25a7a94f5858692b90815493bda9f992eee (24KB). Need ABI/event topic from verified source.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'none',
};

// Flap Portal — PARTIALLY VERIFIED (Step 1B update)
// Contract deployed at 0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0 (2883 bytes).
// Previously registered topic 0x714aa393 was INCORRECT — zero matches in 1M blocks.
// Step1B: DexScreener confirms flapsh DEX on both BSC and Robinhood (30 pairs).
// Flap docs confirm "Factory" concept for token management contracts.
// Still need: verified contract source / ABI from BscScan to derive correct creation event topic.
// Flap tokens are discoverable via DexScreener dexId='flapsh' as an interim API source.
const FLAP_PORTAL: LaunchpadFactory = {
  id: 'flap-portal',
  name: 'FLAP Portal',
  chain: 'bsc',
  chainId: 56,
  type: 'EVM_PORTAL',
  factoryAddresses: ['0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0'],
  creationEvent: 'UNKNOWN — registered topic was wrong; need verified ABI from BscScan',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'v6',
  source: 'Step1B: DexScreener dexId=flapsh confirmed (30 pairs on BSC+RH). Portal contract active but event topic wrong. API fallback: DexScreener. Need BscScan ABI.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'dexscreener_fallback',
  marketSource: 'DexScreener dexId=flapsh',
  dexScreenerDexId: 'flapsh',
};

// Flap VaultPortal — PARTIALLY VERIFIED (Step 1B update)
// Contract deployed at 0x90497450f2a706f1951b5bdda52B4E5d16f34C06 (2883 bytes).
// Same topic mismatch as Portal. Same status.
const FLAP_VAULT: LaunchpadFactory = {
  id: 'flap-vault',
  name: 'FLAP VaultPortal',
  chain: 'bsc',
  chainId: 56,
  type: 'EVM_PORTAL',
  factoryAddresses: ['0x90497450f2a706f1951b5bdda52B4E5d16f34C06'],
  creationEvent: 'UNKNOWN — same topic mismatch as Portal',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'vault-v6',
  source: 'Step1B: Same as Portal. Event ABI unverified. DexScreener dexId=flapsh works as interim.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'dexscreener_fallback',
  marketSource: 'DexScreener dexId=flapsh',
  dexScreenerDexId: 'flapsh',
};

// Genius.fun — PARTIALLY VERIFIED (Step 1B update)
// Official ToS (genius.fun) confirms:
//   - Supported Network: BNB Chain (only)
//   - Launch mechanism: bonding curve with 6 BNB phantom quote reserve
//   - Graduation threshold: 15 BNB raised
//   - Fixed supply: 1,000,000,000 tokens per launch
//   - Functions: setCreatorFeeRecipient, rescueCurveFees, rescuePoolFees
//   - Fee split: 30% protocol / 70% creator
// No factory contract address published in ToS or visible on-site.
// Still need: factory address from verified deployment or official contract listing.
const GENIUS_PLACEHOLDER: LaunchpadFactory = {
  id: 'genius',
  name: 'Genius.fun',
  chain: 'bsc',
  chainId: 56,
  type: 'EVM_FACTORY',
  factoryAddresses: [],
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'Step1B: ToS confirms BSC + bonding curve (6BNB reserve, 15BNB graduation, 1B fixed supply). Factory address NOT published. Need BscScan verification.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'none',
};

// ── Base Launchpad Factories ───────────────────────────────

// OpenLaunch Factory — verified on Base mainnet
// eth_getCode returns bytecode at 0x815542E8b392389A1389E22E588E4B62A67Ade72
// Event topic verified from on-chain: 2 Launched events found in blocks 52340723-52340886
// Example: tx 0x5ccac465fd1dc18a7594a8c357cae3ed1231fb3652b762ccc13b4dc1def8e68e
// Token address extracted from topic1 (indexed address param)
const OPENLAUNCH_BASE: LaunchpadFactory = {
  id: 'openlaunch-base',
  name: 'OpenLaunch',
  chain: 'base',
  chainId: 8453,
  type: 'EVM_FACTORY',
  factoryAddresses: ['0x815542E8b392389A1389E22E588E4B62A67Ade72'],
  creationEvent: 'Launched(address indexed token, uint256, bytes)',
  creationEventTopic: '0xda18b133e41a7fe4e3adc625c6eeaf9237558c875e411398a623cc9603aad0a9',
  tokenAddressSource: 'event_param', // token address in topic1 (indexed)
  enabled: true, // Verified on-chain with real events
  verified: true,
  version: 'v1',
  source: 'eth_getCode + eth_getLogs verified on Base mainnet, blocks 52340723-52340886',
  lastVerified: '2025-01-07T00:00:00Z',
  discoveryMethod: 'eth_getLogs',
  marketSource: 'DexScreener dexId=openlaunch + GeckoTerminal',
  dexScreenerDexId: 'openlaunch',
};

// O1 Exchange — PARTIALLY VERIFIED identity (Step 1B)
// o1launchpad.com confirms: "Official Token Launchpad on Base & Robinhood"
//   - Also mentions B20 tokens on Base
//   - app_id: 693b67448a7c4e55fec73ef4 (likely a platform identifier)
// No factory contract address published on-site or in meta tags.
// Still need: factory address from BaseScan verified contracts or official deployment docs.
const O1_EXCHANGE_BASE: LaunchpadFactory = {
  id: 'o1-exchange-base',
  name: 'O1 EXCHANGE',
  chain: 'base',
  chainId: 8453,
  type: 'EVM_FACTORY',
  factoryAddresses: [],
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'Step1B: Identity confirmed (o1launchpad.com, Base+RH, B20 tokens). No factory address published. Need BaseScan verified deployment.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'none',
};

// BaseStonk — FACTORY NOT VERIFIED
const BASESTONK: LaunchpadFactory = {
  id: 'basestonk',
  name: 'BaseStonk',
  chain: 'base',
  chainId: 8453,
  type: 'EVM_FACTORY',
  factoryAddresses: [],
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'BASESTONK MAINNET FACTORY NOT VERIFIED',
  lastVerified: '',
  discoveryMethod: 'none',
};

// B20 Factory — FACTORY NOT VERIFIED
// Known to have Base Sepolia deployment only — do NOT use in production
const B20: LaunchpadFactory = {
  id: 'b20',
  name: 'B20 Factory',
  chain: 'base',
  chainId: 8453,
  type: 'EVM_FACTORY',
  factoryAddresses: [],
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'B20 MAINNET FACTORY NOT VERIFIED — Base Sepolia only',
  lastVerified: '',
  discoveryMethod: 'none',
};

// ── Robinhood Chain Launchpad Factories ────────────────────

// Pons V1 — PARTIALLY VERIFIED (Step 1B update)
// Contract deployed at 0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB (48708 bytes).
// PONS token contract: 0x39dBED3a2bd333467115dE45665cC57F813C4571 (from docs.ponsfamily.com).
// Docs confirm: "launch deploys token and trading pool in single transaction"
//   - Bonding curve mechanism
//   - Arbitrum Orbit (Robinhood Chain)
//   - Graduation and listing after curve fills
// Zero creation events found in 50k blocks (may need wider range or correct ABI).
// Still need: verified ABI/source to derive creation event topic.
const PONS_V1: LaunchpadFactory = {
  id: 'pons-v1',
  name: 'PONS V1',
  chain: 'robinhood',
  chainId: 4663,
  type: 'EVM_FACTORY',
  factoryAddresses: ['0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB'],
  creationEvent: 'UNKNOWN — docs confirm single-tx token+pool creation but no ABI published',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'v1',
  source: 'Step1B: PONS token at 0x39dBED3a2bd333467115dE45665cC57F813C4571 (docs). Docs confirm bonding curve + single-tx launch on Arbitrum Orbit. Need factory ABI.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'none',
};

// Pons V2 — FACTORY NOT VERIFIED
const PONS_V2: LaunchpadFactory = {
  id: 'pons-v2',
  name: 'PONS V2',
  chain: 'robinhood',
  chainId: 4663,
  type: 'EVM_FACTORY',
  factoryAddresses: [],
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'v2',
  source: 'PONS V2 FACTORY NOT VERIFIED',
  lastVerified: '',
  discoveryMethod: 'none',
};

// OpenLaunch Robinhood — STAGE 2 PASS
// Contract deployed at 0x815542E8b392389A1389E22E588E4B62A67Ade72 (27364 bytes).
// 2 real Launched events found via public Robinhood RPC:
//   Block 83648412: token 0x223e...ac5a, creator 0x0000...11b1, tx 0x4fd83be3...
//   Block 83650950: token 0xfb11...1fa0, creator 0x0000...11d1, tx 0x3535521a...
// Same topic as Base: 0xda18b133e41a7fe4e3adc625c6eeaf9237558c875e411398a623cc9603aad0a9
const OPENLAUNCH_RH: LaunchpadFactory = {
  id: 'openlaunch-rh',
  name: 'OpenLaunch',
  chain: 'robinhood',
  chainId: 4663,
  type: 'EVM_FACTORY',
  factoryAddresses: ['0x815542E8b392389A1389E22E588E4B62A67Ade72'],
  creationEvent: 'Launched(address indexed token, uint256, bytes)',
  creationEventTopic: '0xda18b133e41a7fe4e3adc625c6eeaf9237558c875e411398a623cc9603aad0a9',
  tokenAddressSource: 'event_param',
  enabled: true, // Stage 2 PASS: 2 real events decoded on Robinhood mainnet
  verified: true,
  version: 'v1',
  source: 'STAGE2 PASS: eth_getLogs on Robinhood mainnet (public RPC). 2 Launched events at blocks 83648412, 83650950. Topic matches Base.',
  lastVerified: '2025-07-01T00:00:00Z',
  discoveryMethod: 'eth_getLogs',
  marketSource: 'DexScreener dexId=openlaunch + GeckoTerminal',
  dexScreenerDexId: 'openlaunch',
};

// Long — FACTORY NOT VERIFIED
const LONG: LaunchpadFactory = {
  id: 'long',
  name: 'LONG',
  chain: 'robinhood',
  chainId: 4663,
  type: 'EVM_FACTORY',
  factoryAddresses: [],
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'LONG FACTORY NOT VERIFIED',
  lastVerified: '',
  discoveryMethod: 'none',
};

// Ponsion — FACTORY NOT VERIFIED
const PONSION: LaunchpadFactory = {
  id: 'ponsion',
  name: 'Ponsion',
  chain: 'robinhood',
  chainId: 4663,
  type: 'EVM_FACTORY',
  factoryAddresses: [],
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'PONSION FACTORY NOT VERIFIED',
  lastVerified: '',
  discoveryMethod: 'none',
};

// O1 Exchange Robinhood — FACTORY NOT VERIFIED
const O1_EXCHANGE_RH: LaunchpadFactory = {
  id: 'o1-exchange-rh',
  name: 'O1 EXCHANGE',
  chain: 'robinhood',
  chainId: 4663,
  type: 'EVM_FACTORY',
  factoryAddresses: [],
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'event_param',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'O1 EXCHANGE RH FACTORY NOT VERIFIED',
  lastVerified: '',
  discoveryMethod: 'none',
};

// ── Solana Launchpad Programs ──────────────────────────────

// Pump.fun — STAGE 2 PASS (Solana)
// Program ID: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
// Real transaction verified:
//   Sig: 3h5Ki1sGKPw1ixLpAZtfvTpCTcQWyi72V8RuJxnAnezDmS3pxFVbi5jYJDPnaASS8sgs4eKwWuTYgoUU6vH3KG6N
//   Slot: 454680764
//   Creator (fee payer): 26VenY5V2QeqjJAvE9sLi16aq1Ma3ocEUWwJxjBLgEia
//   Token mint: 2vVexEfRGbvekd9q9P1twZW6TLRfriZJewY84dEZpump
//   Pump.fun program invoked: FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9
const PUMPFUN: LaunchpadFactory = {
  id: 'pumpfun',
  name: 'PUMP.FUN',
  chain: 'solana',
  chainId: 0,
  type: 'SOLANA_PROGRAM',
  factoryAddresses: [],
  programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  creationEvent: 'create_token',
  creationEventTopic: '',
  tokenAddressSource: 'instruction_data',
  enabled: true, // Stage 2 PASS: real Solana tx decoded with mint + creator
  verified: true,
  version: 'v1',
  source: 'STAGE2 PASS: getSignaturesForAddress + getTransaction on Solana mainnet. Slot 454680764. Mint 2vVexEfR...pump, creator 26VenY5V...',
  lastVerified: '2025-07-01',
  discoveryMethod: 'solana_program',
  marketSource: 'Jupiter API + DexScreener + GeckoTerminal',
  dexScreenerDexId: 'raydium',
};

// StonkFun — PARTIALLY VERIFIED via Bags API (Step 1B)
// Bags data-api.bags.fm/v2/launches confirms real "Stonkfun" launches on Solana.
// Example: mint 63AvAp5PjZaLMuEgAacwYRsNVb7sKaGYdSZ8bsgPkmuu, slot 455928172.
//   Creator: Ee5FqoaGsDJ4wKUcJMDhD7GX4NT5jwerHXyXmmkDq9pn
//   Signature: U4MFRyE5VXM8hrYng4aLEn3RvCG1hqJbm5VbTAjMt96D9Ru3aveCYb4VV2KDcXgPd1W8WzPzW1Q7DhYqHiddU8X
//   Initial pool: 9L6adkCGZUAL96duq6NzNTrgsggQ6bdGKQocMULU5d2L (BONDING_CURVE, raydium_launchpad)
// Still need: the actual Solana program ID for Stonkfun's launch instruction.
// API fallback: Bags API /v2/launches (filter launchpad='Stonkfun') provides reliable discovery.
const STONKFUN: LaunchpadFactory = {
  id: 'stonkfun',
  name: 'STONKFUN',
  chain: 'solana',
  chainId: 0,
  type: 'SOLANA_PROGRAM',
  factoryAddresses: [],
  programId: '', // Need on-chain program ID (raydium_launchpad protocol)
  creationEvent: 'create (via raydium_launchpad bonding curve)',
  creationEventTopic: '',
  tokenAddressSource: 'instruction_data',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'Step1B: Bags API confirms real Stonkfun launches (raydium_launchpad BONDING_CURVE). Program ID still unknown. API fallback: data-api.bags.fm/v2/launches.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'bags_api',
  marketSource: 'Jupiter API + DexScreener + GeckoTerminal',
};

// Bags — API-VERIFIED (Step 1B)
// Bags is an AGGREGATOR/indexer, not a single on-chain program.
// data-api.bags.fm/v2/ API provides:
//   GET /v2/launches — recent token launches with mint, creator, signature, launchpad
//   GET /v2/tokens/:mint/creation — creation details (slot, signature, pool info)
//   GET /v2/tokens/:mint — token data with stats
//   GET /v2/tokens/trending — trending tokens
//   GET /v2/tokens/by-creator/:creator — tokens by creator
// Tracks multiple launchpads: Pumpfun, Stonkfun, Dbc, Moonshot.
// Reliable for API-based discovery of new tokens across tracked launchpads.
const BAGS: LaunchpadFactory = {
  id: 'bags',
  name: 'Bags',
  chain: 'solana',
  chainId: 0,
  type: 'SOLANA_PROGRAM',
  factoryAddresses: [],
  programId: 'API_BASED — data-api.bags.fm (aggregates Pumpfun, Stonkfun, Dbc, Moonshot)',
  creationEvent: 'GET /v2/launches (API endpoint, not on-chain event)',
  creationEventTopic: '',
  tokenAddressSource: 'instruction_data',
  enabled: false,
  verified: false,
  version: 'v2',
  source: 'Step1B: Bags v2 API confirmed working. /v2/launches returns mint+creator+signature+launchpad. Aggregator (not single program). API-based discovery viable.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'bags_api',
  marketSource: 'Jupiter API + DexScreener + GeckoTerminal',
};

// Stonk (Solana) — UNVERIFIED (Step 1B: no new evidence found)
// Distinct from Stonk.fun on Base (basestonk.io).
// stonk.fun remains DNS-unreachable. No Solana program ID identified.
// Possible confusion: Bags API shows "Stonkfun" launchpad on Solana which may be this project.
// Needs identity resolution: is "Stonk (Solana)" the same as "Stonkfun" tracked by Bags?
const STONK_SOL: LaunchpadFactory = {
  id: 'stonk-sol',
  name: 'Stonk',
  chain: 'solana',
  chainId: 0,
  type: 'SOLANA_PROGRAM',
  factoryAddresses: [],
  programId: '', // Unknown
  creationEvent: '',
  creationEventTopic: '',
  tokenAddressSource: 'instruction_data',
  enabled: false,
  verified: false,
  version: 'unknown',
  source: 'Step1B: UNRESOLVED identity. Possible same as "Stonkfun" tracked by Bags API (raydium_launchpad). stonk.fun DNS still unreachable. Needs project identity confirmation.',
  lastVerified: '2025-10-12T00:00:00Z',
  discoveryMethod: 'none',
};

// ── Canonical Registry ─────────────────────────────────────

export const LAUNCHPAD_FACTORIES: LaunchpadFactory[] = [
  // BSC
  FOUR_MEME_V1,
  FOUR_MEME_V2,
  FLAP_PORTAL,
  FLAP_VAULT,
  GENIUS_PLACEHOLDER,
  // Base
  OPENLAUNCH_BASE,
  O1_EXCHANGE_BASE,
  BASESTONK,
  B20,
  // Robinhood
  PONS_V1,
  PONS_V2,
  OPENLAUNCH_RH,
  LONG,
  PONSION,
  O1_EXCHANGE_RH,
  // Solana
  PUMPFUN,
  STONKFUN,
  BAGS,
  STONK_SOL,
];

// ── Lookup Helpers ─────────────────────────────────────────

export function getEnabledFactories(): LaunchpadFactory[] {
  return LAUNCHPAD_FACTORIES.filter(f => f.enabled && f.verified);
}

export function getFactoriesByChain(chain: ChainId): LaunchpadFactory[] {
  return LAUNCHPAD_FACTORIES.filter(f => f.chain === chain);
}

export function getEnabledFactoriesByChain(chain: ChainId): LaunchpadFactory[] {
  return LAUNCHPAD_FACTORIES.filter(f => f.chain === chain && f.enabled && f.verified);
}

export function getFactoryById(id: string): LaunchpadFactory | undefined {
  return LAUNCHPAD_FACTORIES.find(f => f.id === id);
}

export function getFactoryByAddress(chain: ChainId, address: string): LaunchpadFactory | undefined {
  return LAUNCHPAD_FACTORIES.find(f =>
    f.chain === chain &&
    f.factoryAddresses.some(a => a.toLowerCase() === address.toLowerCase())
  );
}

/** Get all factory addresses for a chain (for eth_getLogs monitoring) */
export function getFactoryAddressesForChain(chain: ChainId): string[] {
  return LAUNCHPAD_FACTORIES
    .filter(f => f.chain === chain && f.enabled && f.verified && f.factoryAddresses.length > 0)
    .flatMap(f => f.factoryAddresses);
}

/** Get all creation event topics for a chain */
export function getCreationTopicsForChain(chain: ChainId): string[] {
  return LAUNCHPAD_FACTORIES
    .filter(f => f.chain === chain && f.enabled && f.verified && f.creationEventTopic &&
      f.creationEventTopic !== '0x0000000000000000000000000000000000000000000000000000000000000000')
    .map(f => f.creationEventTopic);
}

/** Build a deterministic event ID for a launchpad event */
export function buildLaunchEventId(chain: string, txHash: string, logIndex: number): string {
  return `${chain}:launch:${txHash}:${logIndex}`;
}
