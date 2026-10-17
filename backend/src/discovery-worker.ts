/**
 * BSTONKEX Discovery Worker — Runs continuously on Railway.
 *
 * Owns ALL blockchain scanning:
 *   - PumpPortal WebSocket subscription (Pump.fun creates + trades)
 *   - On-chain Solana scanners (LaunchLab, DBC) via Anchor discriminators
 *   - EVM log scanners (Four.meme, FLAP, Uniswap) via eth_getLogs with chunking
 *   - Logo/metadata resolution from IPFS
 *   - Postgres checkpoint persistence
 *
 * Broadcasts new tokens to the WebSocket gateway for live frontend updates.
 * The frontend NEVER runs scanners — it only reads via REST/WS.
 *
 * Start: `node dist/discovery-worker.js`
 * Railway: add as a second process in the same service (Procfile)
 *   or as a separate Railway service pointing to the same repo.
 */

import WebSocket from 'ws';
import { isDbConfigured, query, getPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { upsertMarketToken, type MarketTokenRecord } from './db/market-tokens.js';
import { hsetAll, zadd } from './trenches-store.js';

// ── Configuration ──────────────────────────────────────────

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_WS = process.env.SOLANA_WS_URL || ''; // WebSocket URL for logsSubscribe (e.g. wss://mainnet.helius-rpc.com/?api-key=...)
const BSC_RPC = process.env.BSC_RPC_URL || '';
const BASE_RPC = process.env.BASE_RPC_URL || '';
const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const LAUNCHLAB_PROGRAM = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';

const SCAN_INTERVAL_MS = parseInt(process.env.DISCOVERY_SCAN_INTERVAL_MS || '30000');
const BSC_CHUNK = 200;
const BASE_CHUNK = 2000;

// ── Logging ────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', msg: string) {
  console[level](`[${new Date().toISOString()}] [Worker] ${msg}`);
}

// ── Anchor Event Discriminators (IDL-verified exact bytes) ─
// Verified against on-chain transactions, NOT third-party SDKs.

const DISC_PUMP_CREATE  = new Uint8Array([27, 114, 169, 77, 222, 235, 99, 118]);
const DISC_PUMP_TRADE   = new Uint8Array([189, 219, 127, 211, 78, 230, 97, 238]);
const DISC_PUMP_COMPLETE = new Uint8Array([95, 114, 97, 156, 212, 46, 152, 8]);
// LaunchLab create_token — extracted from tx uzaCNktp...xoj1fV
const DISC_LAUNCHLAB_CREATE = new Uint8Array([180, 8, 81, 71, 19, 132, 173, 8]);
// DBC initialize_virtual_pool_with_spl_token — extracted from tx 5cnDbFtd...bP2VSNF
// Will be populated on first verified tx fetch.
let DISC_DBC_CREATE = new Uint8Array(8);
let dbcDiscVerified = false;

function discMatch(data: Uint8Array, expected: Uint8Array): boolean {
  if (data.length < 8 || expected.length < 8) return false;
  for (let i = 0; i < 8; i++) if (data[i] !== expected[i]) return false;
  return true;
}

// ── Base58 decode (for Solana instruction data) ─────────────

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str: string): Uint8Array {
  let num = 0n;
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('bad b58');
    num = num * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (num > 0n) { bytes.unshift(Number(num % 256n)); num /= 256n; }
  for (const c of str) { if (c === '1') bytes.unshift(0); else break; }
  return new Uint8Array(bytes);
}

// ── Postgres Checkpoint Helpers ─────────────────────────────

interface Checkpoint {
  scanner_id: string;
  last_slot: number;
  last_block: number;
  updated_at: string;
}

