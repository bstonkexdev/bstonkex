// Cupcak8 — Major Crypto Price Cards (compact single-row)
// BTC | ETH | BNB | SOL — real CoinGecko data
import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { fetchMajorQuotes, type MajorQuote, type ProviderStatus } from '../../lib/major-assets';

interface PriceCard {
  cgId: string;
  symbol: string;
  name: string;
}

const MAJOR_CARDS: PriceCard[] = [
  { cgId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { cgId: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { cgId: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { cgId: 'solana', symbol: 'SOL', name: 'Solana' },
];

const LOGOS: Record<string, string> = {
  bitcoin: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ethereum: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  binancecoin: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  solana: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
};

export default function MajorPriceCards() {
  const { setPage, setTradeToken } = useApp();
  const [quotes, setQuotes] = useState<Record<string, MajorQuote>>({});
  const [status, setStatus] = useState<ProviderStatus>('ok');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetchMajorQuotes().then(result => {
        if (cancelled) return;
        setQuotes(result.quotes);
        setStatus(result.status);
        setLoading(false);
      }).catch(() => {
        if (cancelled) return;
        setStatus('error');
        setLoading(false);
      });
    }
    load();
    const iv = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const handleCardClick = (card: PriceCard) => {
    setTradeToken({
      chainId: 'bsc', address: '',
      name: card.name, symbol: card.symbol,
      coingeckoId: card.cgId,
    });
    setPage('token');
  };

  return (
    <div style={{
      display: 'flex',
      gap: 6,
      padding: '10px 12px 14px',
      maxWidth: 700,
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
      background: 'var(--bg-surface)',
      borderBottom: '2px solid var(--border)',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      flexShrink: 0,
      position: 'relative',
      zIndex: 1,
    }}>
      <style>{`.major-price-strip::-webkit-scrollbar { display: none; }`}</style>
      {MAJOR_CARDS.map(card => {
        const q = quotes[card.cgId];
        const price = q?.price ?? null;
        const change = q?.change24h ?? null;
        const isUp = (change ?? 0) >= 0;
        const img = q?.image ?? LOGOS[card.cgId];

        return (
          <div
            key={card.cgId}
            className="major-price-strip"
            onClick={() => handleCardClick(card)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              flex: '1 1 0',
              minWidth: 80,
              padding: '6px 4px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              transition: 'border-color 0.12s',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8547C'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            {loading ? (
              <div style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>...</div>
            ) : status === 'error' ? (
              <div style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>—</div>
            ) : (
              <>
                {/* Row 1: logo + ticker */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  minWidth: 0,
                }}>
                  {img ? (
                    <img src={img} alt={card.symbol} width={14} height={14}
                      style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: '#E8547C', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 7, fontWeight: 900, color: '#fff',
                      flexShrink: 0,
                    }}>{card.symbol.charAt(0)}</div>
                  )}
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 10,
                    color: 'var(--text-bright)', whiteSpace: 'nowrap',
                  }}>{card.symbol}</span>
                </div>
                {/* Row 2: price */}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10,
                  color: 'var(--text-bright)', whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}>
                  {price != null
                    ? `$${price >= 1000
                        ? price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                        : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                      }`
                    : '—'}
                </span>
                {/* Row 3: 24h change */}
                {change != null ? (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 8,
                    color: isUp ? '#22C55E' : '#EF5350', whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}>{isUp ? '+' : ''}{change.toFixed(1)}%</span>
                ) : (
                  <span style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'center' }}>—</span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}