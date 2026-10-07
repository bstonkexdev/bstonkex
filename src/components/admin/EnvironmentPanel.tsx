// BSTONKEX Admin Environment Configuration Panel
// Shows environment variable status without exposing actual values
import { useState } from 'react';

interface EnvVar {
  key: string;
  name: string;
  category: string;
  required: boolean;
  sensitive: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  { key: 'VITE_WS_URL', name: 'WebSocket URL', category: 'WebSocket', required: true, sensitive: false, description: 'wss://api.bstonkex.xyz/ws' },
  { key: 'VITE_RH_RPC_PRIMARY', name: 'Robinhood RPC', category: 'RPC', required: true, sensitive: true, description: 'Authenticated Robinhood Chain 4663 endpoint' },
  { key: 'VITE_BNB_RPC_PRIMARY', name: 'BNB RPC', category: 'RPC', required: false, sensitive: false, description: 'Default: bsc-dataseed1.binance.org' },
  { key: 'VITE_BASE_RPC_PRIMARY', name: 'Base RPC', category: 'RPC', required: false, sensitive: false, description: 'Default: mainnet.base.org' },
  { key: 'VITE_SOL_RPC_PRIMARY', name: 'Solana RPC', category: 'RPC', required: false, sensitive: false, description: 'Default: api.mainnet-beta.solana.com' },
  { key: 'VITE_1INCH_API_KEY', name: '1inch API Key', category: 'API', required: false, sensitive: true, description: 'For EVM swap routing' },
  { key: 'ROBINHOOD_RPC_API_KEY', name: 'Robinhood API Key', category: 'Backend', required: true, sensitive: true, description: 'Server-side only — never expose to frontend' },
];

export default function EnvironmentPanel() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const getVarStatus = (envVar: EnvVar): { configured: boolean; value?: string } => {
    // For VITE_ vars, check import.meta.env
    if (envVar.key.startsWith('VITE_')) {
      try {
        const value = (import.meta as any).env?.[envVar.key];
        return { configured: !!value, value: envVar.sensitive ? undefined : value };
      } catch {
        return { configured: false };
      }
    }
    // Backend vars — cannot check from frontend
    return { configured: false };
  };

  const categories = [...new Set(ENV_VARS.map(v => v.category))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
        ENVIRONMENT CONFIGURATION
      </span>

      <div style={{
        padding: 6, borderRadius: 3, fontSize: 7, color: 'var(--amber)',
        background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)',
      }}>
        ⚠ Secrets are NEVER displayed after configuration. Set via .env file or deployment platform.
      </div>

      {categories.map(cat => {
        const vars = ENV_VARS.filter(v => v.category === cat);
        const isExpanded = expanded === cat;
        
        return (
          <div key={cat} style={{ border: '1px solid var(--border)', borderRadius: 4 }}>
            <button
              onClick={() => setExpanded(isExpanded ? null : cat)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-bright)', fontSize: 8, fontWeight: 900,
                letterSpacing: '0.05em', textAlign: 'left',
              }}
            >
              <span>◈</span>
              <span>{cat}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 7 }}>
                {vars.filter(v => getVarStatus(v).configured).length}/{vars.length}
              </span>
            </button>
            
            {isExpanded && (
              <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {vars.map(envVar => {
                  const status = getVarStatus(envVar);
                  return (
                    <div key={envVar.key} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{
                        color: status.configured ? 'var(--green)' : (envVar.required ? 'var(--red)' : 'var(--amber)'),
                        fontSize: 9, minWidth: 12, textAlign: 'center',
                      }}>
                        {status.configured ? '✓' : (envVar.required ? '✗' : '○')}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-bright)' }}>
                          {envVar.name}
                          {envVar.required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
                          {envVar.sensitive && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>🔒</span>}
                        </div>
                        <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>{envVar.description}</div>
                        {status.configured && !envVar.sensitive && status.value && (
                          <div style={{ fontSize: 7, color: 'var(--green)', marginTop: 2 }}>
                            Value: {status.value.length > 40 ? status.value.slice(0, 40) + '...' : status.value}
                          </div>
                        )}
                        {!status.configured && (
                          <div style={{ fontSize: 7, color: 'var(--amber)', marginTop: 2 }}>
                            Set {envVar.key} in .env file
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
                        color: status.configured ? 'var(--green)' : (envVar.required ? 'var(--red)' : 'var(--amber)'),
                      }}>
                        {status.configured ? 'SET' : (envVar.required ? 'REQUIRED' : 'OPTIONAL')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}