// Cupcak8 Swap — Right Swap Panel (~340px)
// Buy/Sell toggle · Order type tabs · Pay/Receive inputs · Action CTA
import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { CHAINS, formatUsd } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import { getQuote, type TradeQuote } from '../../lib/trading';


interface Props {
  token: MarketToken | null;
  allMarkets: MarketToken[];
  onSelect: (t: MarketToken) => void;
}

type Side = 'buy' | 'sell';
type OrderType = 'market' | 'limit' | 'advanced';
const PCT_BTNS = [25, 50, 75, 100];

export default function RightSwapPanel({ token }: Props) {
  const { wallet, connect, setPage } = useApp();
  const [side, setSide] = useState<Side>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [payAmount, setPayAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [quote, setQuote] = useState<TradeQuote | null>(null);

  const payNum = parseFloat(payAmount) || 0;
  const receiveAmount = quote ? payNum * (quote.toAmount / quote.fromAmount) : payNum * 0.98;

  // Request quote when amount changes
  useEffect(() => {
    if (!token || payNum <= 0) { setQuote(null); return; }
    const timer = setTimeout(() => {
      getQuote({
        chainId: token.chainId,
        tokenIn: side === 'buy' ? CHAINS[token.chainId]?.nativeCurrency?.address ?? '' : token.address,
        tokenOut: side === 'buy' ? token.address : CHAINS[token.chainId]?.nativeCurrency?.address ?? '',
        amount: payNum,
        slippage,
      }).then(setQuote).catch(() => setQuote(null));
    }, 500);
    return () => clearTimeout(timer);
  }, [token, payNum, side, slippage]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
    }}>
      {/* Buy/Sell Toggle */}
      <div style={{
        display: 'flex', gap: 0, padding: '12px 12px 0',
      }}>
        {(['buy', 'sell'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)} style={{
            flex: 1, padding: '12px', fontSize: 14, fontWeight: 800,
            cursor: 'pointer', border: 'none', borderRadius: 'var(--radius-sm)',
            background: side === s
              ? (s === 'buy' ? 'var(--green)' : 'var(--red)')
              : (s === 'buy' ? 'var(--green-bg)' : 'var(--red-bg)'),
            color: side === s ? '#000' : (s === 'buy' ? 'var(--green)' : 'var(--red)'),
            transition: 'all 0.15s',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{s}</button>
        ))}
      </div>

      {/* Order Type Tabs */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 12px',
      }}>
        {(['market', 'limit', 'advanced'] as const).map(ot => (
          <button key={ot} onClick={() => setOrderType(ot)} style={{
            flex: 1, padding: '7px 10px', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            background: orderType === ot ? 'var(--bg-elevated)' : 'transparent',
            border: orderType === ot ? '1px solid var(--border-bright)' : '1px solid transparent',
            color: orderType === ot ? 'var(--text-bright)' : 'var(--text-dim)',
            transition: 'all 0.15s', textTransform: 'capitalize',
          }}>{ot}</button>
        ))}
      </div>

      {/* Pay Input Card */}
      <div style={{
        margin: '0 12px', padding: '14px',
        background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Pay</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            Balance: {wallet.connected ? '0.00' : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number"
            value={payAmount}
            onChange={e => setPayAmount(e.target.value)}
            placeholder="0.00"
            style={{
              flex: 1, background: 'var(--bg-deep)', border: 'none',
              fontSize: 20, fontWeight: 700, color: 'var(--text-bright)',
              fontFamily: 'var(--font-mono)', outline: 'none',
              padding: '8px 0',
            }}
          />
          <button style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', background: 'var(--bg-deep)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-bright)', fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
          }}>
            {side === 'buy' ? 'BNB' : token?.symbol ?? 'TOKEN'} ▾
          </button>
        </div>
      </div>

      {/* Percentage Quick-Select */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 12px',
      }}>
        {PCT_BTNS.map(pct => (
          <button key={pct} style={{
            flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text-dim)',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--green)';
              e.currentTarget.style.color = 'var(--green)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-dim)';
            }}
          >{pct}%</button>
        ))}
      </div>

      {/* Receive Output Card */}
      <div style={{
        margin: '0 12px', padding: '14px',
        background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>Receive (est.)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            flex: 1, fontSize: 20, fontWeight: 700,
            color: payNum > 0 ? 'var(--text-bright)' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            {payNum > 0 ? receiveAmount.toFixed(4) : '0.00'}
          </span>
          <span style={{
            padding: '6px 12px', background: 'var(--bg-deep)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-bright)', fontSize: 12, fontWeight: 700,
          }}>
            {side === 'buy' ? token?.symbol ?? 'TOKEN' : 'BNB'}
          </span>
        </div>
      </div>

      {/* Action CTA */}
      <div style={{ padding: '12px 12px 0' }}>
        {!wallet.connected ? (
          <button onClick={() => connect('evm')} style={{
            width: '100%', padding: '16px',
            background: 'var(--green)', border: 'none',
            borderRadius: 'var(--radius)', cursor: 'pointer',
            color: '#000', fontSize: 15, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.04em',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--green-dim)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--green)'}
          >Connect Wallet</button>
        ) : (
          <button onClick={() => setPage('trade')} style={{
            width: '100%', padding: '16px',
            background: side === 'buy' ? 'var(--green)' : 'var(--red)',
            border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
            color: '#000', fontSize: 15, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.04em',
            transition: 'background 0.15s',
          }}>
            {side} {token?.symbol ?? 'TOKEN'}
          </button>
        )}
      </div>

      {/* Slippage Settings */}
      <div style={{ padding: '8px 12px' }}>
        <button onClick={() => setShowSettings(!showSettings)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-dim)', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ⚙ Slippage: {slippage}% {showSettings ? '▴' : '▾'}
        </button>
        {showSettings && (
          <div style={{
            display: 'flex', gap: 6, marginTop: 8,
          }}>
            {[0.1, 0.5, 1.0, 3.0].map(v => (
              <button key={v} onClick={() => setSlippage(v)} style={{
                flex: 1, padding: '6px', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                background: slippage === v ? 'var(--green-bg)' : 'var(--bg-elevated)',
                border: slippage === v ? '1px solid var(--green)' : '1px solid var(--border)',
                color: slippage === v ? 'var(--green)' : 'var(--text-dim)',
              }}>{v}%</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Footer Badge */}
      <div style={{
        margin: '0 12px 12px', padding: '14px',
        background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-pixel)', fontSize: 8,
          color: '#E8547C', letterSpacing: '0.06em',
          marginTop: 6,
        }}>Cupcak8 Swap</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
          Multi-chain · Non-custodial
        </div>
      </div>
    </div>
  );
}