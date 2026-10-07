// BSTONKEX Deploy Actions — Real deployment/verification actions for each infrastructure component
import { updateComponent, addLog, makeLog } from './infra-state';
import { checkChainRpc, checkAllChains } from './rpc-manager';
import { startEvmIndexer, stopEvmIndexer, isIndexerRunning, getIndexerStats } from './evm-indexer';
import { startSolanaIndexer, stopSolanaIndexer, isSolanaIndexerRunning, getSolanaIndexerStats } from './solana-indexer';
import { initMarketDb, getMarketDbStats } from './market-db';
import { getCredential, testCredential } from './credential-store';
import type { ChainId } from '../config';

export type DeployResult = { success: boolean; detail: string };

// ── Dispatch ─────────────────────────────────────────────────

export async function executeDeployAction(actionId: string): Promise<DeployResult> {
  addLog(makeLog(actionId, 'deploy', 'info', `Executing deploy action: ${actionId}`));

  try {
    switch (actionId) {
      // RPC tests
      case 'test-rpc-bnb': return await testRpc('bsc');
      case 'test-rpc-base': return await testRpc('base');
      case 'test-rpc-solana': return await testRpc('solana');
      case 'test-rpc-robinhood': return await testRpc('robinhood');

      // Indexer
      case 'start-evm-indexer': return startEvm();
      case 'start-solana-indexer': return startSolana();
      case 'stop-evm-indexer': return stopEvm();
      case 'stop-solana-indexer': return stopSolanaA();

      // Database
      case 'init-market-db': return await initDb();

      // Credentials
      case 'configure-1inch': return configureOneInch();

      // Verify actions
      case 'verify-rpc-bnb': return await verifyRpc('bsc');
      case 'verify-rpc-base': return await verifyRpc('base');
      case 'verify-rpc-solana': return await verifyRpc('solana');
      case 'verify-rpc-robinhood': return await verifyRpc('robinhood');
      case 'verify-evm-indexer': return verifyEvmIndexer();
      case 'verify-solana-indexer': return verifySolanaIndexer();
      case 'verify-market-db': return await verifyMarketDb();
      case 'verify-1inch': return await verifyOneInch();
      case 'verify-ws': return verifyWs();
      case 'verify-api': return verifyApi();

      // Backend (external)
      case 'deploy-ws': return { success: false, detail: 'EXTERNAL: Deploy backend/ to Railway, Fly.io, or render.com. The server code is complete in backend/src/server.ts.' };
      case 'deploy-api': return { success: false, detail: 'EXTERNAL: Deploy backend/ with REST API endpoints. See backend/DEPLOY.md for instructions.' };

      default:
        return { success: false, detail: `Unknown action: ${actionId}` };
    }
  } catch (e: any) {
    addLog(makeLog(actionId, 'deploy', 'failure', e.message));
    return { success: false, detail: e.message };
  }
}

// ── RPC Actions ──────────────────────────────────────────────

async function testRpc(chainId: ChainId): Promise<DeployResult> {
  updateComponent(`rpc-${chainId}`, { status: 'DEPLOYING' });
  const health = await checkChainRpc(chainId);
  if (health.status === 'online') {
    updateComponent(`rpc-${chainId}`, { status: 'VERIFIED', lastVerified: Date.now() });
    addLog(makeLog(`rpc-${chainId}`, 'test', 'success', `Block #${health.blockNumber} · ${health.latencyMs}ms`));
    return { success: true, detail: `Connected to ${chainId} — Block #${health.blockNumber} · ${health.latencyMs}ms` };
  }
  updateComponent(`rpc-${chainId}`, { status: 'FAILED', lastError: health.error || 'Connection failed' });
  addLog(makeLog(`rpc-${chainId}`, 'test', 'failure', health.error || 'Connection failed'));
  return { success: false, detail: health.error || 'Connection failed' };
}

async function verifyRpc(chainId: ChainId): Promise<DeployResult> {
  const result = await testRpc(chainId);
  return result;
}

// ── Indexer Actions ──────────────────────────────────────────

function startEvm(): DeployResult {
  if (isIndexerRunning()) return { success: true, detail: 'EVM indexer already running' };
  startEvmIndexer(15000);
  return { success: true, detail: 'EVM event indexer started — indexing Swap/Transfer events from BNB, Base, Robinhood' };
}

function stopEvm(): DeployResult {
  stopEvmIndexer();
  return { success: true, detail: 'EVM indexer stopped' };
}

function startSolana(): DeployResult {
  if (isSolanaIndexerRunning()) return { success: true, detail: 'Solana indexer already running' };
  startSolanaIndexer(20000);
  return { success: true, detail: 'Solana trade indexer started — monitoring Jupiter/Raydium transactions' };
}

function stopSolanaA(): DeployResult {
  stopSolanaIndexer();
  return { success: true, detail: 'Solana indexer stopped' };
}