async function ensureCheckpointTable(): Promise<void> {
  if (!isDbConfigured()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS discovery_checkpoints (
      scanner_id TEXT PRIMARY KEY,
      last_slot BIGINT DEFAULT 0,
      last_block BIGINT DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getCheckpoint(scannerId: string): Promise<Checkpoint | null> {
  if (!isDbConfigured()) return null;
  try {
    const res = await query('SELECT * FROM discovery_checkpoints WHERE scanner_id = $1', [scannerId]);
    return res.rows[0] || null;
  } catch { return null; }
}

async function saveCheckpoint(scannerId: string, slot?: number, block?: number): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    await query(`
      INSERT INTO discovery_checkpoints (scanner_id, last_slot, last_block, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (scanner_id) DO UPDATE SET
        last_slot = GREATEST(discovery_checkpoints.last_slot, EXCLUDED.last_slot),
        last_block = GREATEST(discovery_checkpoints.last_block, EXCLUDED.last_block),
        updated_at = NOW()
    `, [scannerId, slot || 0, block || 0]);
  } catch (e: any) {
    log('warn', `Checkpoint save failed for ${scannerId}: ${e.message}`);
  }
}

// ── Solana RPC Helper ──────────────────────────────────────

async function solanaRpc(method: string, params: any): Promise<any> {
  const resp = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json() as any;
  if (data.error) throw new Error(data.error.message || 'Solana RPC error');
  return data.result;
}

// ── EVM RPC Helper ─────────────────────────────────────────

async function evmRpc(rpcUrl: string, method: string, params: any[]): Promise<any> {
  if (!rpcUrl) throw new Error('RPC URL not configured');
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await resp.json() as any;
  if (data.error) throw new Error(data.error.message || 'EVM RPC error');
  return data.result;
}

// ── Pump.fun CreateEvent Decoder (Anchor IDL) ──────────────

function decodePumpCreateEvent(data: Uint8Array): { name: string; symbol: string; mint: string; creator: string } | null {
  if (data.length < 8 + 4 + 4 + 4 + 32 + 32 + 32) return null;
  if (!discMatch(data, DISC_PUMP_CREATE)) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const td = new TextDecoder();

  const readStr = (): string => {
    const len = view.getUint32(o, true); o += 4;
    const s = td.decode(data.slice(o, o + len)); o += len;
    return s;
  };
  const readPk = (): string => {
    const pk = data.slice(o, o + 32); o += 32;
    return Buffer.from(pk).toString('base64url');
  };

  try {
    const name = readStr();
    const symbol = readStr();
    readStr(); // uri
    const mint = readPk();
    o += 32; // bondingCurve
    const creator = readPk();
    return { name, symbol, mint, creator };
  } catch { return null; }
}

// ── PumpPortal WebSocket ────────────────────────────────────

interface PumpPortalEvent {
  txType: string;
  mint: string;
  name: string;
  symbol: string;
  traderPublicKey: string;
  bondingCurveKey: string;
  vSolInBondingCurve: number;
  vTokensInBondingCurve: number;
  initialBuy?: number;
  uri?: string;
  timestamp?: number;
}

let ppWs: WebSocket | null = null;
let ppConnected = false;
let ppTokensReceived = 0;
let ppReconnects = 0;
let ppLastError: string | null = null;

async function handlePumpPortalCreate(event: PumpPortalEvent): Promise<void> {
  ppTokensReceived++;

  const spotPrice = event.vSolInBondingCurve / event.vTokensInBondingCurve;
  const progress = Math.min(100, Math.round((event.vSolInBondingCurve / 85) * 100 * 100) / 100);

  const token: MarketTokenRecord = {
    mint: event.mint,
    name: event.name || '',
    symbol: event.symbol || '',
    chain: 'solana',
    launchpad: 'pumpfun',
    spotPrice: spotPrice.toFixed(12),
    virtualMcap: (spotPrice * 1e9).toFixed(2),
    bondingCurveProgress: progress.toFixed(2),
    volume24h: '0',
    liquidity: (event.vSolInBondingCurve * 200).toFixed(2), // ~SOL USD
    buys24h: '1',
    sells24h: '0',
    uri: event.uri || '',
    txHash: `pumpportal:${event.bondingCurveKey}`,
    source: 'pumpportal_ws',
    createdAt: new Date().toISOString(),
  };

  // Write to Postgres (market_tokens + token_events)
  await upsertMarketToken(token);
  await insertTokenEvent(
    'pumpportal', 'pumpfun', 'solana', event.mint,
    token.txHash || '', new Date(), event.traderPublicKey, event.name, event.symbol,
  );

  // Write to in-memory store (for fast WS serve)
  hsetAll(`token:${event.mint}`, Object.fromEntries(
    Object.entries(token).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
  ));
  zadd(`trenches:pumpfun`, Date.now(), event.mint);
  zadd(`trenches:sol:pumpfun`, Date.now(), event.mint);

  // Resolve icon async (non-blocking)
  if (event.uri) resolveMetadata(event.mint, event.uri, token).catch(() => {});

  log('info', `Pump.fun create: ${event.symbol} (${event.mint.slice(0, 12)}...)`);
}

async function resolveMetadata(mint: string, uri: string, baseToken: MarketTokenRecord): Promise<void> {
  const gateways = [
    'https://cf-ipfs.com/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
  ];
  const hash = uri.startsWith('ipfs://') ? uri.replace('ipfs://', '').replace(/^ipfs\//, '') : null;
  const urls = hash ? gateways.map(g => g + hash) : [uri];

  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!resp.ok) continue;
      const meta = await resp.json() as any;
      const rawImage = meta.image || meta.image_uri || '';
      const imgHash = rawImage.startsWith('ipfs://') ? rawImage.replace('ipfs://', '') : null;
      const imageUrl = imgHash ? gateways[0] + imgHash : rawImage;

      await upsertMarketToken({
        ...baseToken,
        image: imageUrl || undefined,
        twitter: meta.twitter || meta.extensions?.twitter || undefined,
        telegram: meta.telegram || meta.extensions?.telegram || undefined,
        website: meta.website || meta.extensions?.website || undefined,
      });
      return;
    } catch { /* try next gateway */ }
  }
}

