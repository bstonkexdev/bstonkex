// Cupcak8 Swap Wallet Balances — real per-chain balances.
// Sources: chain adapters (BSC/Base/Robinhood/Solana), public RPCs (all verified EVM nets),
// Blockscout explorer API auto-discovery (ETH, INK). Nothing is mocked; unpriced tokens
// keep their real quantity and are labelled UNPRICED rather than given a fake USD value.
import type { WalletChain, WalletChainKey } from './wallet-chains';
import { CHAIN_TOKENS, NATIVE_COINGECKO, type WalletTokenDef } from './wallet-tokens';
import { getWalletPrices, isPriceFresh, type PriceStatus } from './wallet-prices';
import { getChainAdapter } from './engine/chain-registry';

export interface WalletTokenRow {
  id: string;                    // lowercase address or 'native'
  address: string | null;        // null for the native asset
  symbol: string;
  name: string;
  decimals: number;
  balance: number;               // human units
  priceUsd: number | null;
  change24h: number | null;
  valueUsd: number | null;
  logoUrl: string | null;
  source: 'native' | 'registry' | 'explorer';
  isZero: boolean;
}

export interface ChainBalances {
  chain: WalletChainKey;
  status: 'ok' | 'error' | 'unavailable';
  native: WalletTokenRow | null;
  tokens: WalletTokenRow[];
  chainTotalUsd: number;
  unpricedCount: number;
  priceStatus: PriceStatus;
  updatedAt: number | null;
  error?: string;
}

// ── Low-level RPC ─────────────────────────────────────────────