function verifyEvmIndexer(): DeployResult {
  const stats = getIndexerStats();
  if (stats.running) {
    updateComponent('evm-indexer', { status: 'VERIFIED', lastVerified: Date.now() });
    return { success: true, detail: `Running — ${stats.processedCount} events processed, ${stats.chains.length} chains indexed` };
  }
  return { success: false, detail: 'EVM indexer is not running' };
}

function verifySolanaIndexer(): DeployResult {
  const stats = getSolanaIndexerStats();
  if (stats.running) {
    updateComponent('solana-indexer', { status: 'VERIFIED', lastVerified: Date.now() });
    return { success: true, detail: `Running — ${stats.processedCount} trades processed, ${stats.knownPrograms} DEX programs tracked` };
  }
  return { success: false, detail: 'Solana indexer is not running' };
}

// ── Database Actions ─────────────────────────────────────────

async function initDb(): Promise<DeployResult> {
  const success = await initMarketDb();
  return { success, detail: success ? 'Market database initialized — collections ready' : 'Failed to initialize market database' };
}

async function verifyMarketDb(): Promise<DeployResult> {
  const stats = await getMarketDbStats();
  if (stats.status === 'connected') {
    updateComponent('market-db', { status: 'VERIFIED', lastVerified: Date.now() });
    return { success: true, detail: `Connected — ${stats.trades} trades, ${stats.candles} candles, ${stats.tokens} tokens stored` };
  }
  return { success: false, detail: 'Market database not accessible' };
}

// ── Credential Actions ───────────────────────────────────────

function configureOneInch(): DeployResult {
  const key = getCredential('ONEINCH_API_KEY');
  if (!key) {
    updateComponent('oneinch', { status: 'CREDENTIAL_REQUIRED' });
    return { success: false, detail: 'No 1inch API key configured. Go to CREDENTIALS tab and enter your key from portal.1inch.io' };
  }
  updateComponent('oneinch', { status: 'READY_TO_DEPLOY' });
  return { success: true, detail: '1inch API key configured — test to verify' };
}

async function verifyOneInch(): Promise<DeployResult> {
  const key = getCredential('ONEINCH_API_KEY');
  if (!key) {
    updateComponent('oneinch', { status: 'CREDENTIAL_REQUIRED' });
    return { success: false, detail: 'No 1inch API key configured' };
  }
  const result = await testCredential({ id: 'ONEINCH_API_KEY', key: 'ONEINCH_API_KEY', label: '1inch', category: 'api', masked: '', configured: true, lastTested: null, testResult: 'untested', testDetail: '' });
  if (result.pass) {
    updateComponent('oneinch', { status: 'VERIFIED', lastVerified: Date.now() });
  } else {
    updateComponent('oneinch', { status: 'FAILED', lastError: result.detail });
  }
  return { success: result.pass, detail: result.detail };
}

// ── Backend Verification (external) ──────────────────────────

function verifyWs(): DeployResult {
  // Can't verify from frontend — external deployment required
  updateComponent('ws-gateway', { status: 'EXTERNAL_DEPLOYMENT_REQUIRED' });
  return { success: false, detail: 'WebSocket server requires external deployment. Deploy backend/ to a server and configure VITE_WS_URL.' };
}

function verifyApi(): DeployResult {
  updateComponent('market-api', { status: 'EXTERNAL_DEPLOYMENT_REQUIRED' });
  return { success: false, detail: 'Market API requires external deployment. Deploy backend/ and configure DNS.' };
}

// ── Deploy All Workflow ──────────────────────────────────────

export interface DeployStep {
  id: string;
  label: string;
  action: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  result: string;
}

export async function deployAll(): Promise<DeployStep[]> {
  const steps: DeployStep[] = [
    { id: 'rpc-bnb', label: 'Test BNB RPC', action: 'test-rpc-bnb', status: 'pending', result: '' },
    { id: 'rpc-base', label: 'Test Base RPC', action: 'test-rpc-base', status: 'pending', result: '' },
    { id: 'rpc-solana', label: 'Test Solana RPC', action: 'test-rpc-solana', status: 'pending', result: '' },
    { id: 'rpc-robinhood', label: 'Test Robinhood RPC', action: 'test-rpc-robinhood', status: 'pending', result: '' },
    { id: 'db-init', label: 'Initialize Market DB', action: 'init-market-db', status: 'pending', result: '' },
    { id: '1inch-verify', label: 'Verify 1inch API', action: 'verify-1inch', status: 'pending', result: '' },
    { id: 'evm-start', label: 'Start EVM Indexer', action: 'start-evm-indexer', status: 'pending', result: '' },
    { id: 'solana-start', label: 'Start Solana Indexer', action: 'start-solana-indexer', status: 'pending', result: '' },
    { id: 'ws-check', label: 'Check WebSocket', action: 'verify-ws', status: 'pending', result: '' },
  ];

  for (const step of steps) {
    step.status = 'running';
    const result = await executeDeployAction(step.action);
    step.status = result.success ? 'success' : 'failure';
    step.result = result.detail;
  }

  return steps;
}