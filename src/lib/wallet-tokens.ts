// Cupcak8 Swap Wallet Token Registry — verified token contracts per network.
// Only real, well-known contract addresses are listed. Token auto-discovery (Blockscout)
// supplements these lists on networks whose explorer API is verified. Tokens without a
// live price still appear with an UNPRICED status — never a fabricated USD value.
import type { WalletChainKey } from './wallet-chains';

export interface WalletTokenDef {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Canonical CoinGecko asset id — used for live USD pricing when available. */
  coingeckoId?: string;
}

/** Native asset price mapping (canonical CoinGecko ids). */
export const NATIVE_COINGECKO: Record<WalletChainKey, string> = {
  bsc: 'binancecoin',
  base: 'ethereum',
  eth: 'ethereum',
  arc: 'usd-coin',      // Arc gas asset is USDC (chainid.network)
  sol: 'solana',
  robinhood: 'ethereum',
  ink: 'ethereum',
  hyper: 'hyperliquid', // HyperEVM gas asset is HYPE
  stable: 'tether',     // Stable gas asset is USDT0 (chainid.network)
};

export const CHAIN_TOKENS: Record<WalletChainKey, WalletTokenDef[]> = {
  bsc: [
    { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18, coingeckoId: 'tether' },
    { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18, coingeckoId: 'usd-coin' },
    { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', symbol: 'BUSD', name: 'BUSD Token', decimals: 18, coingeckoId: 'binance-usd' },
    { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', name: 'Wrapped BNB', decimals: 18, coingeckoId: 'wbnb' },
    { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB', name: 'BTCB Token', decimals: 18, coingeckoId: 'bitcoin' },
    { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH', name: 'Ethereum Token', decimals: 18, coingeckoId: 'ethereum' },
    { address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', symbol: 'XRP', name: 'XRP Token', decimals: 18, coingeckoId: 'ripple' },
    { address: '0xba2ae424d960c26247dd6c32edc70b295c744c43', symbol: 'DOGE', name: 'Dogecoin', decimals: 18, coingeckoId: 'dogecoin' },
    { address: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47', symbol: 'ADA', name: 'Cardano Token', decimals: 18, coingeckoId: 'cardano' },
    { address: '0x85EAC5Ac2F758618dFa09bDbe0cf174e7d574D5B', symbol: 'TRX', name: 'TRON', decimals: 18, coingeckoId: 'tron' },
  ],
  base: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, coingeckoId: 'ethereum' },
    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, coingeckoId: 'dai' },
  ],
  eth: [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6, coingeckoId: 'tether' },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, coingeckoId: 'ethereum' },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8, coingeckoId: 'bitcoin' },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, coingeckoId: 'dai' },
  ],
  // Arc: no additional verified ERC-20 contracts beyond the USDC native asset.
  arc: [],
  sol: [
    { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD', decimals: 6, coingeckoId: 'tether' },
    { address: 'So11111111111111111111111111111111111111112', symbol: 'WSOL', name: 'Wrapped SOL', decimals: 9, coingeckoId: 'solana' },
  ],
  // Robinhood Chain: no verified token contracts beyond native ETH yet.
  robinhood: [],
  // Ink & HyperEVM & Stable: Blockscout discovery covers Ink; the rest are native-only
  // until verified token contracts are confirmed.
  ink: [],
  hyper: [],
  stable: [],
};

/** Wrapped/native execution contract used when opening the trading UI for a native asset. */
export const NATIVE_TRADE_ADDRESS: Partial<Record<WalletChainKey, string>> = {
  bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  base: '0x4200000000000000000000000000000000000006', // WETH
  sol: 'So11111111111111111111111111111111111111112', // WSOL
};
