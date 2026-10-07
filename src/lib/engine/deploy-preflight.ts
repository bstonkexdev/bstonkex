// BSTONKEX Deployment Preflight — checks all requirements before deployment
import type { ChainId } from '../config';
import { CHAINS, CONFIGURED_CHAINS } from '../config';
import { isSandboxed } from './sandbox';

export type CheckStatus = 'READY' | 'MISSING' | 'BLOCKED' | 'ERROR' | 'CHECKING';
export type CheckCategory = 'runtime' | 'environment' | 'rpc' | 'backend' | 'domain' | 'wallet' | 'security';

export interface PreflightCheck {
  id: string;
  category: CheckCategory;
  name: string;
  status: CheckStatus;
  detail: string;
  required: boolean;
  action?: string;
}

export interface PreflightReport {
  checks: PreflightCheck[];
  readyCount: number;
  missingCount: number;
  blockedCount: number;
  errorCount: number;
  canDeploy: boolean;
  blockers: string[];
  timestamp: number;
}

// ── Individual Checks ────────────────────────────────────────

async function checkRuntime(): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  
  // Node/Bun runtime
  checks.push({
    id: 'runtime.node',
    category: 'runtime',
    name: 'Node.js / Bun Runtime',
    status: typeof window !== 'undefined' ? 'READY' : 'MISSING',
    detail: typeof window !== 'undefined' ? 'Browser environment detected' : 'Server runtime required',
    required: false,
    action: 'Deploy backend to Node.js 18+ or Bun 1.0+ server',
  });

  // Sandbox detection
  checks.push({
    id: 'runtime.sandbox',
    category: 'runtime',
    name: 'Production Environment',
    status: isSandboxed() ? 'BLOCKED' : 'READY',
    detail: isSandboxed() ? 'Running in preview sandbox — external network blocked' : 'Running in production-capable environment',
    required: false,
    action: isSandboxed() ? 'Deploy to production environment outside sandbox' : undefined,
  });

  return checks;
}

async function checkEnvironment(): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  
  const envVars = [
    { key: 'VITE_WS_URL', name: 'WebSocket URL', required: true },
    { key: 'VITE_RH_RPC_PRIMARY', name: 'Robinhood RPC', required: true },
    { key: 'VITE_1INCH_API_KEY', name: '1inch API Key', required: false },
  ];

  for (const env of envVars) {
    let value: string | undefined;
    try { value = (import.meta as any).env?.[env.key]; } catch { value = undefined; }
    
    checks.push({
      id: `env.${env.key}`,
      category: 'environment',
      name: env.name,
      status: value ? 'READY' : (env.required ? 'MISSING' : 'BLOCKED'),
      detail: value ? 'Configured' : `Set ${env.key} in .env`,
      required: env.required,
      action: !value ? `Add ${env.key} to .env file` : undefined,
    });
  }

  return checks;
}

async function checkRpc(): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  
  for (const chain of CONFIGURED_CHAINS) {
    const start = Date.now();
    try {
      const method = chain.isEvm ? 'eth_blockNumber' : 'getSlot';
      const res = await fetch(chain.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params: [], id: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      const latencyMs = Date.now() - start;
      
      if (data.result) {
        const block = chain.isEvm ? parseInt(data.result, 16) : data.result;
        checks.push({
          id: `rpc.${chain.id}`,
          category: 'rpc',
          name: `${chain.name} RPC`,
          status: 'READY',
          detail: `Block #${block.toLocaleString()} · ${latencyMs}ms`,
          required: true,
        });
      } else {
        checks.push({
          id: `rpc.${chain.id}`,
          category: 'rpc',
          name: `${chain.name} RPC`,
          status: 'ERROR',
          detail: `Invalid response: ${JSON.stringify(data.error || data)}`,
          required: true,
          action: chain.id === 'robinhood' ? 'Set VITE_RH_RPC_PRIMARY with authenticated endpoint' : 'Check RPC endpoint',
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown';
      const isRobinhoodBlocked = chain.id === 'robinhood' && (msg.includes('403') || msg.includes('API key'));
      
      checks.push({
        id: `rpc.${chain.id}`,
        category: 'rpc',
        name: `${chain.name} RPC`,
        status: isRobinhoodBlocked ? 'BLOCKED' : 'ERROR',
        detail: isRobinhoodBlocked ? 'API key required — all public endpoints return 403' : `Unreachable: ${msg}`,
        required: true,
        action: isRobinhoodBlocked ? 'Obtain Robinhood Chain API key and set VITE_RH_RPC_PRIMARY' : 'Check RPC endpoint availability',
      });
    }
  }
  
  return checks;
}

async function checkBackend(): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  
  // Check if backend health endpoint is accessible
  const healthUrl = 'https://api.bstonkex.xyz/health';
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    checks.push({
      id: 'backend.health',
      category: 'backend',
      name: 'Backend Health',
      status: data.status === 'UP' ? 'READY' : data.status === 'DEGRADED' ? 'BLOCKED' : 'ERROR',
      detail: `Status: ${data.status} · Uptime: ${data.uptime}s`,
      required: true,
    });
  } catch {
    checks.push({
      id: 'backend.health',
      category: 'backend',
      name: 'Backend Health',
      status: 'MISSING',
      detail: 'Backend not deployed or not accessible',
      required: true,
      action: 'Deploy backend/ package to production server',
    });
  }

  // WebSocket check
  try {
    const wsRes = await fetch('https://api.bstonkex.xyz/ws/health', { signal: AbortSignal.timeout(5000) });
    const wsData = await wsRes.json();
    checks.push({
      id: 'backend.websocket',
      category: 'backend',
      name: 'WebSocket Server',
      status: wsData.status === 'UP' ? 'READY' : 'BLOCKED',
      detail: `Connections: ${wsData.connections}/${wsData.maxConnections} · Utilization: ${wsData.utilization}%`,
      required: true,
    });
  } catch {
    checks.push({
      id: 'backend.websocket',
      category: 'backend',
      name: 'WebSocket Server',
      status: 'MISSING',
      detail: 'WebSocket server not deployed',
      required: true,
      action: 'Deploy backend WebSocket gateway',
    });
  }

  return checks;
}

async function checkDomain(): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  
  // DNS/HTTPS check
  try {
    const res = await fetch('https://api.bstonkex.xyz/health', { signal: AbortSignal.timeout(5000) });
    checks.push({
      id: 'domain.dns',
      category: 'domain',
      name: 'DNS Resolution',
      status: 'READY',
      detail: 'api.bstonkex.xyz resolves correctly',
      required: true,
    });
    checks.push({
      id: 'domain.tls',
      category: 'domain',
      name: 'TLS Certificate',
      status: res.ok ? 'READY' : 'ERROR',
      detail: res.ok ? 'HTTPS connection successful' : `HTTP ${res.status}`,
      required: true,
    });
  } catch {
    checks.push({
      id: 'domain.dns',
      category: 'domain',
      name: 'DNS Resolution',
      status: 'MISSING',
      detail: 'api.bstonkex.xyz not reachable',
      required: true,
      action: 'Configure DNS A/CNAME record for api.bstonkex.xyz',
    });
    checks.push({
      id: 'domain.tls',
      category: 'domain',
      name: 'TLS Certificate',
      status: 'MISSING',
      detail: 'Cannot verify — DNS not configured',
      required: true,
      action: 'Provision TLS certificate after DNS is configured',
    });
  }

  return checks;
}