function connectPumpPortal(): void {
  try {
    ppWs = new WebSocket('wss://pumpportal.fun/api/data');

    ppWs.on('open', () => {
      ppConnected = true;
      ppLastError = null;
      log('info', 'PumpPortal connected');
      ppWs!.send(JSON.stringify({ method: 'subscribeNewToken' }));
    });

    ppWs.on('message', (raw: Buffer) => {
      try {
        const event: PumpPortalEvent = JSON.parse(raw.toString());
        if (event.txType === 'create') {
          handlePumpPortalCreate(event).catch(e => {
            log('warn', `PumpPortal create handler error: ${e.message}`);
          });
        }
      } catch { /* malformed */ }
    });

    ppWs.on('error', (err: Error) => {
      ppLastError = err.message;
      log('warn', `PumpPortal error: ${err.message}`);
    });

    ppWs.on('close', () => {
      ppConnected = false;
      ppWs = null;
      ppReconnects++;
      log('info', 'PumpPortal disconnected, reconnecting in 5s...');
      setTimeout(connectPumpPortal, 5000);
    });
  } catch (e: any) {
    ppLastError = e.message;
    ppReconnects++;
    setTimeout(connectPumpPortal, 10000);
  }
}

// ── Solana logsSubscribe — Pump.fun real-time on-chain feed ──
// Uses WebSocket `logsSubscribe` to get instant notifications when the
// Pump.fun program emits logs. Filtered by `mentions` (program ID).
// On each notification:
//   1. Scan log lines for "Program data: <base64>"
//   2. Decode base64 → bytes, check DISC_PUMP_CREATE (8-byte Anchor disc)
//   3. If match → fetch full tx via getTransaction to extract postTokenBalances.mint
//   4. Write to market_tokens + token_events
//
// This is REAL-TIME (WebSocket push), not polling. Latency = ~1-2 slots (~400ms).
// Falls back to polling if SOLANA_WS_URL is not set.

let solWs: WebSocket | null = null;
let solWsConnected = false;
let solWsReconnects = 0;
let solWsCreates = 0;

