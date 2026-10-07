// BSTONKEX External Setup Checklist — actionable list of external requirements
// Each item shows READY / MISSING / BLOCKED with exact action needed.
import { useState, useEffect } from 'react';

interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  status: 'READY' | 'MISSING' | 'BLOCKED';
  action: string;
  category: 'infrastructure' | 'credentials' | 'configuration';
}

export default function ExternalChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checking, setChecking] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    const results: ChecklistItem[] = [];

    // 1. Production backend/server
    let backendReady = false;
    try {
      const res = await fetch('https://api.bstonkex.xyz/health', { signal: AbortSignal.timeout(5000) });
      backendReady = res.ok;
    } catch { /* not deployed */ }
    results.push({
      id: 'backend',
      name: 'Production Backend/Server',
      description: 'Node.js 18+ or Bun 1.0+ server running backend/ package',
      status: backendReady ? 'READY' : 'MISSING',
      action: 'Deploy backend/ to a production server. See backend/DEPLOY.md for instructions.',
      category: 'infrastructure',
    });

    // 2. DNS
    let dnsReady = false;
    try {
      const res = await fetch('https://api.bstonkex.xyz/health', { signal: AbortSignal.timeout(5000) });
      dnsReady = res.ok;
    } catch { /* not configured */ }
    results.push({
      id: 'dns',
      name: 'api.bstonkex.xyz DNS',
      description: 'A/CNAME record pointing to production server',
      status: dnsReady ? 'READY' : 'MISSING',
      action: 'Configure DNS A or CNAME record for api.bstonkex.xyz pointing to your server IP.',
      category: 'infrastructure',
    });

    // 3. TLS certificate
    let tlsReady = false;
    try {
      const res = await fetch('https://api.bstonkex.xyz/health', { signal: AbortSignal.timeout(5000) });
      tlsReady = res.ok; // If HTTPS works, TLS is valid
    } catch { /* not available */ }
    results.push({
      id: 'tls',
      name: 'TLS Certificate',
      description: 'Valid SSL/TLS for HTTPS and WSS connections',
      status: tlsReady ? 'READY' : (dnsReady ? 'MISSING' : 'BLOCKED'),
      action: dnsReady
        ? 'Provision TLS certificate (Let\'s Encrypt, Cloudflare, or AWS ACM).'
        : 'Configure DNS first, then provision TLS certificate.',
      category: 'infrastructure',
    });

    // 4. Robinhood RPC API key
    let rhReady = false;
    try {
      const envKey = (import.meta as any).env?.VITE_RH_RPC_PRIMARY;
      if (envKey && !envKey.includes('ankr.com/robinhood')) {
        // Custom RPC configured — try it
        const res = await fetch(envKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        rhReady = !!data.result;
      }
    } catch { /* not available */ }
    results.push({
      id: 'rh_rpc',
      name: 'Robinhood RPC API Key',
      description: 'Authenticated endpoint for Robinhood Chain 4663',
      status: rhReady ? 'READY' : 'MISSING',
      action: 'Obtain API key from Ankr, Alchemy, or Robinhood. Set VITE_RH_RPC_PRIMARY in .env and ROBINHOOD_RPC_API_KEY in backend .env.',
      category: 'credentials',
    });

    // 5. Production environment variables
    const wsUrl = (import.meta as any).env?.VITE_WS_URL;
    const envReady = !!wsUrl;
    results.push({
      id: 'env_vars',
      name: 'Production Environment Variables',
      description: 'VITE_WS_URL and other production config',
      status: envReady ? 'READY' : 'MISSING',
      action: 'Set all required VITE_* variables in .env. See .env.example for the full list.',
      category: 'configuration',
    });

    // 6. Database/cache
    results.push({
      id: 'database',
      name: 'Database/Cache',
      description: 'Gitlawb Data SDK is built-in. External cache optional.',
      status: 'READY', // Gitlawb SDK is built-in
      action: 'No external database required. Gitlawb Data SDK handles data persistence.',
      category: 'configuration',
    });

    setItems(results);
    setChecking(false);
  };

  useEffect(() => { runCheck(); }, []);

  const categories = [
    { id: 'infrastructure' as const, label: 'INFRASTRUCTURE', icon: '⬡' },
    { id: 'credentials' as const, label: 'CREDENTIALS', icon: '🔒' },
    { id: 'configuration' as const, label: 'CONFIGURATION', icon: '⚙' },
  ];

  const readyCount = items.filter(i => i.status === 'READY').length;
  const missingCount = items.filter(i => i.status === 'MISSING').length;
  const blockedCount = items.filter(i => i.status === 'BLOCKED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          EXTERNAL SETUP CHECKLIST
        </span>
        <button className="btn btn-sm btn-cyan" style={{ fontSize: 8 }} onClick={runCheck} disabled={checking}>
          {checking ? 'CHECKING...' : 'RE-CHECK'}
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, fontSize: 8 }}>
        <span style={{ color: 'var(--green)' }}>✓ {readyCount} READY</span>
        {missingCount > 0 && <span style={{ color: 'var(--amber)' }}>○ {missingCount} MISSING</span>}
        {blockedCount > 0 && <span style={{ color: 'var(--text-muted)' }}>⊘ {blockedCount} BLOCKED</span>}
      </div>

      {/* All items ready banner */}
      {missingCount === 0 && blockedCount === 0 && items.length > 0 && (
        <div style={{
          padding: 8, borderRadius: 4,
          background: 'rgba(0,255,100,0.08)', border: '1px solid rgba(0,255,100,0.2)',
          fontSize: 9, fontWeight: 900, color: 'var(--green)',
        }}>
          ✓ ALL EXTERNAL REQUIREMENTS SATISFIED — Ready for deployment
        </div>
      )}

      {/* By category */}
      {categories.map(cat => {
        const catItems = items.filter(i => i.category === cat.id);
        if (catItems.length === 0) return null;

        return (
          <div key={cat.id} style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              padding: '6px 8px', background: 'var(--bg)',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 8, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.05em',
            }}>
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 7, color: 'var(--text-muted)' }}>
                {catItems.filter(i => i.status === 'READY').length}/{catItems.length}
              </span>
            </div>
            <div style={{ padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {catItems.map(item => (
                <ChecklistRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = item.status === 'READY' ? 'var(--green)' : item.status === 'MISSING' ? 'var(--amber)' : 'var(--text-muted)';
  const statusIcon = item.status === 'READY' ? '✓' : item.status === 'MISSING' ? '○' : '⊘';

  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ color: statusColor, fontSize: 10, minWidth: 14, textAlign: 'center' }}>{statusIcon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-bright)' }}>{item.name}</div>
          <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>{item.description}</div>
        </div>
        <span style={{
          fontSize: 7, fontWeight: 900, padding: '1px 5px', borderRadius: 2,
          color: statusColor, background: `${statusColor}12`,
          whiteSpace: 'nowrap',
        }}>
          {item.status}
        </span>
      </button>
      {expanded && item.status !== 'READY' && (
        <div style={{
          marginLeft: 20, marginTop: 2, padding: 6, borderRadius: 3,
          background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.12)',
          fontSize: 7, color: 'var(--amber)', lineHeight: 1.5,
        }}>
          → {item.action}
        </div>
      )}
    </div>
  );
}