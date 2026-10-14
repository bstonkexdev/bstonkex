// Cupcak8 Swap — Native Solana Trade Stream
// Subscribes to Solana WebSocket logsSubscribe for DEX programs (Pump.fun, Raydium, Orca)
// Parses swap events from transaction logs → normalized trades → OHLCV candle engine
//
// This is the missing piece: native on-chain trade ingestion (like ave.ai's Rust/Go pipeline)
// instead of relying solely on external REST APIs (DexScreener, GeckoTerminal, PumpPortal).

export interface NativeTrade {
  txHash: string;
  mint: string;
  side: 'buy' | 'sell';
  priceUsd: number;
  amountUsd: number;
  tokenAmount: number;
  solAmount: number;
  wallet: string;
  timestamp: number;
  dex: 'pumpfun' | 'raydium' | 'orca' | 'meteora' | 'unknown';
}

type TradeListener = (trade: NativeTrade) => void;

const SOLANA_WS = 'wss://api.mainnet-beta.solana.com';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

// DEX Program IDs
const PROGRAMS = {
  pumpfun: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  pumpswap: 'PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP',
  raydium: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  raydiumCpmm: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  orca: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  meteora: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
};

const ALL_PROGRAM_IDS = Object.values(PROGRAMS);

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnected = false;
const listeners = new Set<TradeListener>();
const subscriptions = new Map<number, string>(); // subId → programId

// Track recent trades for dedup
const recentTrades = new Set<string>();

/**
 * Subscribe to real-time trades for a specific token mint.
 * The listener receives ALL trades across all DEXes for that token.
 */
export function onNativeTrade(mint: string, cb: TradeListener): () => void {
  const wrapped = (trade: NativeTrade) => {
    if (trade.mint.toLowerCase() === mint.toLowerCase()) {
      cb(trade);
    }
  };
  listeners.add(wrapped);
  return () => { listeners.delete(wrapped); };
}

/**
 * Subscribe to ALL trades (for activity feed, whale tracking, etc.)
 */
