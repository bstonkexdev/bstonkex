// Cupcak8 Swap — Bottom Dock (Open Orders, Positions, History, PnL)
// Cupcak8-themed tabs with warm cream background
import { useState } from 'react';
import { useApp } from '../../lib/context';

type Tab = 'orders' | 'history' | 'positions' | 'pnl';

export default function BottomDock() {
  const { wallet } = useApp();
  const [tab, setTab] = useState<Tab>('orders');

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'orders', label: 'Open Orders', count: 0 },
    { id: 'positions', label: 'Positions', count: 0 },
    { id: 'history', label: 'Trade History' },
    { id: 'pnl', label: 'PnL' },
  ];

  return (
    <div className="bottom-dock">
      {/* Tabs */}
      <div className="bottom-dock-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`bottom-dock-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}{t.count != null ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!wallet.connected ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔗</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
              Connect Wallet
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Connect your wallet to view orders, positions, and trade history
            </div>
          </div>
        ) : tab === 'orders' ? (
          <table>
            <thead>
              <tr>
                <th>Pair</th><th>Type</th><th>Side</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Filled</th>
                <th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 12 }}>
                  No open orders
                </td>
              </tr>
            </tbody>
          </table>
        ) : tab === 'positions' ? (
          <table>
            <thead>
              <tr>
                <th>Pair</th><th>Side</th>
                <th style={{ textAlign: 'right' }}>Entry</th>
                <th style={{ textAlign: 'right' }}>Current</th>
                <th style={{ textAlign: 'right' }}>Size</th>
                <th style={{ textAlign: 'right' }}>PnL</th>
                <th style={{ textAlign: 'right' }}>PnL %</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 12 }}>
                  No open positions
                </td>
              </tr>
            </tbody>
          </table>
        ) : tab === 'history' ? (
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Pair</th><th>Side</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 12 }}>
                  No trade history
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
              Portfolio PnL Tracking
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Realized and unrealized PnL will appear here after your first trade
            </div>
          </div>
        )}
      </div>
    </div>
  );
}