async function checkWallet(): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  
  // Check if wallet is available (MetaMask/Phantom)
  const hasEvm = typeof window !== 'undefined' && !!(window as any).ethereum;
  const hasSolana = typeof window !== 'undefined' && !!(window as any).solana;
  
  checks.push({
    id: 'wallet.evm',
    category: 'wallet',
    name: 'EVM Wallet',
    status: hasEvm ? 'READY' : 'MISSING',
    detail: hasEvm ? 'MetaMask/OKX Wallet detected' : 'No EVM wallet browser extension',
    required: false,
    action: !hasEvm ? 'Install MetaMask or OKX Wallet' : undefined,
  });
  
  checks.push({
    id: 'wallet.solana',
    category: 'wallet',
    name: 'Solana Wallet',
    status: hasSolana ? 'READY' : 'MISSING',
    detail: hasSolana ? 'Phantom/Solflare detected' : 'No Solana wallet browser extension',
    required: false,
    action: !hasSolana ? 'Install Phantom or Solflare' : undefined,
  });

  return checks;
}

// ── Full Preflight ───────────────────────────────────────────

export async function runPreflight(): Promise<PreflightReport> {
  const allChecks: PreflightCheck[] = [];
  
  // Run all checks in parallel
  const [runtime, env, rpc, backend, domain, wallet] = await Promise.all([
    checkRuntime(),
    checkEnvironment(),
    checkRpc(),
    checkBackend(),
    checkDomain(),
    checkWallet(),
  ]);
  
  allChecks.push(...runtime, ...env, ...rpc, ...backend, ...domain, ...wallet);
  
  const readyCount = allChecks.filter(c => c.status === 'READY').length;
  const missingCount = allChecks.filter(c => c.status === 'MISSING').length;
  const blockedCount = allChecks.filter(c => c.status === 'BLOCKED').length;
  const errorCount = allChecks.filter(c => c.status === 'ERROR').length;
  
  // Can deploy only if all REQUIRED checks are READY
  const requiredChecks = allChecks.filter(c => c.required);
  const canDeploy = requiredChecks.every(c => c.status === 'READY');
  
  const blockers = allChecks
    .filter(c => c.required && c.status !== 'READY')
    .map(c => `${c.name}: ${c.detail}`);
  
  return {
    checks: allChecks,
    readyCount,
    missingCount,
    blockedCount,
    errorCount,
    canDeploy,
    blockers,
    timestamp: Date.now(),
  };
}

// ── Helpers ──────────────────────────────────────────────────

export function statusColor(status: CheckStatus): string {
  switch (status) {
    case 'READY': return 'var(--green)';
    case 'MISSING': return 'var(--amber)';
    case 'BLOCKED': return 'var(--text-muted)';
    case 'ERROR': return 'var(--red)';
    case 'CHECKING': return 'var(--cyan)';
  }
}

export function statusIcon(status: CheckStatus): string {
  switch (status) {
    case 'READY': return '✓';
    case 'MISSING': return '○';
    case 'BLOCKED': return '⊘';
    case 'ERROR': return '✗';
    case 'CHECKING': return '◌';
  }
}