async function rpcCall(rpcUrls: string[], method: string, params: unknown[]): Promise<any> {
  let lastErr: unknown = null;
  for (const url of rpcUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = await res.json();
      if (json?.error) { lastErr = new Error(json.error.message || 'RPC error'); continue; }
      return json?.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('RPC UNREACHABLE');
}

function fromUnits(raw: string | number | bigint, decimals: number): number {
  try {
    const wei = typeof raw === 'bigint' ? raw : BigInt(raw);
    const whole = Number(wei / 10n ** BigInt(decimals));
    const frac = Number(wei % 10n ** BigInt(decimals)) / 10 ** decimals;
    return whole + frac;
  } catch {
    return 0;
  }
}

const balOfData = (addr: string) =>
  `0x70a08231000000000000000000000000${addr.toLowerCase().replace(/^0x/, '')}`;

// ── Token discovery ───────────────────────────────────────────

async function fetchExplorerTokens(api: string, wallet: string): Promise<WalletTokenRow[]> {
  const res = await fetch(`${api}/api/v2/addresses/${wallet}/token-balances`, {
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok || text.startsWith('<')) throw new Error('EXPLORER API UNAVAILABLE');
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error('EXPLORER API UNAVAILABLE');
  const out: WalletTokenRow[] = [];
  for (const r of rows) {
    const t = r?.token;
    if (!t?.address_hash || r.token_id != null) continue;      // skip NFTs
    if ((t.type ?? 'ERC-20') !== 'ERC-20') continue;
    const decimals = t.decimals != null ? parseInt(t.decimals, 10) : null;
    if (decimals == null || !isFinite(decimals)) continue;
    const bal = fromUnits(r.value ?? '0', decimals);
    if (bal <= 0) continue;
    out.push({
      id: t.address_hash.toLowerCase(), address: t.address_hash,
      symbol: t.symbol || '???', name: t.name || t.symbol || 'Unknown token', decimals,
      balance: bal, priceUsd: null, change24h: null, valueUsd: null,
      logoUrl: t.icon_url || null, source: 'explorer', isZero: bal <= 0,
    });
  }
  return out;
}

async function fetchRegistryTokens(chain: WalletChain, wallet: string): Promise<WalletTokenRow[]> {
  const defs: WalletTokenDef[] = CHAIN_TOKENS[chain.key] ?? [];
  const out: WalletTokenRow[] = [];
  await Promise.allSettled(defs.map(async def => {
    let bal = 0;
    if (chain.kind === 'solana') {
      const adapter = getChainAdapter('solana');
      if (!adapter) return;
      bal = parseFloat(await adapter.getTokenBalance(wallet, def.address, def.decimals));
    } else {
      const raw = await rpcCall(chain.rpcUrls, 'eth_call', [{ to: def.address, data: balOfData(wallet) }, 'latest']);
      if (!raw || raw === '0x') return;
      bal = fromUnits(raw, def.decimals);
    }
    if (!isFinite(bal) || bal <= 0) return;
    out.push({
      id: def.address.toLowerCase(), address: def.address,
      symbol: def.symbol, name: def.name, decimals: def.decimals,
      balance: bal, priceUsd: null, change24h: null, valueUsd: null,
      logoUrl: null, source: 'registry', isZero: false,
    });
  }));
  return out;
}

// ── Public API ────────────────────────────────────────────────

export async function fetchChainBalances(wallet: string, chain: WalletChain): Promise<ChainBalances> {
  if (chain.balances === 'unverified') {
    return {
      chain: chain.key, status: 'unavailable', native: null, tokens: [],
      chainTotalUsd: 0, unpricedCount: 0, priceStatus: 'unknown', updatedAt: null,
      error: 'INTEGRATION NOT VERIFIED FOR THIS NETWORK',
    };
  }

  const prices = await getWalletPrices();

  // Native balance
  let nativeBalance = 0;
  try {
    if (chain.kind === 'solana') {
      const adapter = getChainAdapter('solana');
      if (!adapter) throw new Error('SOLANA ADAPTER UNAVAILABLE');
      nativeBalance = parseFloat(await adapter.getNativeBalance(wallet));
    } else {
      const raw = await rpcCall(chain.rpcUrls, 'eth_getBalance', [wallet, 'latest']);
      nativeBalance = fromUnits(raw, chain.nativeDecimals);
    }
  } catch (e: any) {
    return {
      chain: chain.key, status: 'error', native: null, tokens: [],
      chainTotalUsd: 0, unpricedCount: 0, priceStatus: prices.status, updatedAt: null,
      error: e?.message === 'RPC UNREACHABLE' ? 'RPC UNREACHABLE — BALANCE DATA UNAVAILABLE' : (e?.message || 'BALANCE FETCH FAILED'),
    };
  }

  const nativePrice = prices.prices[NATIVE_COINGECKO[chain.key]];
  const native: WalletTokenRow = {
    id: 'native', address: null,
    symbol: chain.nativeSymbol, name: `${chain.displayName} native (${chain.nativeSymbol})`,
    decimals: chain.nativeDecimals,
    balance: nativeBalance,
    priceUsd: nativePrice?.priceUsd ?? null,
    change24h: nativePrice?.change24h ?? null,
    valueUsd: nativePrice ? nativeBalance * nativePrice.priceUsd : null,
    logoUrl: null, source: 'native', isZero: nativeBalance <= 0,
  };

  // Tokens: explorer auto-discovery (when verified) + verified registry contracts
  let explorerRows: WalletTokenRow[] = [];
  if (chain.blockscoutApi) {
    try { explorerRows = await fetchExplorerTokens(chain.blockscoutApi, wallet); } catch { /* registry still runs */ }
  }
  const registryRows = await fetchRegistryTokens(chain, wallet);

  const byAddr = new Map<string, WalletTokenRow>();
  for (const r of registryRows) byAddr.set(r.id, r);          // registry first
  for (const r of explorerRows) byAddr.set(r.id, r);           // explorer wins (has logo/metadata)

  const tokens = [...byAddr.values()];

  // Pricing: CoinGecko by canonical id where the contract is known; DexScreener adapter
  // fallback for trading chains; otherwise the row stays UNPRICED.
  const defByAddr = new Map<string, WalletTokenDef>();
  for (const d of CHAIN_TOKENS[chain.key] ?? []) defByAddr.set(d.address.toLowerCase(), d);
  for (const t of tokens) {
    const def = defByAddr.get(t.id);
    let price = def?.coingeckoId ? prices.prices[def.coingeckoId] : undefined;
    if (!price && chain.swapChainId && t.address) {
      try {
        const adapter = getChainAdapter(chain.swapChainId);
        const p = adapter ? await adapter.getTokenPriceUsd(t.address) : null;
        if (p != null && isFinite(p)) price = { priceUsd: p, change24h: null, at: Date.now() };
      } catch { /* stays unpriced */ }
    }
    if (price) {
      t.priceUsd = price.priceUsd;
      t.change24h = price.change24h;
      t.valueUsd = t.balance * price.priceUsd;
    }
    if (!t.logoUrl && def?.coingeckoId) t.logoUrl = null; // logos resolved by the UI via price metadata when available
  }

  tokens.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || b.balance - a.balance);
  const unpricedCount = tokens.filter(t => t.priceUsd == null).length + (native.priceUsd == null ? 1 : 0);
  const chainTotalUsd = (native.valueUsd ?? 0) + tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);

  return {
    chain: chain.key,
    status: 'ok',
    native,
    tokens,
    chainTotalUsd: unpricedCount > 0 && chainTotalUsd === 0 ? 0 : chainTotalUsd,
    unpricedCount,
    priceStatus: prices.status,
    updatedAt: Date.now(),
    error: prices.status !== 'ok' ? prices.error : undefined,
  };
}
