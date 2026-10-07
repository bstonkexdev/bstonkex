import { CHAINS, formatUsd, formatNum, shortenAddress, explorerAddressUrl, type ChainId } from '../lib/config';
import type { TokenData, HolderData } from '../lib/market';
import type { SafetyReport } from '../lib/engine/token-safety';

// ── Buy/Sell Pressure Bar ────────────────────────────────────

export function BuySellPressure({ buys, sells }: { buys: number | null; sells: number | null }) {
  const b = buys ?? 0;
  const s = sells ?? 0;
  const total = b + s;
  if (total === 0) return <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>NO TRADE DATA</div>;
  const bPct = (b / total) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
        <span style={{ color: 'var(--green)', fontWeight: 700 }}>BUY {formatNum(b)}</span>
        <span style={{ color: 'var(--red)', fontWeight: 700 }}>SELL {formatNum(s)}</span>
      </div>
      <div style={{ display: 'flex', height: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${bPct}%`, background: 'var(--green)', transition: 'width 0.3s' }} />
        <div style={{ flex: 1, background: 'var(--red)', transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'center' }}>
        RATIO {s > 0 ? (b / s).toFixed(2) : '∞'} : 1
      </div>
    </div>
  );
}

// ── Liquidity Intelligence ───────────────────────────────────

export function LiquidityPanel({ token }: { token: TokenData }) {
  const liq = token.liquidity ?? 0;
  const lowLiq = liq < 10_000;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="info-row"><span className="info-label">LIQUIDITY</span><span className="info-value">{formatUsd(token.liquidity)}</span></div>
      <div className="info-row"><span className="info-label">PRIMARY POOL</span><span className="info-value text-xs">{token.pairAddress ? shortenAddress(token.pairAddress, 6) : 'N/A'}</span></div>
      <div className="info-row"><span className="info-label">DEX</span><span className="info-value">{token.dexId || 'N/A'}</span></div>
      {token.marketCap && token.liquidity && (
        <div className="info-row"><span className="info-label">MCAP / LIQ</span><span className="info-value">{(token.marketCap / token.liquidity).toFixed(2)}</span></div>
      )}
      {lowLiq && (
        <div style={{ padding: 6, fontSize: 8, fontWeight: 700, border: '1px solid var(--amber)', background: 'rgba(255,170,0,0.04)', color: 'var(--amber)', marginTop: 4 }}>
          LOW LIQUIDITY — Large trades may experience significant price impact.
        </div>
      )}
    </div>
  );
}

// ── Risk Panel ───────────────────────────────────────────────

export function RiskPanel({ safety, chainId }: { safety: SafetyReport | null; chainId: ChainId }) {
  if (!safety) return <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: 8 }}>RISK CHECK LOADING...</div>;
  if (!safety.checked) return <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: 8 }}>RISK CHECK UNAVAILABLE</div>;

  const levelColors = { low: 'var(--green)', medium: 'var(--amber)', high: 'var(--red)', critical: 'var(--red)' };
  const levelColor = levelColors[safety.riskLevel] || 'var(--text-dim)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: levelColor }}>RISK: {safety.riskLevel.toUpperCase()}</span>
        <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>— Not a safety guarantee</span>
      </div>

      {/* Signal grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, fontSize: 8 }}>
        <CheckRow label="CONTRACT EXISTS" passed={safety.checks.contractExists} />
        <CheckRow label="VALID DECIMALS" passed={safety.checks.hasDecimals} />
        <CheckRow label="HAS SYMBOL" passed={safety.checks.hasSymbol} />
        <CheckRow label="LIQUIDITY" passed={safety.checks.liquidityOk} />
        <CheckRow label="HONEYPOT CHECK" passed={safety.checks.honeypotCheckPassed} />
        <CheckRow label="TAX CHECK" passed={safety.checks.taxCheckPassed} />
        <CheckRow label="TRADING ENABLED" passed={safety.checks.tradingEnabled} />
      </div>

      {/* Solana-specific */}
      {chainId === 'solana' && (
        <div style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>
          Solana checks: Mint authority, Freeze authority, Token program, Metadata — NOT INDEXED
        </div>
      )}

      {/* Warnings */}
      {safety.warnings.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {safety.warnings.map((w, i) => (
            <div key={i} style={{
              padding: '3px 6px', fontSize: 8, fontWeight: 700, marginBottom: 2,
              border: `1px solid ${w.level === 'critical' || w.level === 'high' ? 'var(--red)' : 'var(--amber)'}`,
              color: w.level === 'critical' || w.level === 'high' ? 'var(--red)' : 'var(--amber)',
            }}>
              ⚠ {w.label}: {w.detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckRow({ label, passed }: { label: string; passed: boolean | null }) {
  const color = passed === true ? 'var(--green)' : passed === false ? 'var(--red)' : 'var(--text-dim)';
  const icon = passed === true ? '✓' : passed === false ? '✗' : '?';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ color, fontWeight: 800 }}>{icon}</span>
    </div>
  );
}

// ── Contract Intelligence ────────────────────────────────────

export function ContractPanel({ token, chainId }: { token: TokenData; chainId: ChainId }) {
  const chain = CHAINS[chainId];
  const isSolana = chainId === 'solana';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="info-row">
        <span className="info-label">{isSolana ? 'MINT' : 'CONTRACT'}</span>
        <span className="info-value text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {shortenAddress(token.address, 8)}
          <button className="copy-btn" style={{ fontSize: 7 }} onClick={() => navigator.clipboard.writeText(token.address)}>C</button>
          <a href={explorerAddressUrl(chainId, token.address)} target="_blank" rel="noopener"
            style={{ fontSize: 7, color: 'var(--cyan)', textDecoration: 'underline' }}>EXPLORER ↗</a>
        </span>
      </div>

      {isSolana ? (
        <>
          <div className="info-row"><span className="info-label">TOKEN PROGRAM</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">MINT AUTHORITY</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">FREEZE AUTHORITY</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">DECIMALS</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">SUPPLY</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 2 }}>
            Solana contract intelligence requires on-chain indexing. Connect an indexer to display.
          </div>
        </>
      ) : (
        <>
          <div className="info-row"><span className="info-label">VERIFIED</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">PROXY</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">OWNER</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">DECIMALS</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">TOTAL SUPPLY</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div className="info-row"><span className="info-label">TOKEN STANDARD</span><span className="info-value text-dim">NOT INDEXED</span></div>
          <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 2 }}>
            EVM contract intelligence requires an explorer API. Configure an API key in .env to display.
          </div>
        </>
      )}
    </div>
  );
}

// ── Holder Concentration ─────────────────────────────────────

export function HolderConcentration({ holders }: { holders: HolderData[] }) {
  if (holders.length === 0) {
    return <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: 8 }}>HOLDER DATA UNAVAILABLE — Requires chain indexer</div>;
  }
  const top10 = holders.slice(0, 10).reduce((s, h) => s + h.pctSupply, 0);
  const top20 = holders.slice(0, 20).reduce((s, h) => s + h.pctSupply, 0);
  const highConcentration = top10 > 50;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="info-row"><span className="info-label">TOP 10</span><span className="info-value">{top10.toFixed(2)}%</span></div>
      <div className="info-row"><span className="info-label">TOP 20</span><span className="info-value">{top20.toFixed(2)}%</span></div>
      {/* Distribution bar */}
      <div style={{ height: 8, display: 'flex', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, top10)}%`, background: 'var(--cyan)' }} />
        <div style={{ width: `${Math.min(100, top20 - top10)}%`, background: 'var(--cyan-dim, #0aa)' }} />
        <div style={{ flex: 1, background: 'var(--border)' }} />
      </div>
      {highConcentration && (
        <div style={{ padding: 4, fontSize: 8, fontWeight: 700, border: '1px solid var(--amber)', color: 'var(--amber)' }}>
          HIGH HOLDER CONCENTRATION — Top 10 holders own {top10.toFixed(1)}% of supply
        </div>
      )}
    </div>
  );
}