export function onAllNativeTrades(cb: TradeListener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function emit(trade: NativeTrade) {
  // Dedup by txHash
  const key = trade.txHash;
  if (recentTrades.has(key)) return;
  recentTrades.add(key);
  // Keep dedup set small
  if (recentTrades.size > 1000) {
    const arr = [...recentTrades];
    for (let i = 0; i < 500; i++) recentTrades.delete(arr[i]);
  }

  for (const cb of listeners) {
    try { cb(trade); } catch { /* listener error */ }
  }
}

/**
 * Parse a Solana log notification into a normalized trade.
 * Uses log patterns to detect buy/sell and extract amounts.
 */
function parseLogNotification(value: any): NativeTrade | null {
  try {
    const signature = value?.signature;
    const logs: string[] = value?.logs || [];
    const slot = value?.slot || 0;

    if (!signature || logs.length === 0) return null;

    // Detect which DEX
    let dex: NativeTrade['dex'] = 'unknown';
    let programId = '';
    for (const log of logs) {
      if (log.includes(PROGRAMS.pumpfun) || log.includes(PROGRAMS.pumpswap)) {
        dex = 'pumpfun'; programId = PROGRAMS.pumpfun; break;
      }
      if (log.includes(PROGRAMS.raydium) || log.includes(PROGRAMS.raydiumCpmm)) {
        dex = 'raydium'; programId = PROGRAMS.raydium; break;
      }
      if (log.includes(PROGRAMS.orca)) {
        dex = 'orca'; programId = PROGRAMS.orca; break;
      }
      if (log.includes(PROGRAMS.meteora)) {
        dex = 'meteora'; programId = PROGRAMS.meteora; break;
      }
    }

    // Find swap-related log entries
    const swapLog = logs.find(l => l.includes('Instruction: Buy') || l.includes('Instruction: Sell') || l.includes('swap'));
    const isBuy = swapLog?.includes('Buy') || false;
    const isSell = swapLog?.includes('Sell') || false;

    // Extract mint from log data (program-specific)
    let mint = '';
    // Pump.fun logs include the mint in transfer instructions
    for (const log of logs) {
      // Look for token mint patterns in log data
      const mintMatch = log.match(/mint[:\s]+([A-Za-z0-9]{32,44})/i);
      if (mintMatch) { mint = mintMatch[1]; break; }
    }

    if (!mint && !isBuy && !isSell) return null;

    return {
      txHash: signature,
      mint: mint || 'unknown',
      side: isBuy ? 'buy' : isSell ? 'sell' : 'buy', // default to buy if unclear
      priceUsd: 0, // Will be enriched by price engine
      amountUsd: 0,
      tokenAmount: 0,
      solAmount: 0,
      wallet: '',
      timestamp: Math.floor(Date.now() / 1000),
      dex,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch full transaction details for a signature.
 * Used to enrich trade data with exact amounts.
 */
async function enrichTrade(trade: NativeTrade): Promise<NativeTrade> {
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getTransaction',
        params: [trade.txHash, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
    });
    const json = await res.json();
    const tx = json?.result;
    if (!tx) return trade;

    const meta = tx.meta;
    if (!meta) return trade;

    // Extract signer
    const accountKeys = tx.transaction?.message?.accountKeys || [];
    const signer = accountKeys.find((k: any) => k.signer)?.pubkey || '';

    // Calculate SOL change for signer (lamports → SOL)
    const signerIdx = accountKeys.findIndex((k: any) => k.pubkey === signer);
    if (signerIdx >= 0 && meta.preBalances && meta.postBalances) {
      const solDelta = (meta.postBalances[signerIdx] - meta.preBalances[signerIdx]) / 1e9;
      trade.solAmount = Math.abs(solDelta);
      trade.side = solDelta < 0 ? 'buy' : 'sell'; // Spent SOL = buy, received SOL = sell
    }

    // Calculate token balance changes
    const preTokens = meta.preTokenBalances || [];
    const postTokens = meta.postTokenBalances || [];

    // Find the signer's token balance change
    const preOwned = preTokens.find((b: any) => b.owner === signer);
    const postOwned = postTokens.find((b: any) => b.owner === signer);
    const preAmount = preOwned?.uiTokenAmount?.uiAmount || 0;
    const postAmount = postOwned?.uiTokenAmount?.uiAmount || 0;
    const tokenDelta = postAmount - preAmount;

    if (Math.abs(tokenDelta) > 0) {
      trade.tokenAmount = Math.abs(tokenDelta);
      trade.mint = preOwned?.mint || postOwned?.mint || trade.mint;
      trade.side = tokenDelta > 0 ? 'buy' : 'sell';
    }

    trade.wallet = signer;

    // Estimate USD value (SOL amount * ~$200)
    const solPrice = 200; // Will be replaced by sol-price module
    trade.amountUsd = trade.solAmount * solPrice;
    trade.priceUsd = trade.tokenAmount > 0 ? trade.amountUsd / trade.tokenAmount : 0;

    return trade;
  } catch {
    return trade;
  }
}

/**
 * Connect to Solana WebSocket and subscribe to DEX program logs.
 */
function connect() {
  if (ws) { try { ws.close(); } catch { /* */ } }

  try {
    ws = new WebSocket(SOLANA_WS);

    ws.onopen = () => {
      isConnected = true;
      console.log('[solana-trade-stream] Connected to Solana WS');

      // Subscribe to logs for each DEX program
      ALL_PROGRAM_IDS.forEach((programId, i) => {
        const subMsg = JSON.stringify({
          jsonrpc: '2.0',
          id: i + 1,
          method: 'logsSubscribe',
          params: [
            { mentions: [programId] },
            { commitment: 'confirmed' },
          ],
        });
        ws?.send(subMsg);
        subscriptions.set(i + 1, programId);
      });
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Handle subscription confirmation
        if (msg.result && typeof msg.result === 'number') {
          return;
        }

        // Handle log notification
        if (msg.method === 'logsNotification') {
          const value = msg.params?.result?.value;
          if (!value) return;

          const trade = parseLogNotification(value);
          if (!trade) return;

          // Enrich with full transaction data (async, non-blocking)
          enrichTrade(trade).then(enriched => {
            if (enriched.mint && enriched.mint !== 'unknown') {
              emit(enriched);
            }
          }).catch(() => {
            // Still emit basic trade even if enrichment fails
            if (trade.mint && trade.mint !== 'unknown') {
              emit(trade);
            }
          });
        }
      } catch { /* parse error */ }
    };

    ws.onclose = () => {
      isConnected = false;
      console.log('[solana-trade-stream] Disconnected, reconnecting in 5s…');
      reconnectTimer = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      isConnected = false;
      ws?.close();
    };
  } catch {
    isConnected = false;
    reconnectTimer = setTimeout(connect, 5000);
  }
}

/**
 * Start the native Solana trade stream.
 * Call once on app initialization.
 */
export function startSolanaTradeStream(): void {
  if (ws) return; // Already running
  connect();
}

/**
 * Stop the native Solana trade stream.
 */
export function stopSolanaTradeStream(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { try { ws.close(); } catch { /* */ } ws = null; }
  isConnected = false;
}

/**
 * Get stream health status.
 */
export function getSolanaStreamHealth(): { connected: boolean; subscriptions: number } {
  return { connected: isConnected, subscriptions: subscriptions.size };
}