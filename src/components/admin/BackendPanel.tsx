// BSTONKEX Admin Backend Deployment Panel
// Shows backend deployment status and provides deployment guidance
import { useState, useEffect } from 'react';

interface BackendStatus {
  deployed: boolean;
  health: 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  websocket: 'UP' | 'DOWN' | 'UNKNOWN';
  marketPipeline: 'UP' | 'DOWN' | 'UNKNOWN';
  connections: number;
  maxConnections: number;
  uptime: number;
  lastCheck: number;
}

export default function BackendPanel() {
  const [status, setStatus] = useState<BackendStatus>({
    deployed: false,
    health: 'UNKNOWN',
    websocket: 'UNKNOWN',
    marketPipeline: 'UNKNOWN',
    connections: 0,
    maxConnections: 1000,
    uptime: 0,
    lastCheck: 0,
  });
  const [checking, setChecking] = useState(false);

  const checkBackend = async () => {
    setChecking(true);
    const newStatus: BackendStatus = {
      deployed: false,
      health: 'UNKNOWN',
      websocket: 'UNKNOWN',
      marketPipeline: 'UNKNOWN',
      connections: 0,
      maxConnections: 1000,
      uptime: 0,
      lastCheck: Date.now(),
    };

    try {
      const res = await fetch('https://api.bstonkex.xyz/health', { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      newStatus.deployed = true;
      newStatus.health = data.status || 'UNKNOWN';
      newStatus.uptime = data.uptime || 0;
      
      // Check WebSocket
      try {
        const wsRes = await fetch('https://api.bstonkex.xyz/ws/health', { signal: AbortSignal.timeout(5000) });
        const wsData = await wsRes.json();
        newStatus.websocket = wsData.status || 'UNKNOWN';
        newStatus.connections = wsData.connections || 0;
        newStatus.maxConnections = wsData.maxConnections || 1000;
      } catch {
        newStatus.websocket = 'DOWN';
      }
    } catch {
      newStatus.deployed = false;
      newStatus.health = 'DOWN';
      newStatus.websocket = 'DOWN';
    }

    setStatus(newStatus);
    setChecking(false);
  };

  useEffect(() => { checkBackend(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          BACKEND DEPLOYMENT
        </span>
        <button className="btn btn-sm btn-cyan" style={{ fontSize: 8 }} onClick={checkBackend} disabled={checking}>
          {checking ? 'CHECKING...' : 'CHECK STATUS'}
        </button>
      </div>

      {/* Status Overview */}
      <div style={{
        padding: 8, borderRadius: 4,
        background: status.deployed ? 'rgba(0,255,100,0.08)' : 'rgba(255,60,60,0.08)',
        border: `1px solid ${status.deployed ? 'rgba(0,255,100,0.2)' : 'rgba(255,60,60,0.2)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ color: status.deployed ? 'var(--green)' : 'var(--red)', fontSize: 10 }}>
            {status.deployed ? '✓' : '✗'}
          </span>
          <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-bright)' }}>
            {status.deployed ? 'BACKEND DEPLOYED' : 'BACKEND NOT DEPLOYED'}
          </span>
        </div>
        {!status.deployed && (
          <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>
            Deploy backend/ package to production server. See backend/DEPLOY.md for instructions.
          </div>
        )}
      </div>

      {/* Service Status */}
      {status.deployed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ServiceStatusRow name="Health API" status={status.health} detail={`Uptime: ${status.uptime}s`} />
          <ServiceStatusRow name="WebSocket" status={status.websocket} detail={`${status.connections}/${status.maxConnections} connections`} />
          <ServiceStatusRow name="Market Pipeline" status={status.health === 'UP' ? 'UP' : 'UNKNOWN'} detail="Real DexScreener data" />
        </div>
      )}

      {/* Deployment Steps */}
      {!status.deployed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
            DEPLOYMENT STEPS:
          </div>
          {[
            'Provision server (Node.js 18+ or Bun 1.0+)',
            'Copy backend/ directory to server',
            'Configure .env with production values',
            'Set ROBINHOOD_RPC_API_KEY',
            'Configure DNS: api.bstonkex.xyz',
            'Provision TLS certificate',
            'Run: npm start',
            'Verify: /health, /ready, /ws/health',
          ].map((step, i) => (
            <div key={i} style={{ fontSize: 7, color: 'var(--text-muted)', paddingLeft: 8 }}>
              {i + 1}. {step}
            </div>
          ))}
          <div style={{
            marginTop: 4, padding: 6, borderRadius: 3,
            background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)',
            fontSize: 7, color: 'var(--amber)',
          }}>
            ⚠ EXTERNAL ACTION REQUIRED — Cannot deploy backend from this frontend environment
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceStatusRow({ name, status, detail }: { name: string; status: string; detail: string }) {
  const color = status === 'UP' ? 'var(--green)' : status === 'DEGRADED' ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
      borderRadius: 3, border: '1px solid var(--border)',
    }}>
      <span style={{ color, fontSize: 9 }}>{status === 'UP' ? '✓' : status === 'DEGRADED' ? '○' : '✗'}</span>
      <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-bright)' }}>{name}</span>
      <span style={{ marginLeft: 'auto', fontSize: 7, color: 'var(--text-muted)' }}>{detail}</span>
    </div>
  );
}