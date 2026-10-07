// BSTONKEX Infrastructure State — Central registry for all production components
// Tracks status, version, dependencies, deploy/verify actions, logs per component.

export type ComponentStatus =
  | 'NOT_BUILT'
  | 'READY_TO_BUILD'
  | 'READY_TO_DEPLOY'
  | 'DEPLOYING'
  | 'DEPLOYED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'BLOCKED'
  | 'CREDENTIAL_REQUIRED'
  | 'EXTERNAL_DEPLOYMENT_REQUIRED'
  | 'FAILED'
  | 'OFFLINE';

export interface InfraComponent {
  id: string;
  name: string;
  category: 'core' | 'chain' | 'backend' | 'data' | 'credential' | 'security';
  status: ComponentStatus;
  version: string;
  dependencies: string[];
  configStatus: 'configured' | 'partial' | 'missing';
  description: string;
  deployAction: string | null;
  verifyAction: string | null;
  healthEndpoint: string | null;
  lastDeployment: number | null;
  lastVerified: number | null;
  lastError: string | null;
  logs: InfraLog[];
  externalRequirement: string | null;
}

export interface InfraLog {
  id: string;
  timestamp: number;
  component: string;
  action: string;
  status: 'success' | 'failure' | 'info' | 'warning';
  detail: string;
  txId: string | null;
}

type InfraListener = (components: InfraComponent[]) => void;

// ── Component Registry ─────────────────────────────────────

const components = new Map<string, InfraComponent>();
const listeners: InfraListener[] = [];
const deploymentLogs: InfraLog[] = [];
const MAX_LOGS = 500;

function emit() {
  const list = Array.from(components.values());
  listeners.forEach(l => l(list));
}

export function onInfraChange(cb: InfraListener): () => void {
  listeners.push(cb);
  return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
}

export function getComponents(): InfraComponent[] {
  return Array.from(components.values());
}

export function getComponent(id: string): InfraComponent | undefined {
  return components.get(id);
}

export function updateComponent(id: string, patch: Partial<InfraComponent>) {
  const existing = components.get(id);
  if (!existing) return;
  Object.assign(existing, patch);
  emit();
}

export function addLog(log: InfraLog) {
  deploymentLogs.unshift(log);
  if (deploymentLogs.length > MAX_LOGS) deploymentLogs.length = MAX_LOGS;
  const comp = components.get(log.component);
  if (comp) {
    comp.logs.unshift(log);
    if (comp.logs.length > 50) comp.logs.length = 50;
  }
  emit();
}

export function getLogs(limit = 100): InfraLog[] {
  return deploymentLogs.slice(0, limit);
}

export function makeLog(
  component: string, action: string,
  status: InfraLog['status'], detail: string, txId?: string
): InfraLog {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    component, action, status, detail,
    txId: txId || null,
  };
}

// ── Default Components ──────────────────────────────────────

