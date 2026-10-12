// Cupcak8 — Mobile Homepage
// Hero · Market · Assets · Info
import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { CONFIGURED_CHAINS } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { getDiscovery, type MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';
import MascotLogo from '../MascotLogo';
import MobileMarketCards from './MobileMarketCards';

type View = 'home' | 'market' | 'assets' | 'info';
const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'market', label: 'Market', icon: '◈' },
  { id: 'assets', label: 'Assets', icon: '⬡' },
  { id: 'info', label: 'Info', icon: 'ℹ' },
];

export default function MobileHomepage() {
  const { setPage, setTradeToken, wallet, connect } = useApp();
  const [view, setView] = useState<View>('home');
  const [hotMarkets, setHotMarkets] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDiscovery('volume').then(vol => {
      setHotMarkets(vol.slice(0, 20));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
      background: 'var(--bg-deep)', paddingBottom: 56,
    }}>
      {/* Sticky Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <MascotLogo size={24} color="#E8547C" />
        <span style={{
          fontFamily: 'var(--font-pixel)', fontSize: 10,
          color: '#E8547C', flex: 1,
        }}>Cupcak8 Swap</span>
        {!wallet.connected ? (
          <button onClick={() => connect('evm')} style={{
            padding: '6px 14px', background: '#E8547C', border: 'none',
            borderRadius: 'var(--radius-sm)', color: '#fff',
            fontSize: 11, fontWeight: 800, cursor: 'pointer',
          }}>Connect</button>
        ) : (
          <button onClick={() => setPage('portfolio')} style={{
            padding: '6px 10px', background: 'var(--green-bg)',
            border: '1px solid #E8547C', borderRadius: 'var(--radius-sm)',
            color: '#E8547C', fontSize: 10, fontWeight: 700,
            fontFamily: 'var(--font-mono)', cursor: 'pointer',
          }}>
            {wallet.address?.slice(0, 4)}..{wallet.address?.slice(-3)}
          </button>
        )}
      </div>

      {/* View Switcher Tabs */}
      <div style={{
        display: 'flex', gap: 0, background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)', padding: '0 12px',
      }}>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            flex: 1, padding: '10px 8px', fontSize: 11, fontWeight: 600,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: view === v.id ? '#E8547C' : 'var(--text-dim)',
            borderBottom: view === v.id ? '2px solid #E8547C' : '2px solid transparent',
            transition: 'all 0.15s',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: 14 }}>{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {view === 'home' && <MobileHomeView markets={hotMarkets} loading={loading} />}
        {view === 'market' && (
          <MobileMarketCards
            tokens={hotMarkets}
            loading={loading}
            onSelect={(t) => {
              setTradeToken({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol });
            }}
          />
        )}
        {view === 'assets' && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Portfolio</div>
            <div style={{ fontSize: 11 }}>Connect wallet to view your assets</div>
            {!wallet.connected && (
              <button onClick={() => connect('evm')} style={{
                marginTop: 16, padding: '12px 24px',
                background: '#E8547C', border: 'none',
                borderRadius: 'var(--radius)', color: '#fff',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}>Connect Wallet</button>
            )}
          </div>
        )}
        {view === 'info' && (
          <div style={{ padding: 20 }}>
            <div style={{
              padding: 16, background: 'var(--bg-surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MascotLogo size={28} color="#E8547C" />
                <span style={{ fontFamily: 'var(--font-pixel)', fontSize: 9, color: '#E8547C' }}>Cupcak8 Swap</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                Sweet Looks. Serious Trading. A multichain crypto trading terminal.
              </div>
            </div>
            <div style={{
              padding: 16, background: 'var(--bg-surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>
                Supported Chains
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CONFIGURED_CHAINS.map(c => (
                  <span key={c.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 10px', background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)', borderRadius: 20,
                    fontSize: 11, color: 'var(--text)', fontWeight: 600,
                  }}>
                    <ChainIcon chainId={c.id as ChainId} size={14} />
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileHomeView({ markets, loading }: { markets: MarketToken[]; loading: boolean }) {
  return (
    <div>
      {/* Hero */}
      <div style={{
        padding: '36px 20px 28px', textAlign: 'center',
        background: 'linear-gradient(180deg, #FFF5EB 0%, var(--bg-deep) 100%)',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Brand tag */}
        <div style={{
          display: 'inline-block', marginBottom: 12,
          padding: '3px 10px', borderRadius: 16,
          background: 'rgba(232,84,124,0.08)', border: '1px solid rgba(232,84,124,0.2)',
        }}>
          <span style={{
            fontFamily: 'var(--font-pixel)', fontSize: 7, color: '#E8547C',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>Cupcak8 Swap · Sweet Looks. Serious Trading.</span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-pixel)', fontSize: 14, color: '#3D2B1F',
          margin: '0 0 8px', lineHeight: 1.6,
        }}>Your Next Move<br />Starts Here.</h1>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Discover tokens, explore multichain markets, and trade — all from one terminal.
        </p>
      </div>


    </div>
  );
}