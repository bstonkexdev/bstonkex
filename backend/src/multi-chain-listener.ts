/**
 * BSTONKEX — Multi-Chain Factory Event Listener
 * 
 * Subscribes to token creation events across all configured chains:
 * - Solana: WebSocket logsSubscribe for program logs
 * - EVM chains: WebSocket eth_subscribe for factory contract logs
 * - Tron: HTTP polling via TronGrid API
 * 
 * Events are normalized and passed to the ingest callback which writes
 * to the trenches-store and broadcasts via WebSocket.
 */

import WebSocket from 'ws';
import { LAUNCHPAD_CONFIG, type ChainConfig, type SolanaLaunchpad, type EvmLaunchpad } from './config/launchpads.js';

export interface TokenCreationEvent {
  mint: string;
  name: string;
  symbol: string;
  uri?: string;
  icon?: string;
  chain: string;
  launchpad: string;
  price?: string;
  creator?: string;
  txHash?: string;
}

type IngestCallback = (event: TokenCreationEvent) => void;
type BroadcastCallback = (data: object) => void;

interface ListenerState {
  chain: string;
  launchpad: string;
  connected: boolean;
  eventsReceived: number;
  lastEventAt: number | null;
  reconnects: number;
  lastError: string | null;
  ws?: WebSocket | null;
  pollTimer?: ReturnType<typeof setInterval> | null;
}

const listeners = new Map<string, ListenerState>();
let ingestFn: IngestCallback | null = null;
let broadcastFn: BroadcastCallback | null = null;
const RECONNECT_DELAY = 10_000;
const MAX_RECONNECT_DELAY = 60_000;

// ── Helpers ────────────────────────────────────────────────────

function listenerKey(chain: string, lp: string): string {
  return `${chain}:${lp}`;
}

function log(level: 'info' | 'warn' | 'error', msg: string) {
  const ts = new Date().toISOString();
  console[level](`[${ts}] [MultiChain] ${msg}`);
}

// ── Solana logsSubscribe ───────────────────────────────────────

function startSolanaListener(chainKey: string, config: ChainConfig, lp: SolanaLaunchpad): void {
  const key = listenerKey(chainKey, lp.id);
  const state: ListenerState = {
    chain: chainKey, launchpad: lp.id, connected: false,
    eventsReceived: 0, lastEventAt: null, reconnects: 0, lastError: null, ws: null,
  };
  listeners.set(key, state);

  function connect() {
    try {
      const ws = new WebSocket(config.rpcEndpoint.replace('https://', 'wss://'));
      state.ws = ws;

      ws.on('open', () => {
        state.connected = true;
        state.lastError = null;
        log('info', `Solana connected: ${lp.name} (${lp.factoryAddress.slice(0, 8)}...)`);

        // Subscribe to program logs for the factory address
        ws.send(JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'logsSubscribe',
          params: [{ mentions: [lp.factoryAddress] }, { commitment: 'processed' }],
        }));
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());

          // logsNotification
          if (msg.method === 'logsNotification') {
            const logs = msg.params?.result?.value?.logs || [];
            const signature = msg.params?.result?.value?.signature || '';
            const hasCreate = logs.some((l: string) =>
              l.includes(lp.signatureKeyword) || l.includes('Instruction: Create')
            );

            if (hasCreate && ingestFn) {
              // Extract token mint from logs (first account in the program log)
              const mintLog = logs.find((l: string) => /mint[:\s]/i.test(l)) || '';
              const mintMatch = mintLog.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
              const mint = mintMatch?.[1] || signature.slice(0, 44);

              ingestFn({
                mint,
                name: 'Unknown',
                symbol: '???',
                chain: chainKey,
                launchpad: lp.id,
                txHash: signature,
              });
              state.eventsReceived++;
              state.lastEventAt = Date.now();
            }
          }
        } catch { /* malformed */ }
      });

      ws.on('error', (err: Error) => {
        state.lastError = err.message;
        log('error', `Solana ${lp.name} error: ${err.message}`);
      });

      ws.on('close', () => {
        state.connected = false;
        state.ws = null;
        state.reconnects++;
        const delay = Math.min(RECONNECT_DELAY * Math.pow(1.5, state.reconnects), MAX_RECONNECT_DELAY);
        log('warn', `Solana ${lp.name} disconnected, reconnecting in ${Math.round(delay / 1000)}s`);
        setTimeout(connect, delay);
      });
    } catch (err: any) {
      state.lastError = err.message;
      log('error', `Solana ${lp.name} connect failed: ${err.message}`);
      state.reconnects++;
      setTimeout(connect, RECONNECT_DELAY);
    }
  }

  connect();
}

