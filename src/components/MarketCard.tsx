import { CHAINS, formatUsd, formatPct, shortenAddress } from '../lib/config';
import type { ChainId } from '../lib/config';
import type { MarketToken } from '../lib/market-discovery';
import { useApp } from '../lib/context';
import { gitlawb } from '../lib/gitlawb';
import { useState, useEffect } from 'react';
import ChainIcon from './ChainIcon';

interface Props {
  token: MarketToken;
  compact?: boolean;
}

export default function MarketCard({ token, compact }: Props) {
  const { setTradeToken, wallet } = useApp();
  const [watched, setWatched] = useState(false);
  const chain = CHAINS[token.chainId];
  const isUp = (token.priceChange24h ?? 0) >= 0;

  useEffect(() => {
    if (!wallet.address) return;
    const check = async () => {
      try {
        const wl = gitlawb.db.collection<{ tokenAddress: string }>('watchlist');
        const { records } = await wl.list({ limit: 100 });
        setWatched(records.some(r => r.data.tokenAddress === token.address));
      } catch {}
    };
    check();
  }, [token.address, wallet.address]);

  const toggleWatch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!wallet.address) return;
    try {
      const wl = gitlawb.db.collection<{ tokenAddress: string; symbol: string; chainId: string }>('watchlist');
      const { records } = await wl.list({ limit: 100 });
      const existing = records.find(r => r.data.tokenAddress === token.address);
      if (existing) { await wl.remove(existing.id); setWatched(false); }
      else { await wl.create({ tokenAddress: token.address, symbol: token.symbol, chainId: token.chainId }); setWatched(true); }
    } catch {}
  };

  const handleClick = () => {
    setTradeToken({ chainId: token.chainId, address: token.address, name: token.name, symbol: token.symbol });
  };

  if (compact) {
    return (
      <div className="market-card-compact" onClick={handleClick}>
        <span style={{ fontWeight: 800, fontSize: 9, color: 'var(--text-bright)' }}>{token.symbol}</span>
        <ChainIcon chainId={token.chainId as ChainId} size={10} />
        <span style={{ fontSize: 7, color: chain?.color }}>{chain?.shortName}</span>
        <span style={{ fontSize: 9, fontWeight: 700 }}>{formatUsd(token.price)}</span>
        <span style={{ fontSize: 8, color: isUp ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{formatPct(token.priceChange24h)}</span>
      </div>
    );
  }

  return (
    <div className="market-card" onClick={handleClick}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {token.icon && <img src={token.icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} onError={e => (e.currentTarget.style.display = 'none')} />}
        <span style={{ fontWeight: 800, fontSize: 10, color: 'var(--text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{token.symbol}</span>
        <ChainIcon chainId={token.chainId as ChainId} size={11} />
        <span style={{ fontSize: 7, color: chain?.color, fontWeight: 700 }}>{chain?.shortName}</span>
        <button onClick={toggleWatch} style={{ background: 'none', border: 'none', color: watched ? 'var(--amber)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0 }}>
          {watched ? '★' : '☆'}
        </button>
      </div>
      {/* Price */}
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 2 }}>
        {formatUsd(token.price)}
      </div>
      {/* Change */}
      <div style={{ fontSize: 9, fontWeight: 700, color: isUp ? 'var(--green)' : 'var(--red)', marginBottom: 4 }}>
        {formatPct(token.priceChange24h)}
      </div>
      {/* Volume + Liquidity */}
      <div style={{ display: 'flex', gap: 6, fontSize: 7, color: 'var(--text-dim)', marginBottom: 6 }}>
        <span>Vol {formatUsd(token.volume24h)}</span>
        <span>Liq {formatUsd(token.liquidity)}</span>
      </div>
      {/* Actions */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-sm btn-green" style={{ flex: 1, fontSize: 7, padding: '2px 4px' }}
          onClick={e => { e.stopPropagation(); handleClick(); }}>TRADE</button>
      </div>
    </div>
  );
}

function formatPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return 'N/A';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}