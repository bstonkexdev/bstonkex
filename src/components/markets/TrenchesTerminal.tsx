// Cupcak8 Swap — Trenches Terminal
// 3-tab real-time launchpad tracking terminal (Ave.ai / GMGN parity).
// Tabs: [🟢 Launchpads (Inner)] [🟡 Migrating 80%+] [🔵 Graduated DEX]

import { useState, useEffect } from 'react';
import type { TrenchesTab, TrenchesToken } from '../../lib/engine/trenches-types';
import { useTrenches, useQuickBuy, ingestToken } from '../../lib/useTrenches';
import { onTokenCreate, getStreamHealth } from '../../lib/engine/discovery/pumpportal-stream';
import TrenchesTokenRow from './TrenchesTokenRow';
import TrenchesQuickBuy from './TrenchesQuickBuy';

const TABS: { key: TrenchesTab; label: string; emoji: string; color: string }[] = [
  { key: 'launchpads', label: 'Launchpads', emoji: '🟢', color: '#22C55E' },
  { key: 'migrating', label: 'Migrating', emoji: '🟡', color: '#EAB308' },
  { key: 'graduated', label: 'Graduated', emoji: '🔵', color: '#3B82F6' },
];

export default function TrenchesTerminal() {
  const [activeTab, setActiveTab] = useState<TrenchesTab>('launchpads');
  const [connected, setConnected] = useState(false);
  const { tokens, stats } = useTrenches(activeTab);
  const quickBuy = useQuickBuy();

  // Wire PumpPortal create events → trenches store
  useEffect(() => {
    const unsub = onTokenCreate((record) => {
      const token: TrenchesToken = {
        address: record.address,
        chainId: 'solana',
        name: record.name || 'Unknown',
        symbol: record.symbol || '???',
        creator: record.creator || '',
        bondingCurveProgress: record.bondingCurveProgress ?? 0,
        spotPriceUsd: record.price || 0,
        virtualMcapUsd: (record.price || 0) * 1e9,
        virtualReserve: record.liquidity || 0,
        virtualTokens: 1e9,
        createdAt: record.createdAt || Date.now(),
        phase: (record.bondingCurveProgress ?? 0) >= 100 ? 'graduated' : (record.bondingCurveProgress ?? 0) >= 80 ? 'migrating' : 'inner',
        launchpadId: 'pumpfun',
        security: {
          risk: 'unknown', score: null, mintAuthority: null, freezeAuthority: null,
          lpLockedPct: null, top10Pct: null, honeypot: null,
          buyTaxPct: null, sellTaxPct: null, auditedAt: null,
        },
        icon: record.icon || null,
        trades24h: null, volume24hUsd: null, liquidityUsd: record.liquidity || null,
      };
      ingestToken(token);
    });

    // Check connection status periodically
    const iv = setInterval(() => {
      const health = getStreamHealth();
      setConnected(health.connected);
    }, 3000);

    return () => { unsub(); clearInterval(iv); };
  }, []);

  return (
    <div style={{
      background: 'var(--bg-elevated, #0F172A)',
      borderRadius: 12, border: '1px solid var(--border, #1E293B)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--border, #1E293B)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text, #F8FAFC)', letterSpacing: '-0.02em' }}>
            TRENCHES
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: connected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: connected ? '#22C55E' : '#EF4444',
          }}>
            {connected ? '● LIVE' : '○ OFFLINE'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 9, color: 'var(--text-dim, #64748B)' }}>
          <span>🟢 {stats.inner}</span>
          <span>🟡 {stats.migrating}</span>
          <span>🔵 {stats.graduated}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border, #1E293B)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer',
              background: activeTab === tab.key ? 'rgba(255,255,255,0.05)' : 'transparent',
              color: activeTab === tab.key ? tab.color : 'var(--text-dim, #64748B)',
              fontSize: 11, fontWeight: activeTab === tab.key ? 700 : 500,
              borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
            {tab.key === 'migrating' && stats.migrating > 0 && (
              <span style={{
                fontSize: 8, padding: '1px 5px', borderRadius: 8,
                background: 'rgba(234,179,8,0.2)', color: '#EAB308', fontWeight: 700,
              }}>
                {stats.migrating}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Column Headers */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: '1px solid var(--border, #1E293B)',
        fontSize: 8, fontWeight: 700, color: 'var(--text-dim, #64748B)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        <div style={{ minWidth: 120 }}>Token</div>
        <div style={{ minWidth: 40, textAlign: 'center' }}>Age</div>
        <div style={{ minWidth: 70, textAlign: 'right' }}>MCap</div>
        <div style={{ flex: 1, minWidth: 100 }}>Bonding Curve</div>
        <div style={{ minWidth: 80 }}>Security</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Token List */}
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {tokens.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            color: 'var(--text-dim, #64748B)', fontSize: 12,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>⚡</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No tokens in this category</div>
            <div style={{ fontSize: 10 }}>New launches appear here in real-time</div>
          </div>
        ) : (
          tokens.slice(0, 50).map(token => (
            <TrenchesTokenRow
              key={token.address}
              token={token}
              onQuickBuy={quickBuy.open}
            />
          ))
        )}
      </div>

      {/* Quick Buy Modal */}
      {quickBuy.selectedToken && (
        <TrenchesQuickBuy
          token={quickBuy.selectedToken}
          amount={quickBuy.amount}
          slippage={quickBuy.slippage}
          priorityLevel={quickBuy.priorityLevel}
          onAmountChange={quickBuy.setAmount}
          onSlippageChange={quickBuy.setSlippage}
          onPriorityChange={quickBuy.setPriorityLevel}
          onClose={quickBuy.close}
        />
      )}
    </div>
  );
}
