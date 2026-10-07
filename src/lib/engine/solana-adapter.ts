// BSTONKEX Solana Adapter — SPL tokens, Jupiter, native Solana
import { cacheGetOrCompute, CACHE_KEYS, TTL } from './cache';
import type { ChainAdapter, SwapParams, SwapQuote, UnsignedTx, GasEstimate, TxStatus, TokenMetadata, RouteStep } from './types';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_API = 'https://quote-api.jup.ag/v6';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SOL_DECIMALS = 9;
const SOL_PRICE_FALLBACK = 180;

export function createSolanaAdapter(): ChainAdapter {
  let rpcIndex = 0;
  const rpcUrls = [SOLANA_RPC, 'https://solana-mainnet.g.alchemy.com/v2/demo', 'https://rpc.ankr.com/solana'];
  const getRpc = () => rpcUrls[rpcIndex % rpcUrls.length];

  async function rpcCall(method: string, params: any[] = []): Promise<any> {
    let res: Response;
    try {
      res = await fetch(getRpc(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      });
    } catch {
      rpcIndex++;
      throw new Error(`Solana RPC unreachable: network error`);
    }
    if (!res.ok) { rpcIndex++; throw new Error(`Solana RPC failed: ${res.status}`); }
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Solana RPC error');
    return data.result;
  }

  async function getNativeBalance(wallet: string): Promise<string> {
    const result = await rpcCall('getBalance', [wallet]);
    return (result.value / Math.pow(10, SOL_DECIMALS)).toFixed(6);
  }

  async function getTokenBalance(wallet: string, token: string, decimals = 6): Promise<string> {
    try {
      const result = await rpcCall('getTokenAccountsByOwner', [
        wallet,
        { mint: token },
        { encoding: 'jsonParsed' },
      ]);
      const accounts = result?.value || [];
      if (accounts.length === 0) return '0';
      const info = accounts[0].account.data.parsed.info.tokenAmount;
      return (Number(info.amount) / Math.pow(10, info.decimals)).toFixed(6);
    } catch { return '0'; }
  }

  async function getTokenMetadata(address: string): Promise<TokenMetadata> {
    return cacheGetOrCompute(CACHE_KEYS.tokenMeta('solana', address), async () => {
      try {
        const res = await fetch(`https://tokens.jup.ag/token/${address}`);
        if (res.ok) {
          const data = await res.json();
          return {
            address,
            symbol: data.symbol || 'UNKNOWN',
            name: data.name || 'Unknown Token',
            decimals: data.decimals || 9,
            logoUrl: data.logoURI || null,
            verified: !!data.daily_volume,
          };
        }
      } catch { /* fall through */ }
      return { address, symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 9, logoUrl: null, verified: false };
    }, TTL.TOKEN_META);
  }

  async function getNativePriceUsd(): Promise<number> {
    return cacheGetOrCompute(CACHE_KEYS.nativePrice('solana'), async () => {
      try {
        const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
        if (res.ok) {
          const data = await res.json();
          const price = data.pairs?.[0]?.priceUsd;
          if (price) return parseFloat(price);
        }
      } catch { /* fall through */ }
      return SOL_PRICE_FALLBACK;
    }, TTL.PRICE);
  }

  async function getTokenPriceUsd(address: string): Promise<number | null> {
    return cacheGetOrCompute(CACHE_KEYS.tokenPrice('solana', address), async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        if (!res.ok) return null;
        const data = await res.json();
        const solPairs = (data.pairs || []).filter((p: any) => p.chainId?.toLowerCase() === 'solana');
        if (solPairs.length === 0) return null;
        solPairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        return solPairs[0].priceUsd ? parseFloat(solPairs[0].priceUsd) : null;
      } catch { return null; }
    }, TTL.PRICE);
  }

  async function getSwapQuote(params: SwapParams): Promise<SwapQuote> {
    const { tokenIn, tokenOut, amountIn, slippageBps } = params;
    const inputMint = tokenIn === 'native' ? SOL_MINT : tokenIn;
    const outputMint = tokenOut === 'native' ? SOL_MINT : tokenOut;

    try {
      const url = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountIn}&slippageBps=${slippageBps}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return unavailableQuote(err.error || 'NO ROUTE AVAILABLE');
      }
      const data = await res.json();
      if (data.error) return unavailableQuote(data.error);

      const priceImpactBps = Math.round(parseFloat(data.priceImpactPct || '0') * 100);
      const routes: RouteStep[] = (data.routePlan || []).map((r: any) => ({
        dex: r.swapInfo?.label || 'Jupiter',
        pool: r.swapInfo?.ammKey || '',
        tokenIn: r.swapInfo?.inputMint || inputMint,
        tokenOut: r.swapInfo?.outputMint || outputMint,
        pct: (r.percent || 1) * 100,
      }));

      const solPrice = await getNativePriceUsd();
      const gasUsd = (5000 / 1e9) * solPrice; // ~5000 lamports

      return {
        available: true,
        amountIn: data.inAmount,
        amountOut: data.outAmount,
        amountOutMin: data.otherAmountThreshold || data.outAmount,
        priceImpactBps,
        route: routes.length > 0 ? routes : [{ dex: 'Jupiter', pool: '', tokenIn: inputMint, tokenOut: outputMint, pct: 100 }],
        gasEstimate: '5000',
        gasPriceUsd: gasUsd,
        dexFeeUsd: 0,
        source: 'jupiter',
        raw: data,
      };
    } catch (e: any) {
      return unavailableQuote(`JUPITER API UNAVAILABLE: ${e.message}`);
    }
  }

  async function buildSwapTransaction(params: SwapParams, quote: SwapQuote): Promise<UnsignedTx> {
    const { tokenIn, tokenOut, amountIn, slippageBps, walletAddress } = params;
    const inputMint = tokenIn === 'native' ? SOL_MINT : tokenIn;
    const outputMint = tokenOut === 'native' ? SOL_MINT : tokenOut;

    try {
      const res = await fetch(`${JUPITER_API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote.raw,
          userPublicKey: walletAddress,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          to: '', // Solana doesn't use 'to' field
          data: '',
          value: '0',
          chainId: 0,
          serializedMessage: data.swapTransaction, // base64 encoded transaction
          signers: [],
        };
      }
    } catch { /* fall through */ }

    return { to: '', data: '', value: amountIn, chainId: 0, serializedMessage: '' };
  }

  async function estimateGas(_tx: UnsignedTx): Promise<GasEstimate> {
    const solPrice = await getNativePriceUsd();
    const feeLamports = 5000;
    return {
      gasLimit: '200000',
      gasPrice: feeLamports.toString(),
      totalNative: (feeLamports / 1e9).toFixed(6),
      totalUsd: (feeLamports / 1e9) * solPrice,
    };
  }

  async function sendTransaction(signedTx: string): Promise<string> {
    const result = await rpcCall('sendTransaction', [signedTx, { encoding: 'base64', skipPreflight: true }]);
    return result;
  }

  async function getTransactionStatus(hash: string): Promise<TxStatus> {
    try {
      const result = await rpcCall('getSignatureStatuses', [[hash], { searchTransactionHistory: true }]);
      const status = result?.value?.[0];
      if (!status) return { hash, status: 'pending' };
      if (status.err) return { hash, status: 'failed' };
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        return { hash, status: 'confirmed', confirmations: status.confirmations || 1 };
      }
      return { hash, status: 'pending' };
    } catch {
      return { hash, status: 'not_found' };
    }
  }

  async function getBlockNumber(): Promise<number> {
    return rpcCall('getSlot');
  }

  async function getGasPrice(): Promise<string> {
    return '5000'; // Solana base fee in lamports
  }

  async function healthCheck(): Promise<import('./types').HealthStatus> {
    const start = Date.now();
    try {
      await rpcCall('getSlot');
      return { service: 'solana-rpc', status: 'online', latencyMs: Date.now() - start, lastCheck: Date.now() };
    } catch (e: any) {
      return { service: 'solana-rpc', status: 'offline', latencyMs: Date.now() - start, lastCheck: Date.now(), error: e.message };
    }
  }

  return {
    chainId: 'solana', isEvm: false, rpcUrls, nativeSymbol: 'SOL', nativeDecimals: SOL_DECIMALS,
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