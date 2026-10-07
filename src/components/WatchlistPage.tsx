import { useState, useEffect, useRef } from 'react';
import { useApp } from '../lib/context';
import { gitlawb } from '../lib/gitlawb';
import { getTokenByAddress, type TokenData } from '../lib/market';
import { CHAINS, formatUsd, formatPct, formatNum, shortenAddress } from '../lib/config';
import type { ChainId } from '../lib/config';
import { subscribeToken, onMarketEvent, type MarketStreamEvent } from '../lib/engine/market-stream';
import ChainIcon from './ChainIcon';

interface WatchlistEntry {
  tokenAddress: string;
  chainId: string;
  symbol: string;
  recordId: string;
}

type SortKey = 'symbol' | 'price' | 'change' | 'volume' | 'liquidity';

export default function WatchlistPage() {
  const { wallet, setTradeToken, connect, setWalletModal } = useApp();
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [tokenData, setTokenData] = useState<Map<string, TokenData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!wallet.address) return;
    setLoading(true);
    const load = async () => {
      try {
        const wl = gitlawb.db.collection<{ tokenAddress: string; chainId: string; symbol: string }>('watchlist');
        const { records } = await wl.list({ limit: 100 });
        const e = records.map(r => ({
          tokenAddress: r.data.tokenAddress,
          chainId: r.data.chainId,
          symbol: r.data.symbol,
          recordId: r.id,
        }));
        setEntries(e);
        const dm = new Map<string, TokenData>();
        await Promise.allSettled(e.map(async w => {
          const d = await getTokenByAddress(w.chainId as ChainId, w.tokenAddress);
          if (d) dm.set(`${w.chainId}-${w.tokenAddress}`, d);
        }));
        setTokenData(dm);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [wallet.address]);

  // Subscribe to real-time price updates for all watched tokens
  useEffect(() => {
    if (entries.length === 0) return;
    const unsubs = entries.map(w => subscribeToken(w.chainId as ChainId, w.tokenAddress, w.symbol));

    const unsubEvent = onMarketEvent((e: MarketStreamEvent) => {
      // Update token data for matching watched token
      setTokenData(prev => {
        const key = `${e.chainId}-${e.tokenAddress}`;
        const existing = prev.get(key);
        if (!existing) return prev;
        const updated = { ...existing };
        if (e.type === 'price') {
          updated.price = e.data.price;
          updated.priceChange24h = e.data.change24h ?? updated.priceChange24h;
        }
        if (e.type === 'stats') {
          updated.price = e.data.price ?? updated.price;
          updated.priceChange24h = e.data.change24h ?? updated.priceChange24h;
          updated.volume24h = e.data.volume24h ?? updated.volume24h;
          updated.liquidity = e.data.liquidity ?? updated.liquidity;
        }
        const next = new Map(prev);
        next.set(key, updated);
        return next;
      });
    });

    return () => { unsubs.forEach(u => u()); unsubEvent(); };
  }, [entries]);

  const removeEntry = async (recordId: string) => {
    try {
      const wl = gitlawb.db.collection('watchlist');
      await wl.remove(recordId);
      setEntries(prev => prev.filter(e => e.recordId !== recordId));
    } catch { /* ignore */ }
  };

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('asc'); }
  };

  const sorted = [...entries].sort((a, b) => {
    const da = tokenData.get(`${a.chainId}-${a.tokenAddress}`);
    const db = tokenData.get(`${b.chainId}-${b.tokenAddress}`);
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortBy) {
      case 'symbol': return dir * (a.symbol || '').localeCompare(b.symbol || '');
      case 'price': return dir * ((da?.price ?? 0) - (db?.price ?? 0));
      case 'change': return dir * ((da?.priceChange24h ?? 0) - (db?.priceChange24h ?? 0));
      case 'volume': return dir * ((da?.volume24h ?? 0) - (db?.volume24h ?? 0));
      case 'liquidity': return dir * ((da?.liquidity ?? 0) - (db?.liquidity ?? 0));
      default: return 0;
    }
  });

  if (!wallet.address) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>WATCHLIST</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
          Connect your wallet to sync your watchlist.
        </div>
        <button className="btn btn-cyan" onClick={() => setWalletModal('evm')}>
          CONNECT WALLET
        </button>
      </div>
    );
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: 'var(--pixel) solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>WATCHLIST</span>
        <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{entries.length} TOKENS</span>
        <div style={{ flex: 1 }} />
      </div>

      {/* Sort controls */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 12px', borderBottom: 'var(--pixel) solid var(--border)', fontSize: 8 }}>
        {([['symbol', 'NAME'], ['price', 'PRICE'], ['change', '24H'], ['volume', 'VOL'], ['liquidity', 'LIQ']] as [SortKey, string][]).map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${sortBy === k ? 'btn-cyan' : ''}`}
            style={{ fontSize: 7, padding: '2px 5px' }}
            onClick={() => handleSort(k)}>
            {l}{sortBy === k ? (sortDir === 'asc' ? ' ▴' : ' ▾') : ''}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>LOADING WATCHLIST...</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
            NO TOKENS IN WATCHLIST<br />
            <span style={{ fontSize: 8 }}>Add tokens from any token page using the ☆ button</span>
          </div>
        ) : (
          <table className="data-table compact">
            <thead>
              <tr>
                <th>TOKEN</th>
                <th>CHAIN</th>
                <th className="right">PRICE</th>
                <th className="right">24H</th>
                <th className="right">VOLUME</th>
                <th className="right">LIQUIDITY</th>
                <th className="right">MCAP</th>
                <th className="right">BUYS</th>
                <th className="right">SELLS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(entry => {
                const key = `${entry.chainId}-${entry.tokenAddress}`;
                const d = tokenData.get(key);
                const chain = CHAINS[entry.chainId as ChainId];
                const isUp = (d?.priceChange24h ?? 0) >= 0;
                return (
                  <tr key={key} style={{ cursor: 'pointer' }}
                    onClick={() => setTradeToken({ chainId: entry.chainId as ChainId, address: entry.tokenAddress, name: d?.name || entry.symbol, symbol: entry.symbol })}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {d?.icon && <img src={d.icon} alt="" style={{ width: 16, height: 16, border: '1px solid var(--border)' }} />}
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)' }}>{entry.symbol}</div>
                          <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>{d?.name || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <ChainIcon chainId={w.chainId as ChainId} size={11} />
                        <span className="badge" style={{ borderColor: chain?.color, color: chain?.color, fontSize: 7 }}>
                          {chain?.shortName}
                        </span>
                      </span>
                    </td>
                    <td className="right" style={{ fontWeight: 700 }}>{d ? formatUsd(d.price) : '...'}</td>
                    <td className="right" style={{ color: isUp ? 'var(--green)' : 'var(--red)' }}>{d ? formatPct(d.priceChange24h) : '...'}</td>
                    <td className="right">{d ? formatUsd(d.volume24h) : '...'}</td>
                    <td className="right">{d ? formatUsd(d.liquidity) : '...'}</td>
                    <td className="right">{d ? formatUsd(d.marketCap) : '...'}</td>
                    <td className="right" style={{ color: 'var(--green)' }}>{d ? formatNum(d.buys24h) : '...'}</td>
                    <td className="right" style={{ color: 'var(--red)' }}>{d ? formatNum(d.sells24h) : '...'}</td>
                    <td>
                      <button className="btn btn-sm" style={{ fontSize: 7, padding: '2px 5px', color: 'var(--red)' }}
                        onClick={e => { e.stopPropagation(); removeEntry(entry.recordId); }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}