const DEFAULT_COMPONENTS: InfraComponent[] = [
  {
    id: 'ws-gateway',
    name: 'WebSocket Gateway',
    category: 'backend',
    status: 'EXTERNAL_DEPLOYMENT_REQUIRED',
    version: '1.0.0',
    dependencies: ['rpc-manager'],
    configStatus: 'partial',
    description: 'Real-time WebSocket server for market data, trades, and portfolio updates',
    deployAction: 'deploy-ws',
    verifyAction: 'verify-ws',
    healthEndpoint: '/ws/health',
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: 'Deploy backend/ to Railway, Fly.io, or render.com. Set WS_URL in .env.',
  },
  {
    id: 'market-api',
    name: 'Market API Server',
    category: 'backend',
    status: 'EXTERNAL_DEPLOYMENT_REQUIRED',
    version: '1.0.0',
    dependencies: ['rpc-manager'],
    configStatus: 'partial',
    description: 'REST API for market data, search, and historical queries',
    deployAction: 'deploy-api',
    verifyAction: 'verify-api',
    healthEndpoint: '/health',
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: 'Deploy backend/ with HTTP endpoints. Configure CORS and DNS.',
  },
  {
    id: 'evm-indexer',
    name: 'EVM Event Indexer',
    category: 'data',
    status: 'NOT_BUILT',
    version: '1.0.0',
    dependencies: ['rpc-manager'],
    configStatus: 'configured',
    description: 'Indexes Uniswap V2/V3 Swap events from BNB, Base, Robinhood chains',
    deployAction: 'start-evm-indexer',
    verifyAction: 'verify-evm-indexer',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'solana-indexer',
    name: 'Solana Trade Indexer',
    category: 'data',
    status: 'NOT_BUILT',
    version: '1.0.0',
    dependencies: ['rpc-manager'],
    configStatus: 'configured',
    description: 'Indexes Solana DEX trades via Jupiter/Raydium transaction parsing',
    deployAction: 'start-solana-indexer',
    verifyAction: 'verify-solana-indexer',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'market-db',
    name: 'Market Data Store',
    category: 'data',
    status: 'NOT_BUILT',
    version: '1.0.0',
    dependencies: [],
    configStatus: 'configured',
    description: 'Persistent storage for tokens, pairs, trades, candles via Gitlawb SDK',
    deployAction: 'init-market-db',
    verifyAction: 'verify-market-db',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'candle-engine',
    name: 'Candle Engine',
    category: 'data',
    status: 'NOT_BUILT',
    version: '1.0.0',
    dependencies: ['evm-indexer', 'solana-indexer', 'market-db'],
    configStatus: 'configured',
    description: 'Generates OHLCV candles from real indexed trade events, persists to store',
    deployAction: 'start-candle-engine',
    verifyAction: 'verify-candle-engine',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'rpc-bnb',
    name: 'BNB Chain RPC',
    category: 'chain',
    status: 'READY_TO_DEPLOY',
    version: '1.0.0',
    dependencies: [],
    configStatus: 'configured',
    description: 'BNB Smart Chain JSON-RPC (public Binance nodes)',
    deployAction: 'test-rpc-bnb',
    verifyAction: 'verify-rpc-bnb',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'rpc-base',
    name: 'Base RPC',
    category: 'chain',
    status: 'READY_TO_DEPLOY',
    version: '1.0.0',
    dependencies: [],
    configStatus: 'configured',
    description: 'Base L2 JSON-RPC (public endpoint)',
    deployAction: 'test-rpc-base',
    verifyAction: 'verify-rpc-base',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'rpc-solana',
    name: 'Solana RPC',
    category: 'chain',
    status: 'READY_TO_DEPLOY',
    version: '1.0.0',
    dependencies: [],
    configStatus: 'configured',
    description: 'Solana mainnet-beta JSON-RPC (public endpoint)',
    deployAction: 'test-rpc-solana',
    verifyAction: 'verify-rpc-solana',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'rpc-robinhood',
    name: 'Robinhood Chain RPC',
    category: 'chain',
    status: 'CREDENTIAL_REQUIRED',
    version: '1.0.0',
    dependencies: [],
    configStatus: 'missing',
    description: 'Robinhood Chain (4663) JSON-RPC — requires authenticated endpoint',
    deployAction: 'test-rpc-robinhood',
    verifyAction: 'verify-rpc-robinhood',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: 'Set VITE_RH_RPC_PRIMARY in .env with authenticated Robinhood RPC endpoint (Alchemy/Ankr).',
  },
  {
    id: 'oneinch',
    name: '1inch Aggregator',
    category: 'credential',
    status: 'CREDENTIAL_REQUIRED',
    version: '6.0',
    dependencies: [],
    configStatus: 'missing',
    description: '1inch swap API for EVM chain quote and transaction building',
    deployAction: 'configure-1inch',
    verifyAction: 'verify-1inch',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: 'Get 1inch API key from portal.1inch.io. Set VITE_1INCH_API_KEY in .env.',
  },
  {
    id: 'holder-indexer',
    name: 'Holder Tracking',
    category: 'data',
    status: 'NOT_BUILT',
    version: '1.0.0',
    dependencies: ['evm-indexer', 'solana-indexer'],
    configStatus: 'configured',
    description: 'Tracks token holder balances from Transfer events',
    deployAction: 'start-holder-indexer',
    verifyAction: 'verify-holder-indexer',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: null,
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'security-engine',
    name: 'Security Engine',
    category: 'security',
    status: 'VERIFIED',
    version: '1.0.0',
    dependencies: [],
    configStatus: 'configured',
    description: 'Token safety scoring, honeypot detection, contract analysis',
    deployAction: null,
    verifyAction: 'verify-security',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: Date.now(),
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
  {
    id: 'fee-engine',
    name: 'Fee Engine',
    category: 'core',
    status: 'VERIFIED',
    version: '1.0.0',
    dependencies: [],
    configStatus: 'configured',
    description: '0.40% platform fee with 4-tier referral system',
    deployAction: null,
    verifyAction: 'verify-fee-engine',
    healthEndpoint: null,
    lastDeployment: null,
    lastVerified: Date.now(),
    lastError: null,
    logs: [],
    externalRequirement: null,
  },
];

// ── Initialize ──────────────────────────────────────────────

export function initInfraState() {
  for (const c of DEFAULT_COMPONENTS) {
    components.set(c.id, { ...c });
  }
  emit();
}

// ── Aggregate Stats ─────────────────────────────────────────

export function getInfraStats() {
  const all = Array.from(components.values());
  return {
    total: all.length,
    verified: all.filter(c => c.status === 'VERIFIED').length,
    deployed: all.filter(c => c.status === 'DEPLOYED').length,
    ready: all.filter(c => c.status === 'READY_TO_DEPLOY' || c.status === 'READY_TO_BUILD').length,
    blocked: all.filter(c => c.status === 'BLOCKED' || c.status === 'CREDENTIAL_REQUIRED').length,
    external: all.filter(c => c.status === 'EXTERNAL_DEPLOYMENT_REQUIRED').length,
    failed: all.filter(c => c.status === 'FAILED').length,
    notBuilt: all.filter(c => c.status === 'NOT_BUILT').length,
  };
}

export function statusColor(status: ComponentStatus): string {
  switch (status) {
    case 'VERIFIED': return 'var(--green)';
    case 'DEPLOYED': return '#00cc88';
    case 'READY_TO_DEPLOY': case 'READY_TO_BUILD': return 'var(--cyan)';
    case 'DEPLOYING': case 'VERIFYING': return 'var(--amber)';
    case 'CREDENTIAL_REQUIRED': return 'var(--amber)';
    case 'EXTERNAL_DEPLOYMENT_REQUIRED': return '#aa66ff';
    case 'BLOCKED': return 'var(--text-muted)';
    case 'FAILED': return 'var(--red)';
    case 'OFFLINE': return 'var(--red)';
    case 'NOT_BUILT': return 'var(--text-dim)';
    default: return 'var(--text-muted)';
  }
}

export function statusLabel(status: ComponentStatus): string {
  switch (status) {
    case 'NOT_BUILT': return 'NOT BUILT';
    case 'READY_TO_BUILD': return 'READY TO BUILD';
    case 'READY_TO_DEPLOY': return 'READY TO DEPLOY';
    case 'DEPLOYING': return 'DEPLOYING...';
    case 'DEPLOYED': return 'DEPLOYED';
    case 'VERIFYING': return 'VERIFYING...';
    case 'VERIFIED': return 'VERIFIED';
    case 'BLOCKED': return 'BLOCKED';
    case 'CREDENTIAL_REQUIRED': return 'CREDENTIAL REQUIRED';
    case 'EXTERNAL_DEPLOYMENT_REQUIRED': return 'EXTERNAL DEPLOY REQUIRED';
    case 'FAILED': return 'FAILED';
    case 'OFFLINE': return 'OFFLINE';
  }
}