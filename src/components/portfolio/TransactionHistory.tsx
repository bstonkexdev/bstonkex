import { useState, useEffect } from 'react';
import { CHAINS, formatUsd, shortenAddress, explorerTxUrl } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { getWalletTrades, type TrackedTrade } from '../../lib/engine/tx-tracker';
import ChainIcon from '../ChainIcon';

type Filter = 'all' | 'buy' | 'sell' | 'pending' | 'confirmed' | 'failed';

export default function TransactionHistory({ wallet }: { wallet: string | null }) {
  const [trades, setTrades] = useState<TrackedTrade[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [chainFilter, setChainFilter] = useState<ChainId | 'all'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    getWalletTrades(wallet).then(t => { setTrades(t); setLoading(false); }).catch(() => setLoading(false));
  }, [wallet]);

  const filtered = trades.filter(t => {
    if (filter === 'buy' && t.side !== 'buy') return false;
    if (filter === 'sell' && t.side !== 'sell') return false;
    if (filter === 'pending' && t.status !== 'pending') return false;
    if (filter === 'confirmed' && t.status !== 'confirmed') return false;
    if (filter === 'failed' && t.status !== 'failed') return false;
    if (chainFilter !== 'all' && t.chainId !== chainFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'buy', 'sell', 'pending', 'confirmed', 'failed'] as Filter[]).map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-cyan' : ''}`}
            style={{ fontSize: 7, padding: '2px 5px' }}
            onClick={() => setFilter(f)}>{f.toUpperCase()}</button>
        ))}
        <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px' }} />
        {(['all', 'bsc', 'solana', 'base', 'robinhood'] as const).map(c => (
          <button key={c} className={`btn btn-sm ${chainFilter === c ? 'btn-cyan' : ''}`}
            style={{ fontSize: 7, padding: '2px 5px' }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
            onClick={() => setChainFilter(c)}>{c === 'all' ? 'ALL' : <><ChainIcon chainId={c} size={10} />{CHAINS[c]?.shortName || c}</>}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{filtered.length} TXS</span>
      </div>

      {/* Desktop table */}
      <table className="data-table compact">
        <thead>
          <tr>
            <th>TIME</th><th>CHAIN</th><th>TYPE</th><th>TOKEN</th>
            <th className="right">AMOUNT</th><th className="right">VALUE</th>
            <th>STATUS</th><th>TX</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, fontSize: 9, color: 'var(--text-dim)' }}>LOADING TRANSACTIONS...</td></tr>}
          {!loading && filtered.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, fontSize: 9, color: 'var(--text-dim)' }}>
              {trades.length === 0 ? 'NO TRANSACTIONS YET — Execute a trade to see it here' : 'NO MATCHING TRANSACTIONS'}
            </td></tr>
          )}
          {!loading && filtered.map(t => {
            const chain = CHAINS[t.chainId];
            return (
              <tr key={t.id}>
                <td style={{ fontSize: 9, color: 'var(--text-dim)' }}>{formatTime(t.timestamp)}</td>
                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ChainIcon chainId={t.chainId as ChainId} size={11} /><span className="badge" style={{ borderColor: chain?.color, color: chain?.color, fontSize: 7 }}>{chain?.shortName}</span></span></td>
                <td>
                  <span style={{
                    fontSize: 8, fontWeight: 800, padding: '1px 4px',
                    border: `1px solid ${t.side === 'buy' ? 'var(--green)' : 'var(--red)'}`,
                    color: t.side === 'buy' ? 'var(--green)' : 'var(--red)',
                  }}>{t.side.toUpperCase()}</span>
                </td>
                <td className="font-bold" style={{ color: 'var(--text-bright)', fontSize: 10 }}>{t.tokenSymbol}</td>
                <td className="right" style={{ fontWeight: 700 }}>${t.amountUsd.toFixed(2)}</td>
                <td className="right" style={{ fontWeight: 700 }}>${t.amountUsd.toFixed(2)}</td>
                <td>
                  <span style={{
                    fontSize: 7, fontWeight: 800, padding: '1px 4px',
                    border: `1px solid ${t.status === 'confirmed' ? 'var(--green)' : t.status === 'pending' ? 'var(--amber)' : 'var(--red)'}`,
                    color: t.status === 'confirmed' ? 'var(--green)' : t.status === 'pending' ? 'var(--amber)' : 'var(--red)',
                  }}>{t.status.toUpperCase()}</span>
                </td>
                <td>
                  <a href={explorerTxUrl(t.chainId, t.txHash)} target="_blank" rel="noopener"
                    style={{ fontSize: 8, color: 'var(--cyan)', textDecoration: 'underline' }}>
                    {shortenAddress(t.txHash, 4)}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {filtered.map(t => {
          const chain = CHAINS[t.chainId];
          return (
            <div key={`m-${t.id}`} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: t.side === 'buy' ? 'var(--green)' : 'var(--red)' }}>{t.side.toUpperCase()}</span>
                  <span style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)' }}>{t.tokenSymbol}</span>
                  <ChainIcon chainId={t.chainId as ChainId} size={11} />
                  <span className="badge" style={{ borderColor: chain?.color, color: chain?.color, fontSize: 7 }}>{chain?.shortName}</span>
                </div>
                <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{formatTime(t.timestamp)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
                <span style={{ fontWeight: 700 }}>${t.amountUsd.toFixed(2)}</span>
                <span style={{
                  fontWeight: 700,
                  color: t.status === 'confirmed' ? 'var(--green)' : t.status === 'pending' ? 'var(--amber)' : 'var(--red)',
                }}>{t.status.toUpperCase()}</span>
                <a href={explorerTxUrl(t.chainId, t.txHash)} target="_blank" rel="noopener" style={{ color: 'var(--cyan)' }}>
                  {shortenAddress(t.txHash, 4)} ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}