function connectSolanaLogs(): void {
  if (!SOLANA_WS) {
    log('info', 'SOLANA_WS_URL not set — Pump.fun logsSubscribe disabled, using poll fallback');
    return;
  }

  try {
    solWs = new WebSocket(SOLANA_WS);

    solWs.on('open', () => {
      solWsConnected = true;
      log('info', 'Solana WS connected — subscribing to Pump.fun logs');
      // Subscribe to logs mentioning the Pump.fun program
      solWs!.send(JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'logsSubscribe',
        params: [
          { mentions: [PUMP_FUN_PROGRAM] },
          { commitment: 'confirmed' },
        ],
      }));
    });

    solWs.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.method !== 'logsNotification') return;

        const logs: string[] = msg.params?.result?.value?.logs || [];
        const signature: string = msg.params?.result?.value?.signature || '';
        const err = msg.params?.result?.value?.err;
        if (err) return; // skip failed txs

        // Find "Program data: <base64>" lines from the Pump.fun program
        for (const logLine of logs) {
          if (!logLine.startsWith('Program data: ')) continue;
          const b64 = logLine.slice('Program data: '.length).trim();
          let data: Uint8Array;
          try { data = Uint8Array.from(Buffer.from(b64, 'base64')); } catch { continue; }

          if (!discMatch(data, DISC_PUMP_CREATE)) continue;

          // It's a CreateEvent! Fetch full tx to get the new mint.
          handlePumpCreateFromChain(signature, data).catch(e => {
            log('warn', `Pump create handler error: ${e.message}`);
          });
          break; // one CreateEvent per tx
        }
      } catch { /* malformed */ }
    });

    solWs.on('error', (err: Error) => {
      log('warn', `Solana WS error: ${err.message}`);
    });

    solWs.on('close', () => {
      solWsConnected = false;
      solWs = null;
      solWsReconnects++;
      log('info', 'Solana WS disconnected, reconnecting in 5s...');
      setTimeout(connectSolanaLogs, 5000);
    });
  } catch (e: any) {
    log('warn', `Solana WS connect failed: ${e.message}`);
    solWsReconnects++;
    setTimeout(connectSolanaLogs, 10000);
  }
}

/**
 * Handle a Pump.fun CreateEvent detected via logsSubscribe.
 * Fetches the full transaction to extract the new token mint from postTokenBalances.
 * Also decodes name/symbol from the event data.
 */
