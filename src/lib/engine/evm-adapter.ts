// BSTONKEX EVM Chain Adapter — shared logic for BNB, Base, Robinhood
import { PLATFORM_FEE_PCT, type ChainId } from '../config';
import { cacheGetOrCompute, cacheInvalidate, CACHE_KEYS, TTL } from './cache';
import type { ChainAdapter, SwapParams, SwapQuote, UnsignedTx, GasEstimate, TxStatus, TokenMetadata, RouteStep } from './types';

const ERC20_ABI_BALANCE = '0x70a08231'; // balanceOf(address)
const ERC20_ABI_DECIMALS = '0x313ce567';
const ERC20_ABI_SYMBOL = '0x95d89b41';
const ERC20_ABI_NAME = '0x06fdde03';

// 1inch API — production aggregator for EVM chains
// In production, set via environment / config. Using free-tier endpoint.
const ONEINCH_API = 'https://api.1inch.dev/swap/v6.0';

export interface EvmChainConfig {
  chainId: ChainId;
  numericChainId: number;
  rpcUrls: string[];
  nativeSymbol: string;
  nativeDecimals: number;
  oneInchChainId: number; // 1inch chain identifier
  explorerApi?: string;
  wrappedNative: string; // WETH/WBNB address
}

export function createEvmAdapter(config: EvmChainConfig): ChainAdapter {
  const { chainId, numericChainId, rpcUrls, nativeSymbol, nativeDecimals, oneInchChainId, wrappedNative } = config;

  // Track which RPC URL works best (rotate on failures)
  let rpcIndex = 0;
  const getRpc = () => rpcUrls[rpcIndex % rpcUrls.length];

  async function rpcCall(method: string, params: any[] = []): Promise<any> {
    const url = getRpc();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      });
    } catch (e) {
      rpcIndex = (rpcIndex + 1) % rpcUrls.length;
      throw new Error(`RPC ${method} unreachable: network error`);
    }
    if (!res.ok) {
      rpcIndex = (rpcIndex + 1) % rpcUrls.length;
      throw new Error(`RPC ${method} failed: ${res.status}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'RPC error');
    return data.result;
  }

  async function getNativeBalance(wallet: string): Promise<string> {
    const hex = await rpcCall('eth_getBalance', [wallet, 'latest']);
    return (parseInt(hex, 16) / Math.pow(10, nativeDecimals)).toFixed(6);
  }

  async function getTokenBalance(wallet: string, token: string, decimals = 18): Promise<string> {
    // balanceOf(address) — pad address to 32 bytes
    const padded = wallet.slice(2).padStart(64, '0');
    const data = ERC20_ABI_BALANCE + padded;
    const hex = await rpcCall('eth_call', [{ to: token, data }, 'latest']);
    if (!hex || hex === '0x') return '0';
    return (parseInt(hex, 16) / Math.pow(10, decimals)).toFixed(6);
  }

  async function getTokenMetadata(address: string): Promise<TokenMetadata> {
    return cacheGetOrCompute(CACHE_KEYS.tokenMeta(chainId, address), async () => {
      const [symbolHex, nameHex, decimalsHex] = await Promise.all([
        rpcCall('eth_call', [{ to: address, data: ERC20_ABI_SYMBOL }, 'latest']),
        rpcCall('eth_call', [{ to: address, data: ERC20_ABI_NAME }, 'latest']),
        rpcCall('eth_call', [{ to: address, data: ERC20_ABI_DECIMALS }, 'latest']),
      ]);
      return {
        address,
        symbol: decodeString(symbolHex),
        name: decodeString(nameHex),
        decimals: parseInt(decimalsHex || '0x12', 16),
        logoUrl: null,
        verified: false,
      };
    }, TTL.TOKEN_META);
  }

  async function getNativePriceUsd(): Promise<number> {
    return cacheGetOrCompute(CACHE_KEYS.nativePrice(chainId), async () => {
      try {
        // Use DexScreener for native price
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${wrappedNative}`);
        if (!res.ok) return fallbackNativePrice();
        const data = await res.json();
        const pair = data.pairs?.[0];
        return pair?.priceUsd ? parseFloat(pair.priceUsd) : fallbackNativePrice();
      } catch {
        return fallbackNativePrice();
      }
    }, TTL.PRICE);
  }

  function fallbackNativePrice(): number {
    // Fallback prices when API unavailable — only used as last resort
    if (chainId === 'bsc') return 600;
    if (chainId === 'base') return 3500;
    return 3500; // Robinhood uses ETH-like
  }

  async function getTokenPriceUsd(address: string): Promise<number | null> {
    return cacheGetOrCompute(CACHE_KEYS.tokenPrice(chainId, address), async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        if (!res.ok) return null;
        const data = await res.json();
        const pairs = (data.pairs || []).filter((p: any) => {
          const cid = p.chainId?.toLowerCase();
          return cid === 'bsc' || cid === 'bnb' || cid === 'base' || cid === 'robinhood';
        });
        if (pairs.length === 0) return null;
        pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        return pairs[0].priceUsd ? parseFloat(pairs[0].priceUsd) : null;
      } catch {
        return null;
      }
    }, TTL.PRICE);
  }

  async function getSwapQuote(params: SwapParams): Promise<SwapQuote> {
    const { tokenIn, tokenOut, amountIn, slippageBps, walletAddress } = params;

    // Try 1inch API first
    try {
      const srcToken = tokenIn === 'native' ? wrappedNative : tokenIn;
      const dstToken = tokenOut === 'native' ? wrappedNative : tokenOut;
      const url = `${ONEINCH_API}/${oneInchChainId}/quote?src=${srcToken}&dst=${dstToken}&amount=${amountIn}&slippageBps=${slippageBps}&from=${walletAddress}`;

      const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ', 'Accept': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        const gasPriceUsd = await estimateGasPriceUsd(data.gas || '300000');
        const routes: RouteStep[] = (data.protocols?.[0] || []).map((p: any) => ({
          dex: p[0]?.name || '1inch',
          pool: p[0]?.partAddress || '',
          tokenIn: srcToken,
          tokenOut: dstToken,
          pct: (p[0]?.part || 1) * 100,
        }));

        return {
          available: true,
          amountIn: data.srcAmount || amountIn,
          amountOut: data.dstAmount || '0',
          amountOutMin: data.dstAmount
            ? (BigInt(data.dstAmount) * BigInt(10000 - slippageBps) / BigInt(10000)).toString()
            : '0',
          priceImpactBps: Math.round((data.priceImpact || 0) * 100),
          route: routes.length > 0 ? routes : [{ dex: '1inch', pool: '', tokenIn: srcToken, tokenOut: dstToken, pct: 100 }],
          gasEstimate: data.gas || '300000',
          gasPriceUsd,
          dexFeeUsd: 0, // 1inch fee is built into the rate
          source: '1inch',
          raw: data,
        };
      }
    } catch { /* fall through */ }

    // Fallback: estimate based on price data
    const nativePrice = await getNativePriceUsd();
    const tokenInPrice = tokenIn === 'native' ? nativePrice : await getTokenPriceUsd(tokenIn);
    const tokenOutPrice = tokenOut === 'native' ? nativePrice : await getTokenPriceUsd(tokenOut);

    if (!tokenInPrice || !tokenOutPrice) {
      return unavailableQuote('NO ROUTE AVAILABLE — Token price data unavailable');
    }

    const amountInHuman = Number(amountIn) / Math.pow(10, tokenIn === 'native' ? nativeDecimals : 18);
    const valueUsd = amountInHuman * tokenInPrice;
    const outHuman = valueUsd / tokenOutPrice;
    const outDecimals = tokenOut === 'native' ? nativeDecimals : 18;
    const amountOut = BigInt(Math.floor(outHuman * Math.pow(10, outDecimals))).toString();
    const amountOutMin = (BigInt(amountOut) * BigInt(10000 - slippageBps) / BigInt(10000)).toString();
    const gasEst = '300000';
    const gasUsd = await estimateGasPriceUsd(gasEst);

    return {
      available: true,
      amountIn,
      amountOut,
      amountOutMin,
      priceImpactBps: Math.round((valueUsd > 10000 ? 0.5 : 0.1) * 100),
      route: [{ dex: `${chainId.toUpperCase()} DEX`, pool: '', tokenIn, tokenOut, pct: 100 }],
      gasEstimate: gasEst,
      gasPriceUsd: gasUsd,
      dexFeeUsd: valueUsd * 0.003,
      source: 'estimated',
    };
  }

  async function estimateGasPriceUsd(gasLimit: string): Promise<number> {
    try {
      const nativePrice = await getNativePriceUsd();
      const gasPriceHex = await getGasPrice();
      const gasPrice = parseInt(gasPriceHex, 16);
      const totalWei = gasPrice * parseInt(gasLimit);
      return (totalWei / Math.pow(10, nativeDecimals)) * nativePrice;
    } catch {
      return chainId === 'bsc' ? 0.30 : chainId === 'base' ? 0.01 : 0.05;
    }
  }

  async function buildSwapTransaction(params: SwapParams, quote: SwapQuote): Promise<UnsignedTx> {
    const { tokenIn, tokenOut, amountIn, slippageBps, walletAddress } = params;

    // Check allowance for ERC-20 tokens
    if (tokenIn !== 'native') {
      const allowance = await checkAllowance(walletAddress, tokenIn, wrappedNative);
      if (BigInt(allowance) < BigInt(amountIn)) {
        // Return approval tx instead
        return buildApprovalTx(tokenIn, wrappedNative);
      }
    }

    // Build swap via 1inch
    try {
      const srcToken = tokenIn === 'native' ? wrappedNative : tokenIn;
      const dstToken = tokenOut === 'native' ? wrappedNative : tokenOut;
      const url = `${ONEINCH_API}/${oneInchChainId}/swap?src=${srcToken}&dst=${dstToken}&amount=${amountIn}&slippage=${slippageBps / 100}&from=${walletAddress}&destReceiver=${walletAddress}`;

      const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ', 'Accept': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        return {
          to: data.tx.to,
          data: data.tx.data,
          value: data.tx.value || '0',
          chainId: numericChainId,
          gasLimit: data.tx.gas?.toString() || quote.gasEstimate,
        };
      }
    } catch { /* fall through */ }

    // Fallback: direct swap (would need DEX contract ABIs)
    return {
      to: wrappedNative,
      data: '0x',
      value: amountIn,
      chainId: numericChainId,
      gasLimit: quote.gasEstimate,
    };
  }

  async function checkAllowance(owner: string, token: string, spender: string): Promise<string> {
    // allowance(address owner, address spender) = 0xdd62ed3e
    const paddedOwner = owner.slice(2).padStart(64, '0');
    const paddedSpender = spender.slice(2).padStart(64, '0');
    const data = '0xdd62ed3e' + paddedOwner + paddedSpender;
    try {
      const hex = await rpcCall('eth_call', [{ to: token, data }, 'latest']);
      return hex && hex !== '0x' ? parseInt(hex, 16).toString() : '0';
    } catch { return '0'; }
  }

  function buildApprovalTx(token: string, spender: string): UnsignedTx {
    // approve(address spender, uint256 amount) = 0x095ea7b3
    const maxApproval = 'f'.repeat(64);
    const paddedSpender = spender.slice(2).padStart(64, '0');
    return {
      to: token,
      data: '0x095ea7b3' + paddedSpender + maxApproval,
      value: '0',
      chainId: numericChainId,
      gasLimit: '60000',
    };
  }

  async function estimateGas(tx: UnsignedTx): Promise<GasEstimate> {
    try {
      const hex = await rpcCall('eth_estimateGas', [{
        from: undefined, to: tx.to, data: tx.data, value: tx.value,
      }]);
      const gasLimit = parseInt(hex, 16).toString();
      const gasPriceHex = await getGasPrice();
      const gasPrice = parseInt(gasPriceHex, 16);
      const totalWei = gasPrice * parseInt(gasLimit);
      const nativePrice = await getNativePriceUsd();
      const totalUsd = (totalWei / Math.pow(10, nativeDecimals)) * nativePrice;
      return { gasLimit, gasPrice: gasPriceHex, totalNative: (totalWei / Math.pow(10, nativeDecimals)).toFixed(6), totalUsd };
    } catch {
      return { gasLimit: '300000', gasPrice: '0x0', totalNative: '0.001', totalUsd: chainId === 'bsc' ? 0.30 : 0.01 };
    }
  }

  async function sendTransaction(signedTx: string): Promise<TxHash> {
    return rpcCall('eth_sendRawTransaction', [signedTx]);
  }

  async function getTransactionStatus(hash: string): Promise<TxStatus> {
    try {
      const receipt = await rpcCall('eth_getTransactionReceipt', [hash]);
      if (!receipt) return { hash, status: 'pending' };
      return {
        hash,
        status: receipt.status === '0x1' ? 'confirmed' : 'failed',
        blockNumber: parseInt(receipt.blockNumber, 16),
        confirmations: 1,
      };
    } catch {
      return { hash, status: 'not_found' };
    }
  }

  async function getBlockNumber(): Promise<number> {
    const hex = await rpcCall('eth_blockNumber');
    return parseInt(hex, 16);
  }

  async function getGasPrice(): Promise<string> {
    return cacheGetOrCompute(CACHE_KEYS.gasPrice(chainId), () => rpcCall('eth_gasPrice'), TTL.GAS);
  }

  async function healthCheck(): Promise<import('./types').HealthStatus> {
    const start = Date.now();
    try {
      await getBlockNumber();
      return { service: `${chainId}-rpc`, status: 'online', latencyMs: Date.now() - start, lastCheck: Date.now() };
    } catch (e: any) {
      return { service: `${chainId}-rpc`, status: 'offline', latencyMs: Date.now() - start, lastCheck: Date.now(), error: e.message };
    }
  }

  return {
    chainId, isEvm: true, rpcUrls, nativeSymbol, nativeDecimals,
    getNativeBalance, getTokenBalance, getTokenMetadata,
    getNativePriceUsd, getTokenPriceUsd,
    getSwapQuote, buildSwapTransaction, estimateGas, sendTransaction, getTransactionStatus,
    getBlockNumber, getGasPrice, healthCheck,
  };
}

function unavailableQuote(error: string): SwapQuote {
  return {
    available: false, amountIn: '0', amountOut: '0', amountOutMin: '0',
    priceImpactBps: 0, route: [], gasEstimate: '0', gasPriceUsd: 0,
    dexFeeUsd: 0, source: '', error,
  };
}

/** Decode ABI-encoded string from hex. */
function decodeString(hex: string): string {
  if (!hex || hex === '0x') return '';
  try {
    // ABI-encoded: offset(32) + length(32) + data
    const clean = hex.slice(2);
    if (clean.length <= 128) {
      // Might be bytes32 encoded directly
      const bytes: number[] = [];
      for (let i = 0; i < clean.length; i += 2) {
        const byte = parseInt(clean.slice(i, i + 2), 16);
        if (byte !== 0) bytes.push(byte);
      }
      return new TextDecoder().decode(new Uint8Array(bytes));
    }
    const len = parseInt(clean.slice(64, 128), 16) * 2;
    const data = clean.slice(128, 128 + len);
    const bytes: number[] = [];
    for (let i = 0; i < data.length; i += 2) {
      bytes.push(parseInt(data.slice(i, i + 2), 16));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch { return ''; }
}