// BSTONKEX Credential Store — secure credential management via Gitlawb
// Credentials are NEVER exposed in plain text after storage.
// Only masked versions are returned for display.

import { gitlawb } from '../gitlawb';

export interface CredentialEntry {
  id: string;
  key: string;        // e.g. 'ONEINCH_API_KEY', 'RH_RPC_PRIMARY'
  label: string;      // Human-readable name
  category: 'rpc' | 'api' | 'deploy';
  masked: string;     // First 4 + last 4 chars only
  configured: boolean;
  lastTested: number | null;
  testResult: 'pass' | 'fail' | 'untested';
  testDetail: string;
}

const credCollection = gitlawb.db.collection<{
  key: string;
  value: string;
  label: string;
  category: string;
  updatedAt: string;
}>('admin_credentials', { visibility: 'owner' });

// In-memory credential cache (decrypted values, never exposed to UI)
const credCache = new Map<string, string>();
let credListeners: (() => void)[] = [];

function emit() { credListeners.forEach(l => l()); }
export function onCredChange(cb: () => void) { credListeners.push(cb); return () => { credListeners = credListeners.filter(l => l !== cb); }; }

function maskValue(val: string): string {
  if (!val || val.length < 8) return val ? '••••••••' : '';
  return val.slice(0, 4) + '•'.repeat(Math.min(val.length - 8, 20)) + val.slice(-4);
}

// ── Credential Operations ────────────────────────────────────

export async function saveCredential(key: string, value: string, label: string, category: CredentialEntry['category']): Promise<void> {
  credCache.set(key, value);
  try {
    const { records } = await credCollection.list({ limit: 100 });
    const existing = records.find(r => r.data.key === key);
    if (existing) {
      await credCollection.update(existing.id, { value, label, category, updatedAt: new Date().toISOString() });
    } else {
      await credCollection.create({ key, value, label, category, updatedAt: new Date().toISOString() });
    }
  } catch { /* non-critical */ }
  // Also try env vars
  try { (import.meta as any).env[`VITE_${key}`] = value; } catch { /* expected — env is read-only */ }
  emit();
}

export async function loadCredentials(): Promise<CredentialEntry[]> {
  const entries: CredentialEntry[] = [];
  const keys = [
    { key: 'ONEINCH_API_KEY', label: '1inch API Key', category: 'api' as const },
    { key: 'RH_RPC_PRIMARY', label: 'Robinhood RPC Primary', category: 'rpc' as const },
    { key: 'BSC_RPC_URL', label: 'BSC RPC URL', category: 'rpc' as const },
    { key: 'BASE_RPC_URL', label: 'Base RPC URL', category: 'rpc' as const },
    { key: 'SOLANA_RPC_URL', label: 'Solana RPC URL', category: 'rpc' as const },
    { key: 'WS_URL', label: 'WebSocket Server URL', category: 'deploy' as const },
  ];

  for (const def of keys) {
    // Check cache first, then env, then Gitlawb
    let value = credCache.get(def.key);
    if (!value) {
      try { value = (import.meta as any).env?.[`VITE_${def.key}`]; } catch { /* ignore */ }
    }
    if (!value) {
      try {
        const { records } = await credCollection.list({ limit: 100 });
        const found = records.find(r => r.data.key === def.key);
        if (found) {
          value = found.data.value;
          if (value) credCache.set(def.key, value);
        }
      } catch { /* ignore */ }
    }

    entries.push({
      id: def.key,
      key: def.key,
      label: def.label,
      category: def.category,
      masked: value ? maskValue(value) : '',
      configured: !!value,
      lastTested: null,
      testResult: value ? 'untested' : 'untested',
      testDetail: value ? 'Key configured — test to verify' : 'Not configured',
    });
  }

  return entries;
}

export function getCredential(key: string): string | null {
  // Check in-memory cache
  if (credCache.has(key)) return credCache.get(key)!;
  // Check env
  try {
    const val = (import.meta as any).env?.[`VITE_${key}`];
    if (val) { credCache.set(key, val); return val; }
  } catch { /* ignore */ }
  return null;
}

// ── Credential Testing ───────────────────────────────────────

export async function testCredential(entry: CredentialEntry): Promise<{ pass: boolean; detail: string }> {
  const value = getCredential(entry.key);
  if (!value) return { pass: false, detail: 'Not configured' };

  switch (entry.key) {
    case 'ONEINCH_API_KEY': {
      try {
        const res = await fetch('https://api.1inch.dev/swap/v6.0/56/quote?src=0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c&dst=0x55d398326f99059fF775485246999027B3197955&amount=1000000000000000000', {
          headers: { 'Authorization': `Bearer ${value}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) return { pass: true, detail: 'API key valid — quotes available' };
        if (res.status === 401) return { pass: false, detail: 'Invalid API key (401 Unauthorized)' };
        if (res.status === 429) return { pass: false, detail: 'Rate limited (429) — key may work but limits reached' };
        return { pass: false, detail: `HTTP ${res.status}` };
      } catch (e: any) { return { pass: false, detail: `Network error: ${e.message}` }; }
    }
    case 'RH_RPC_PRIMARY':
    case 'BSC_RPC_URL':
    case 'BASE_RPC_URL':
    case 'SOLANA_RPC_URL': {
      const isSolana = entry.key === 'SOLANA_RPC_URL';
      try {
        const res = await fetch(value, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: isSolana ? 'getSlot' : 'eth_blockNumber', params: [] }),
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        if (data.result) {
          const block = isSolana ? data.result : parseInt(data.result, 16);
          return { pass: true, detail: `Connected — block ${block}` };
        }
        return { pass: false, detail: `RPC error: ${data.error?.message || 'unknown'}` };
      } catch (e: any) { return { pass: false, detail: `Unreachable: ${e.message}` }; }
    }
    case 'WS_URL': {
      return { pass: false, detail: 'WebSocket test requires external server deployment' };
    }
    default:
      return { pass: false, detail: 'No test available for this credential' };
  }
}