// ── EVM eth_subscribe (factory log listener) ──────────────────

function startEvmListener(chainKey: string, config: ChainConfig, lp: EvmLaunchpad): void {
  const key = listenerKey(chainKey, lp.id);
  const state: ListenerState = {
    chain: chainKey, launchpad: lp.id, connected: false,
    eventsReceived: 0, lastEventAt: null, reconnects: 0, lastError: null, ws: null,
  };
  listeners.set(key, state);

  // Convert HTTP RPC URL to WebSocket URL for subscription
  const wsUrl = config.rpcEndpoint
    .replace('https://', 'wss://')
    .replace('http://', 'ws://');

  function connect() {
    try {
      const ws = new WebSocket(wsUrl);
      state.ws = ws;

      ws.on('open', () => {
        state.connected = true;
        state.lastError = null;
        log('info', `EVM connected: ${lp.name} on chain ${config.chainId} (${lp.factoryAddress.slice(0, 10)}...)`);

        // Subscribe to logs from the factory contract with the PairCreated topic0
        ws.send(JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_subscribe',
          params: ['logs', {
            address: lp.factoryAddress,
            topics: [lp.topic0],
          }],
        }));
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());

          // eth_subscription notification
          if (msg.method === 'eth_subscription' && msg.params?.result) {
            const log = msg.params.result;
            const txHash = log.transactionHash || '';

            // Decode PairCreated event: topic1 = token0, topic2 = token1
            // For bonding-curve launchpads, token1 is the new token
            const tokenAddress = log.topics?.[2]
              ? '0x' + log.topics[2].slice(26)  // Extract address from 32-byte topic
              : log.address;

            if (ingestFn) {
              ingestFn({
                mint: tokenAddress.toLowerCase(),
                name: 'Unknown',
                symbol: '???',
                chain: chainKey,
                launchpad: lp.id,
                txHash,
              });
              state.eventsReceived++;
              state.lastEventAt = Date.now();
            }
          }
        } catch { /* malformed */ }
      });

      ws.on('error', (err: Error) => {
        state.lastError = err.message;
        log('error', `EVM ${lp.name} error: ${err.message}`);
      });

      ws.on('close', () => {
        state.connected = false;
        state.ws = null;
        state.reconnects++;
        const delay = Math.min(RECONNECT_DELAY * Math.pow(1.5, state.reconnects), MAX_RECONNECT_DELAY);
        log('warn', `EVM ${lp.name} disconnected, reconnecting in ${Math.round(delay / 1000)}s`);
        setTimeout(connect, delay);
      });
    } catch (err: any) {
      state.lastError = err.message;
      log('error', `EVM ${lp.name} connect failed: ${err.message}`);
      state.reconnects++;
      setTimeout(connect, RECONNECT_DELAY);
    }
  }

  connect();
}

// ── TronGrid HTTP Polling ─────────────────────────────────────

