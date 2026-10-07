// BSTONKEX Admin Robinhood RPC Configuration Panel
import { useState, useEffect } from 'react';
import { CHAINS } from '../../lib/config';

interface RobinhoodStatus {
  rpcConfigured: boolean;
  rpcReachable: boolean;
  chainId: number | null;
  chainIdCorrect: boolean;
  latestBlock: number | null;
  latencyMs: number | null;
  error: string | null;
}

export default function RobinhoodPanel() {
  const [status, setStatus] = useState<RobinhoodStatus>({
    rpcConfigured: false,
    rpcReachable: false,
    chainId: null,
    chainIdCorrect: false,
    latestBlock: null,
    latencyMs: null,
    error: null,
  });
  const [checking, setChecking] = useState(false);

  const checkRobinhood = async () => {
    setChecking(true);
    const chain = CHAINS.robinhood;
    const newStatus: RobinhoodStatus = {
      rpcConfigured: false,
      rpcReachable: false,
      chainId: null,
      chainIdCorrect: false,
      latestBlock: null,
      latencyMs: null,
      error: null,
    };

    // Check if RPC is configured
    let rpcUrl = chain.rpcUrl;
    try {
      const envUrl = (import.meta as any).env?.VITE_RH_RPC_PRIMARY;
      if (envUrl) {
        rpcUrl = envUrl;
        newStatus.rpcConfigured = true;
      }
    } catch { /* use default */ }

    if (!newStatus.rpcConfigured && rpcUrl.includes('ankr.com/robinhood')) {
      newStatus.rpcConfigured = false; // Default Ankr endpoint returns 403
    }

    // Try RPC call
    const start = Date.now();
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 },
          { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 2 },
        ]),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      const latencyMs = Date.now() - start;

      if (Array.isArray(data)) {
        const chainIdResult = data[0]?.result;
        const blockResult = data[1]?.result;

        if (chainIdResult) {
          newStatus.chainId = parseInt(chainIdResult, 16);
          newStatus.chainIdCorrect = newStatus.chainId === 4663;
        }
        if (blockResult) {
          newStatus.latestBlock = parseInt(blockResult, 16);
        }
        newStatus.rpcReachable = !!chainIdResult && !!blockResult;
        newStatus.latencyMs = latencyMs;
      } else if (data.error) {
        newStatus.error = data.error.message || 'RPC error';
      }
    } catch (e: unknown) {
      newStatus.error = e instanceof Error ? e.message : 'Network error';
    }

    setStatus(newStatus);
    setChecking(false);
  };

  useEffect(() => { checkRobinhood(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
          ROBINHOOD CHAIN 4663
        </span>
        <button className="btn btn-sm btn-cyan" style={{ fontSize: 8 }} onClick={checkRobinhood} disabled={checking}>
          {checking ? 'CHECKING...' : 'VERIFY RPC'}
        </button>
      </div>

      {/* Chain Info */}
      <div style={{ display: 'flex', gap: 12, fontSize: 8, color: 'var(--text-muted)' }}>
        <span>Chain ID: 4663</span>
        <span>Hex: 0x1237</span>
        <span>Native: ETH</span>
      </div>

      {/* Status */}
      <div style={{
        padding: 8, borderRadius: 4,
        background: status.rpcReachable ? 'rgba(0,255,100,0.08)' : 'rgba(255,60,60,0.08)',
        border: `1px solid ${status.rpcReachable ? 'rgba(0,255,100,0.2)' : 'rgba(255,60,60,0.2)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ color: status.rpcReachable ? 'var(--green)' : 'var(--red)', fontSize: 10 }}>
            {status.rpcReachable ? '✓' : '✗'}
          </span>
          <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-bright)' }}>
            {status.rpcReachable ? 'RPC VERIFIED' : 'RPC NOT VERIFIED'}
          </span>
        </div>
        
        {status.rpcReachable && (
          <div style={{ fontSize: 8, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>Chain ID: {status.chainId} {status.chainIdCorrect ? '✓' : '✗ MISMATCH'}</div>
            <div>Latest Block: #{status.latestBlock?.toLocaleString()}</div>
            <div>Latency: {status.latencyMs}ms</div>
          </div>
        )}
        
        {status.error && (
          <div style={{ fontSize: 8, color: 'var(--red)', marginTop: 4 }}>
            Error: {status.error}
          </div>
        )}
      </div>

      {/* Configuration */}
      {!status.rpcReachable && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
            CONFIGURATION REQUIRED:
          </div>
          <div style={{ fontSize: 7, color: 'var(--text-muted)', paddingLeft: 8 }}>
            1. Obtain API key from Ankr, Alchemy, or Robinhood directly
          </div>
          <div style={{ fontSize: 7, color: 'var(--text-muted)', paddingLeft: 8 }}>
            2. Set VITE_RH_RPC_PRIMARY in .env:
          </div>
          <div style={{
            fontSize: 7, color: 'var(--cyan)', paddingLeft: 16,
            fontFamily: 'monospace', wordBreak: 'break-all',
          }}>
            VITE_RH_RPC_PRIMARY=https://rpc.ankr.com/robinhood?apiKey=YOUR_KEY
          </div>
          <div style={{ fontSize: 7, color: 'var(--text-muted)', paddingLeft: 8 }}>
            3. Set ROBINHOOD_RPC_API_KEY in backend .env
          </div>
          <div style={{
            marginTop: 4, padding: 6, borderRadius: 3,
            background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)',
            fontSize: 7, color: 'var(--amber)',
          }}>
            ⚠ CREDENTIAL REQUIRED — Cannot verify Robinhood RPC without API key
          </div>
        </div>
      )}
    </div>
  );
}