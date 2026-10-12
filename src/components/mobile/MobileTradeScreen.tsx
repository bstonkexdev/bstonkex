// Cupcak8 Swap Terminal — Mobile Trade Screen
// Streamlined execution form for mobile devices
import { useState } from 'react';
import { useApp } from '../../lib/context';
import type { MarketToken } from '../../lib/market-discovery';

interface Props { token: MarketToken | null; }

type Side = 'buy' | 'sell';

export default function MobileTradeScreen({ token }: Props) {
  const { wallet, connect } = useApp();
  const [side, setSide] = useState<Side>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      {/* Buy/Sell segment */}
      <div style={{ display: 'flex', gap: 0 }}>
        <button onClick={() => setSide('buy')} style={{
          flex: 1, padding: '12px', fontSize: 14, fontWeight: 800,
          background: side === 'buy' ? 'var(--green)' : 'var(--bg-elevated)',
          color: side === 'buy' ? '#000' : 'var(--text-dim)',
          border: '1px solid var(--border)', borderRadius: '8px 0 0 8px',
          cursor: 'pointer',
        }}>
          BUY
        </button>
        <button onClick={() => setSide('sell')} style={{
          flex: 1, padding: '12px', fontSize: 14, fontWeight: 800,
          background: side === 'sell' ? 'var(--red)' : 'var(--bg-elevated)',
          color: side === 'sell' ? '#fff' : 'var(--text-dim)',
          border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 8px 8px 0',
          cursor: 'pointer',
        }}>
          SELL
        </button>
      </div>

      {/* Amount input */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Pay</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Balance: 0.00</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              flex: 1, background: 'var(--bg-deep)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '10px 12px', fontSize: 18, fontWeight: 700,
              color: 'var(--text-bright)', outline: 'none',
            }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-bright)' }}>BNB</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[25, 50, 75, 100].map(pct => (
            <button key={pct} style={{
              flex: 1, padding: '6px', fontSize: 11, fontWeight: 600,
              background: 'var(--bg-deep)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer',
            }}>
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Slippage */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'var(--bg-elevated)',
        border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Slippage</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0.1, 0.5, 1.0].map(s => (
            <button key={s} onClick={() => setSlippage(s)} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600,
              background: slippage === s ? 'var(--yellow-bg)' : 'var(--bg-deep)',
              border: slippage === s ? '1px solid var(--yellow)' : '1px solid var(--border)',
              borderRadius: 4, cursor: 'pointer',
              color: slippage === s ? 'var(--yellow)' : 'var(--text-dim)',
            }}>
              {s}%
            </button>
          ))}
        </div>
      </div>

      {/* Action button */}
      {!wallet.connected ? (
        <button onClick={() => connect('evm')} style={{
          padding: '14px', background: 'var(--yellow)', border: 'none',
          borderRadius: 8, color: '#000', fontSize: 15, fontWeight: 800,
          cursor: 'pointer', marginTop: 8,
        }}>
          Connect Wallet
        </button>
      ) : (
        <button style={{
          padding: '14px', border: 'none', borderRadius: 8,
          fontSize: 15, fontWeight: 800, cursor: 'pointer', marginTop: 8,
          background: side === 'buy' ? 'var(--green)' : 'var(--red)',
          color: side === 'buy' ? '#000' : '#fff',
        }}>
          {side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
        </button>
      )}
    </div>
  );
}