// Cupcak8 Swap — Credential Policy
//
// Vite bundles ALL VITE_* variables into the client-side JavaScript.
// Anything in a VITE_ variable is PUBLIC and visible to every visitor.
//
// CLASSIFICATION:
//
// PUBLIC (safe in VITE_ / client-side):
//   - Public RPC endpoints (bsc-dataseed1.binance.org, mainnet.base.org, etc.)
//   - DexScreener API (no key required)
//   - GeckoTerminal API (no key required)
//   - Jupiter Price API (no key required)
//   - Bags API (no key required)
//   - Chain IDs, factory addresses, event topics
//
// SERVER-ONLY (must NOT use VITE_ prefix):
//   - 1inch API key (VITE_1INCH_API_KEY is currently public — needs migration)
//   - Alchemy/Infura/QuickNode RPC keys with private endpoints
//   - BscScan/BaseScan API keys
//   - Any authenticated webhook URLs
//   - Admin authentication keys
//
// CURRENT STATE (Honest assessment):
//   - All configured RPC endpoints are PUBLIC (no keys embedded in URLs)
//   - DexScreener, GeckoTerminal, Jupiter, Bags are all keyless
//   - VITE_1INCH_API_KEY exists in .env.example but is empty by default
//   - If a user configures VITE_1INCH_API_KEY, it WILL be exposed to clients
//
// RECOMMENDED MIGRATION PATH (requires deployed backend):
//   1. Backend proxies all authenticated API calls (1inch, Alchemy, BscScan)
//   2. Frontend calls backend endpoints, never external APIs directly
//   3. Private keys live in server-only env vars (no VITE_ prefix)
//
// FOR NOW (browser-only mode):
//   - Only public/keyless endpoints are used by the discovery pipeline
//   - VITE_1INCH_API_KEY is documented as "public if set" in .env.example
//   - No private keys are required for discovery or enrichment

export interface CredentialEntry {
  name: string;
  classification: 'public' | 'server-only';
  usedBy: string;
  currentExposure: 'client' | 'server' | 'none';
  risk: 'none' | 'low' | 'high';
  notes: string;
}

export const CREDENTIAL_INVENTORY: CredentialEntry[] = [
  {
    name: 'VITE_BNB_RPC_PRIMARY',
    classification: 'public',
    usedBy: 'EVM discovery (eth_getLogs), price feeds',
    currentExposure: 'client',
    risk: 'none',
    notes: 'Public BSC dataseed — no auth in URL',
  },
  {
    name: 'VITE_BASE_RPC_PRIMARY',
    classification: 'public',
    usedBy: 'OpenLaunch discovery (Base), price feeds',
    currentExposure: 'client',
    risk: 'none',
    notes: 'Public Base RPC — no auth in URL',
  },
  {
    name: 'VITE_RH_RPC_PRIMARY',
    classification: 'public',
    usedBy: 'OpenLaunch discovery (Robinhood)',
    currentExposure: 'client',
    risk: 'none',
    notes: 'Public Robinhood RPC — no auth in URL',
  },
  {
    name: 'VITE_SOL_RPC_PRIMARY',
    classification: 'public',
    usedBy: 'Pump.fun program scanning',
    currentExposure: 'client',
    risk: 'none',
    notes: 'Public Solana RPC — rate-limited but keyless',
  },
  {
    name: 'VITE_1INCH_API_KEY',
    classification: 'server-only',
    usedBy: 'Swap routing (1inch API)',
    currentExposure: 'client',
    risk: 'high',
    notes: 'EXPOSED if set — VITE_ prefix means client-visible. Empty by default. Migrate to server proxy.',
  },
  {
    name: 'DexScreener API',
    classification: 'public',
    usedBy: 'Market enrichment, token search',
    currentExposure: 'client',
    risk: 'none',
    notes: 'No key required — 300 req/min rate limit',
  },
  {
    name: 'GeckoTerminal API',
    classification: 'public',
    usedBy: 'Pool/OHLCV enrichment fallback',
    currentExposure: 'client',
    risk: 'none',
    notes: 'No key required — 30 req/min free tier',
  },
  {
    name: 'Jupiter Price API',
    classification: 'public',
    usedBy: 'Solana price enrichment',
    currentExposure: 'client',
    risk: 'none',
    notes: 'No key required for price quotes',
  },
  {
    name: 'Bags API',
    classification: 'public',
    usedBy: 'Solana launch discovery (Stonkfun, Pumpfun, etc.)',
    currentExposure: 'client',
    risk: 'none',
    notes: 'Public API — no authentication documented',
  },
];

/** Get credentials that are currently at risk (server-only but client-exposed). */
export function getExposedCredentials(): CredentialEntry[] {
  return CREDENTIAL_INVENTORY.filter(c => c.classification === 'server-only' && c.currentExposure === 'client');
}

/** Get summary for admin display. */
export function getCredentialSummary(): { total: number; public: number; serverOnly: number; atRisk: number } {
  const total = CREDENTIAL_INVENTORY.length;
  const publicCount = CREDENTIAL_INVENTORY.filter(c => c.classification === 'public').length;
  const serverOnly = CREDENTIAL_INVENTORY.filter(c => c.classification === 'server-only').length;
  const atRisk = getExposedCredentials().length;
  return { total, public: publicCount, serverOnly, atRisk };
}