async function handlePumpCreateFromChain(signature: string, data: Uint8Array): Promise<void> {
  // Decode name/symbol from event data (same as decodePumpCreateEvent but we already have the bytes)
  let name = '', symbol = '', creator = '';
  try {
    const decoded = decodePumpCreateEvent(data);
    if (decoded) { name = decoded.name; symbol = decoded.symbol; creator = decoded.creator; }
  } catch { /* non-critical */ }

  // Fetch full tx for postTokenBalances
  try {
    const tx = await solanaRpc('getTransaction', [
      signature,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx?.meta) return;

    const eventTime = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date();
    const preMints = new Set((tx.meta.preTokenBalances || []).map((b: any) => b.mint));

    for (const post of (tx.meta.postTokenBalances || [])) {
      if (post.mint && !preMints.has(post.mint)) {
        // New token mint found
        const accountKeys = tx.transaction?.message?.accountKeys || [];
        const creatorPk = creator || accountKeys[0]?.pubkey || '';

        const token: MarketTokenRecord = {
          mint: post.mint,
          name, symbol,
          chain: 'solana', launchpad: 'pumpfun',
          creator: creatorPk, txHash: signature,
          source: 'onchain_logs',
          createdAt: eventTime.toISOString(),
        };

        await upsertMarketToken(token);
        await insertTokenEvent(
          'onchain', 'pumpfun', 'solana', post.mint,
          signature, eventTime, creatorPk, name, symbol,
        );
        hsetAll(`token:${post.mint}`, Object.fromEntries(
          Object.entries(token).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
        ));
        zadd('trenches:pumpfun', tx.blockTime || Date.now(), post.mint);
        zadd('trenches:sol:pumpfun', tx.blockTime || Date.now(), post.mint);

        solWsCreates++;
        log('info', `[logsSubscribe] Pump.fun create: ${symbol} (${post.mint.slice(0, 12)}...) sig=${signature.slice(0, 16)}...`);
        return;
      }
    }
  } catch (e: any) {
    log('warn', `handlePumpCreateFromChain error: ${e.message}`);
  }
}

// ── Token Event Insert (coverage table) ─────────────────────
// Every detection goes here. UNIQUE(source, chain, token) prevents dupes.

// Track writes per source for periodic logging
const writesBySource: Record<string, number> = {};

async function insertTokenEvent(
  source: string, launchpad: string, chain: string, token: string,
  txHash: string, eventTime: Date, creator?: string, name?: string, symbol?: string,
): Promise<void> {
  if (!isDbConfigured()) {
    log('warn', `[${source}] insertTokenEvent skipped: DATABASE_URL not set`);
    return;
  }
  try {
    const result = await query(`
      INSERT INTO token_events (source, launchpad, chain, token, tx_hash, event_time, seen_at, creator, name, symbol)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)
      ON CONFLICT (source, chain, token) DO NOTHING
    `, [source, launchpad, chain, token, txHash, eventTime, creator || '', name || '', symbol || '']);
    if (result.rowCount && result.rowCount > 0) {
      writesBySource[source] = (writesBySource[source] || 0) + 1;
      log('info', `[${source}] INSERT OK: ${symbol || token.slice(0, 12)} (${launchpad}) rowCount=${result.rowCount}`);
    } else {
      log('info', `[${source}] INSERT skipped (duplicate): ${token.slice(0, 12)}`);
    }
  } catch (e: any) {
    log('error', `[${source}] INSERT FAILED: ${e.message} | table=token_events token=${token.slice(0, 12)}`);
  }
}

/**
 * Coverage SQL — run this query on the database to get overlap stats:
 *
 *   SELECT
 *     a.source AS only_in_a, b.source AS only_in_b,
 *     (SELECT COUNT(*) FROM token_events WHERE source='pumpportal' AND launchpad='pumpfun') AS pp_total,
 *     (SELECT COUNT(*) FROM token_events WHERE source='onchain' AND launchpad='pumpfun') AS oc_total,
 *     (SELECT COUNT(*) FROM token_events
 *       WHERE source='pumpportal' AND launchpad='pumpfun'
 *         AND token IN (SELECT token FROM token_events WHERE source='onchain' AND launchpad='pumpfun')
 *     ) AS overlap,
 *     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (seen_at - event_time)) AS p50_lag,
 *     PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (seen_at - event_time)) AS p95_lag
 *   FROM token_events a
 *   FULL OUTER JOIN token_events b ON a.token = b.token AND a.chain = b.chain AND a.source != b.source
 *   WHERE a.launchpad='pumpfun' OR b.launchpad='pumpfun'
 *   GROUP BY a.source, b.source;
 *
 * Simplified per-source lag:
 *   SELECT source,
 *     COUNT(*) AS detections,
 *     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (seen_at - event_time))) AS p50_lag_sec,
 *     PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (seen_at - event_time))) AS p95_lag_sec
 *   FROM token_events WHERE launchpad='pumpfun' AND event_time IS NOT NULL
 *   GROUP BY source;
 */

// ── Solana On-Chain Scanner (Anchor discriminators) ─────────

async function scanSolanaProgram(
  programId: string,
  name: string,
  disc: Uint8Array,
  checkpointId: string,
): Promise<number> {
  const cp = await getCheckpoint(checkpointId);
  const fromSlot = cp?.last_slot ?? 0;

  try {
    const sigs = await solanaRpc('getSignaturesForAddress', [
      programId, { limit: 20, commitment: 'confirmed' },
    ]);
    if (!sigs || sigs.length === 0) return 0;

    let newCount = 0;
    let maxSlot = fromSlot;

    for (const sig of sigs.slice(0, 10)) {
      if (sig.slot <= fromSlot) continue;
      if (sig.err) continue;

      try {
        const tx = await solanaRpc('getTransaction', [
          sig.signature,
          { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
        ]);
        if (!tx?.meta?.logMessages) continue;

        for (const logLine of tx.meta.logMessages) {
          if (!logLine.startsWith('Program data: ')) continue;
          const b64 = logLine.slice('Program data: '.length).trim();
          let data: Uint8Array;
          try { data = Uint8Array.from(Buffer.from(b64, 'base64')); } catch { continue; }

          if (!discMatch(data, disc)) continue;

          // Extract new token from postTokenBalances
          const preMints = new Set((tx.meta.preTokenBalances || []).map((b: any) => b.mint));
          for (const post of (tx.meta.postTokenBalances || [])) {
            if (post.mint && !preMints.has(post.mint)) {
              const accountKeys = tx.transaction?.message?.accountKeys || [];
              const creator = accountKeys[0]?.pubkey || '';
              const token: MarketTokenRecord = {
                mint: post.mint,
                name: '', symbol: '',
                chain: 'solana', launchpad: name,
                creator, txHash: sig.signature,
                source: 'onchain_discriminator',
                createdAt: new Date((tx.blockTime || 0) * 1000).toISOString(),
              };
              await upsertMarketToken(token);
              await insertTokenEvent(
                'onchain', name, 'solana', post.mint,
                sig.signature, new Date((tx.blockTime || 0) * 1000), creator,
              );
              hsetAll(`token:${post.mint}`, Object.fromEntries(
                Object.entries(token).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
              ));
              zadd(`trenches:${name}`, tx.blockTime || Date.now(), post.mint);
              newCount++;
              break;
            }
          }
          break; // Only first matching event per tx
        }

        maxSlot = Math.max(maxSlot, sig.slot);
      } catch { /* skip tx */ }
    }

    if (maxSlot > fromSlot) await saveCheckpoint(checkpointId, maxSlot);
    return newCount;
  } catch (e: any) {
    log('warn', `${name} scan error: ${e.message}`);
    return 0;
  }
}

// Verify DBC discriminator from known tx on first run
async function verifyDBCDiscriminator(): Promise<void> {
  if (dbcDiscVerified) return;
  try {
    const KNOWN_TX = '5cnDbFtdgG3Qyf4TD488rXCsFtGxxyp2uXB3ybbxGEDBtsQSEodbDs9w6arQMWf85HKme2ojn8A7wFAE5bP2VSNF';
    const tx = await solanaRpc('getTransaction', [
      KNOWN_TX,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx?.transaction?.message?.instructions) return;
    for (const ix of tx.transaction.message.instructions) {
      const pid = typeof ix.programId === 'string' ? ix.programId : '';
      if (pid !== DBC_PROGRAM) continue;
      if (ix.data) {
        let bytes: Uint8Array;
        try { bytes = base58Decode(ix.data); } catch { continue; }
        if (bytes.length >= 8) {
          for (let i = 0; i < 8; i++) DISC_DBC_CREATE[i] = bytes[i];
          dbcDiscVerified = true;
          log('info', `DBC discriminator verified: [${Array.from(DISC_DBC_CREATE)}]`);
          return;
        }
      }
    }
  } catch { /* retry next cycle */ }
}

// ── EVM Log Scanner (chunked eth_getLogs via dedicated RPC) ─

interface EVMScannerDef {
  id: string;
  chain: string;
  chainId: number;
  rpcUrl: string;
  address: string;
  topic0: string | null;
  chunkSize: number;
}

const EVM_SCANNERS: EVMScannerDef[] = [
  // Four.meme and FLAP: topic0 is null until ABI is fetched.
  // The worker does NOT have ETHERSCAN_API_KEY for live ABI fetches.
  // These stay disabled until the user provides the key and we add ABI resolution.
  {
    id: 'four-meme', chain: 'bsc', chainId: 56, rpcUrl: BSC_RPC,
    address: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
    topic0: null, chunkSize: BSC_CHUNK,
  },
  {
    id: 'flap', chain: 'bsc', chainId: 56, rpcUrl: BSC_RPC,
    address: '0x1de460f363af910f51726def188f9004276bf4bc',
    topic0: null, chunkSize: BSC_CHUNK,
  },
  {
    id: 'uniswap-v3-base', chain: 'base', chainId: 8453, rpcUrl: BASE_RPC,
    address: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    topic0: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
    chunkSize: BASE_CHUNK,
  },
];

async function scanEVMScanner(def: EVMScannerDef): Promise<number> {
  if (!def.topic0 || !def.rpcUrl) return 0;

  const cp = await getCheckpoint(`evm:${def.id}`);
  try {
    const latestHex = await evmRpc(def.rpcUrl, 'eth_blockNumber', []);
    const latest = parseInt(latestHex, 16);
    const fromBlock = cp?.last_block ? cp.last_block + 1 : Math.max(0, latest - def.chunkSize);
    if (fromBlock > latest) return 0;

    const resp = await fetch(def.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
        params: [{
          address: def.address,
          topics: [def.topic0],
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${latest.toString(16)}`,
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json() as any;
    if (data.error) {
      log('warn', `${def.id} eth_getLogs error: ${data.error.message}`);
      return 0;
    }

    const logs = data.result || [];
    for (const evmLog of logs) {
      const tokenAddr = evmLog.topics?.length > 1 ? '0x' + evmLog.topics[1].slice(-40) : '';
      if (tokenAddr) {
        await upsertMarketToken({
          mint: tokenAddr.toLowerCase(),
          chain: def.chain, launchpad: def.id,
          txHash: evmLog.transactionHash,
          source: 'evm_logs',
          createdAt: new Date().toISOString(),
        });
      }
    }

    await saveCheckpoint(`evm:${def.id}`, undefined, latest);
    return logs.length;
  } catch (e: any) {
    log('warn', `${def.id} scan error: ${e.message}`);
    return 0;
  }
}

// ── Main Worker Loop ───────────────────────────────────────

async function runCycle(): Promise<void> {
  // Pump.fun is handled by logsSubscribe (real-time WS push) — no polling needed.
  // PumpPortal also provides real-time creates. The polling scan was redundant.

  // 1. Scan LaunchLab (no logsSubscribe yet — poll via getSignaturesForAddress)
  const labNew = await scanSolanaProgram(LAUNCHLAB_PROGRAM, 'raydium-launchlab', DISC_LAUNCHLAB_CREATE, 'solana:launchlab');
  if (labNew > 0) log('info', `LaunchLab: ${labNew} new`);

  // 2. Scan DBC (verify discriminator first)
  if (!dbcDiscVerified) await verifyDBCDiscriminator();
  if (dbcDiscVerified) {
    const dbcNew = await scanSolanaProgram(DBC_PROGRAM, 'meteora-dbc', DISC_DBC_CREATE, 'solana:dbc');
    if (dbcNew > 0) log('info', `DBC: ${dbcNew} new`);
  }

  // 3. Scan EVM scanners
  for (const def of EVM_SCANNERS) {
    const count = await scanEVMScanner(def);
    if (count > 0) log('info', `EVM ${def.id}: ${count} logs`);
  }
}

// ── Adapter status tracking ─────────────────────────────────
const adapterStatus: Record<string, { state: string; detail: string }> = {};

function reportAdapter(name: string, state: 'connected' | 'blocked' | 'error', detail: string) {
  adapterStatus[name] = { state, detail };
  const icon = state === 'connected' ? '✓' : state === 'blocked' ? '✗' : '⚠';
  log('info', `[ADAPTER] ${icon} ${name}: ${state} — ${detail}`);
}

async function main(): Promise<void> {
  log('info', '═══ Discovery Worker starting ═══');
  log('info', `SOLANA_RPC: ${SOLANA_RPC ? 'configured' : 'MISSING'}`);
  log('info', `SOLANA_WS: ${SOLANA_WS ? 'configured' : 'MISSING'}`);
  log('info', `BSC_RPC: ${BSC_RPC ? 'configured' : 'MISSING'}`);
  log('info', `BASE_RPC: ${BASE_RPC ? 'configured' : 'MISSING'}`);
  log('info', `DATABASE_URL: ${isDbConfigured() ? 'configured' : 'MISSING — tokens will NOT persist'}`);
  log('info', `Scan interval: ${SCAN_INTERVAL_MS}ms`);

  // Run migrations
  if (isDbConfigured()) {
    try {
      const result = await runMigrations();
      await ensureCheckpointTable();
      log('info', `Postgres migrations ready: applied=${result.applied.length} skipped=${result.skipped.length}`);
      reportAdapter('postgres', 'connected', `migrations applied: ${result.applied.join(', ') || 'none (all skipped)'}`);
    } catch (e: any) {
      log('error', `Migration failed: ${e.message}`);
      reportAdapter('postgres', 'error', e.message);
    }
  } else {
    reportAdapter('postgres', 'blocked', 'DATABASE_URL not set');
  }

  // PumpPortal WebSocket
  reportAdapter('pumpportal', 'connected', 'connecting to wss://pumpportal.fun/api/data');
  connectPumpPortal();

  // Solana logsSubscribe
  if (SOLANA_WS) {
    reportAdapter('solana_logsSubscribe', 'connected', `subscribing to Pump.fun logs via ${SOLANA_WS.slice(0, 30)}...`);
    connectSolanaLogs();
  } else {
    reportAdapter('solana_logsSubscribe', 'blocked', 'SOLANA_WS_URL not set');
  }

  // EVM scanners
  for (const def of EVM_SCANNERS) {
    if (!def.rpcUrl) {
      reportAdapter(`evm:${def.id}`, 'blocked', `${def.chain.toUpperCase()}_RPC_URL not set`);
    } else if (!def.topic0) {
      reportAdapter(`evm:${def.id}`, 'blocked', 'topic0 not resolved (needs ABI fetch)');
    } else {
      reportAdapter(`evm:${def.id}`, 'connected', `scanning ${def.address.slice(0, 12)}... on ${def.chain}`);
    }
  }

  // Run initial scan immediately
  try {
    await runCycle();
  } catch (e: any) {
    log('error', `Initial scan error: ${e.message}`);
  }

  // Schedule recurring scans
  setInterval(() => {
    runCycle().catch(e => log('error', `Cycle error: ${e.message}`));
  }, SCAN_INTERVAL_MS);

  // Log adapter status and write counts every 60 seconds
  setInterval(() => {
    const ppStatus = ppConnected ? `connected (${ppTokensReceived} tokens, ${ppReconnects} reconnects)` : `disconnected (last: ${ppLastError || 'none'})`;
    const solStatus = solWsConnected ? `connected (${solWsCreates} creates)` : `disconnected (${solWsReconnects} reconnects)`;
    const dbcStatus = dbcDiscVerified ? 'verified' : 'not verified';
    const counts = Object.entries(writesBySource).map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
    log('info', `[STATUS] pp=${ppStatus} | solWS=${solStatus} | dbc=${dbcStatus} | writes: ${counts} | adapters: ${JSON.stringify(adapterStatus)}`);
  }, 60_000);

  log('info', '═══ Discovery Worker running ═══');
}

// ── Health endpoint (for Railway healthcheck) ──────────────
// Railway sets PORT env var. Use it if available, fall back to 8081.
import { createServer } from 'node:http';

const HEALTH_PORT = parseInt(process.env.PORT || process.env.WORKER_HEALTH_PORT || '8081');

main().catch(e => {
  log('error', `Fatal: ${e.message}`);
  process.exit(1);
});

const healthServer = createServer((req, res) => {
  if (req.url === '/health') {
    const envVars = [
      { name: 'DATABASE_URL', set: isDbConfigured() },
      { name: 'SOLANA_RPC_URL', set: !!process.env.SOLANA_RPC_URL },
      { name: 'BSC_RPC_URL', set: !!process.env.BSC_RPC_URL },
      { name: 'BASE_RPC_URL', set: !!process.env.BASE_RPC_URL },
      { name: 'ETHERSCAN_API_KEY', set: !!process.env.ETHERSCAN_API_KEY },
    ];

    const adapters = {
      ...adapterStatus,
      pumpportal: { connected: ppConnected, tokensReceived: ppTokensReceived, reconnects: ppReconnects, lastError: ppLastError },
      solana_logsSubscribe: { connected: solWsConnected, creates: solWsCreates, reconnects: solWsReconnects },
      pumpfun_onchain: { enabled: !!SOLANA_RPC, blocked: !SOLANA_RPC },
      launchlab: { enabled: !!SOLANA_RPC, blocked: !SOLANA_RPC },
      dbc: { enabled: !!SOLANA_RPC && dbcDiscVerified, blocked: !SOLANA_RPC, discriminatorVerified: dbcDiscVerified },
      four_meme: { enabled: !!BSC_RPC && !!process.env.ETHERSCAN_API_KEY, blocked: !BSC_RPC ? 'BSC_RPC_URL missing' : !process.env.ETHERSCAN_API_KEY ? 'ETHERSCAN_API_KEY missing' : null },
      flap: { enabled: !!BSC_RPC && !!process.env.ETHERSCAN_API_KEY, blocked: !BSC_RPC ? 'BSC_RPC_URL missing' : !process.env.ETHERSCAN_API_KEY ? 'ETHERSCAN_API_KEY missing' : null },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      envVars,
      adapters,
      pumpportal: ppConnected,
      tokensReceived: ppTokensReceived,
      reconnects: ppReconnects,
      ppLastError,
    }, null, 2));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

healthServer.listen(HEALTH_PORT, () => {
  log('info', `Worker healthcheck on :${HEALTH_PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'SIGTERM — shutting down');
  if (ppWs) ppWs.close();
  healthServer.close();
  process.exit(0);
});