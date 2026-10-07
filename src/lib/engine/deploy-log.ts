// BSTONKEX Deployment Log — tracks deployment history and status
import type { ChainId } from '../config';

export type DeployStatus = 
  | 'PREPARING'
  | 'AWAITING_SIGNATURE'
  | 'DEPLOYING'
  | 'CONFIRMING'
  | 'VERIFYING'
  | 'SUCCESS'
  | 'FAILED'
  | 'BLOCKED';

export interface DeploymentRecord {
  id: string;
  version: string;
  timestamp: number;
  adminWallet: string;
  network: ChainId | 'all';
  deploymentId: string;
  txHash?: string;
  status: DeployStatus;
  gasUsed?: string;
  services: string[];
  error?: string;
  duration?: number;
}

export interface DeployState {
  current: DeploymentRecord | null;
  history: DeploymentRecord[];
  isDeploying: boolean;
}

// ── In-memory store (persists for session) ───────────────────

let deployments: DeploymentRecord[] = [];
let currentDeployment: DeploymentRecord | null = null;

// ── Public API ───────────────────────────────────────────────

export function getDeployments(): DeploymentRecord[] {
  return [...deployments].sort((a, b) => b.timestamp - a.timestamp);
}

export function getCurrentDeployment(): DeploymentRecord | null {
  return currentDeployment;
}

export function isDeploying(): boolean {
  return currentDeployment !== null && 
    !['SUCCESS', 'FAILED', 'BLOCKED'].includes(currentDeployment.status);
}

export function startDeployment(
  version: string,
  adminWallet: string,
  network: ChainId | 'all',
  services: string[]
): DeploymentRecord {
  const record: DeploymentRecord = {
    id: `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    version,
    timestamp: Date.now(),
    adminWallet,
    network,
    deploymentId: `bstonkex-${version}-${Date.now()}`,
    status: 'PREPARING',
    services,
  };
  
  currentDeployment = record;
  deployments.push(record);
  return record;
}

export function updateDeploymentStatus(
  deploymentId: string,
  status: DeployStatus,
  extras?: { txHash?: string; gasUsed?: string; error?: string; duration?: number }
): void {
  const record = deployments.find(d => d.id === deploymentId);
  if (record) {
    record.status = status;
    if (extras?.txHash) record.txHash = extras.txHash;
    if (extras?.gasUsed) record.gasUsed = extras.gasUsed;
    if (extras?.error) record.error = extras.error;
    if (extras?.duration) record.duration = extras.duration;
    
    if (['SUCCESS', 'FAILED', 'BLOCKED'].includes(status)) {
      if (currentDeployment?.id === deploymentId) {
        currentDeployment = null;
      }
    }
  }
}

export function getDeploymentById(id: string): DeploymentRecord | undefined {
  return deployments.find(d => d.id === id);
}

export function getLastSuccessfulDeployment(): DeploymentRecord | undefined {
  return deployments
    .filter(d => d.status === 'SUCCESS')
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

// ── Status Helpers ───────────────────────────────────────────

export function statusColor(status: DeployStatus): string {
  switch (status) {
    case 'PREPARING': return 'var(--cyan)';
    case 'AWAITING_SIGNATURE': return 'var(--amber)';
    case 'DEPLOYING': return 'var(--cyan)';
    case 'CONFIRMING': return 'var(--amber)';
    case 'VERIFYING': return 'var(--cyan)';
    case 'SUCCESS': return 'var(--green)';
    case 'FAILED': return 'var(--red)';
    case 'BLOCKED': return 'var(--text-muted)';
  }
}

export function statusIcon(status: DeployStatus): string {
  switch (status) {
    case 'PREPARING': return '◌';
    case 'AWAITING_SIGNATURE': return '✎';
    case 'DEPLOYING': return '⟳';
    case 'CONFIRMING': return '◌';
    case 'VERIFYING': return '◎';
    case 'SUCCESS': return '✓';
    case 'FAILED': return '✗';
    case 'BLOCKED': return '⊘';
  }
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}