function startTronListener(chainKey: string, config: ChainConfig, lp: SolanaLaunchpad): void {
  const key = listenerKey(chainKey, lp.id);
  const state: ListenerState = {
    chain: chainKey, launchpad: lp.id, connected: false,
    eventsReceived: 0, lastEventAt: null, reconnects: 0, lastError: null, pollTimer: null,
  };
  listeners.set(key, state);

  let lastTimestamp = Date.now();

  async function poll() {
    try {
      // TronGrid event query for the SunPump factory contract
      const url = `${config.rpcEndpoint}/v1/contracts/${lp.factoryAddress}/events?event_name=${lp.signatureKeyword}&min_timestamp=${lastTimestamp}&limit=50&order_by=block_timestamp,asc`;

      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        state.lastError = `HTTP ${res.status}`;
        return;
      }

      const data = await res.json() as any;
      const events = data.data || [];

      state.connected = true;

      for (const event of events) {
        const txId = event.transaction_id || '';
        const tokenAddr = event.result?.tokenAddress || event.result?.token_address || '';

        if (tokenAddr && ingestFn) {
          ingestFn({
            mint: tokenAddr,
            name: event.result?.name || 'Unknown',
            symbol: event.result?.symbol || '???',
            chain: chainKey,
            launchpad: lp.id,
            txHash: txId,
          });
          state.eventsReceived++;
          state.lastEventAt = Date.now();
        }

        // Update timestamp watermark
        const eventTs = event.block_timestamp || Date.now();
        if (eventTs > lastTimestamp) lastTimestamp = eventTs + 1;
      }

      log('info', `Tron ${lp.name}: polled, ${events.length} new events, ${state.eventsReceived} total`);
    } catch (err: any) {
      state.lastError = err.message;
      state.reconnects++;
      log('error', `Tron ${lp.name} poll error: ${err.message}`);
    }
  }

  // Poll every 15 seconds
  state.pollTimer = setInterval(poll, 15_000);
  poll(); // Initial poll
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Start all multi-chain listeners from the launchpad config.
 */
export function startMultiChainListeners(
  ingest: IngestCallback,
  broadcast?: BroadcastCallback,
): void {
  ingestFn = ingest;
  broadcastFn = broadcast || null;

  log('info', '═══ Starting Multi-Chain Factory Listeners ═══');
  let totalStarted = 0;

  for (const [chainKey, config] of Object.entries(LAUNCHPAD_CONFIG)) {
    log('info', `Chain: ${chainKey} (ID: ${config.chainId}) — ${config.launchpads.length} launchpad(s)`);

    for (const lp of config.launchpads) {
      const isEvm = 'topic0' in lp;
      const isSolana = 'eventType' in lp && lp.eventType === 'solana_program_log';
      const isTron = 'eventType' in lp && (lp as SolanaLaunchpad).eventType === 'tron_event_log';

      if (isSolana) {
        startSolanaListener(chainKey, config, lp as SolanaLaunchpad);
        totalStarted++;
      } else if (isTron) {
        startTronListener(chainKey, config, lp as SolanaLaunchpad);
        totalStarted++;
      } else if (isEvm) {
        startEvmListener(chainKey, config, lp as EvmLaunchpad);
        totalStarted++;
      } else {
        log('warn', `Skipping ${lp.id}: unsupported event type`);
      }
    }
  }

  log('info', `═══ ${totalStarted} listeners started across ${Object.keys(LAUNCHPAD_CONFIG).length} chains ═══`);
}

/**
 * Stop all listeners gracefully.
 */
export function stopMultiChainListeners(): void {
  for (const [key, state] of listeners) {
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    state.connected = false;
    log('info', `Stopped listener: ${key}`);
  }
  listeners.clear();
}

/**
 * Get health status for all listeners (for /api/launchpads/status).
 */
export function getListenerHealth(): Array<{
  chain: string; launchpad: string; connected: boolean;
  eventsReceived: number; lastEventAt: number | null;
  reconnects: number; lastError: string | null;
}> {
  return [...listeners.values()].map(s => ({
    chain: s.chain,
    launchpad: s.launchpad,
    connected: s.connected,
    eventsReceived: s.eventsReceived,
    lastEventAt: s.lastEventAt,
    reconnects: s.reconnects,
    lastError: s.lastError,
  }));
}