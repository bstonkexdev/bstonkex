// Cupcak8 Swap — TP/SL Order Panel
// Client-side stop-loss & take-profit order management.
// Orders are stored locally and monitored while the app is open.
// When price triggers, shows notification (actual execution requires wallet).

import { useState, useEffect, useCallback } from 'react';
import {
  type TradingOrder, type OrderType, type TriggerType, type PositionSize,
  generateOrderId, getTriggerPrice, shouldTrigger, getOrderTriggerLabel, getOrderStatusInfo,
} from '../../lib/engine/order-types';
import type { ChainId } from '../../lib/config';
import { microPrice } from '../../lib/micro-price';

interface Props {
  chainId: ChainId;
  tokenAddress: string;
  tokenSymbol: string;
  currentPrice: number | null;
  onTrigger?: (order: TradingOrder) => void;
}

const BG = '#12161f';
const BORDER = 'rgba(255,255,255,0.06)';
const GREEN = '#10b981';
const RED = '#ef4444';
const AMBER = '#FFD700';
const CYAN = '#0088FF';
const TEXT_DIM = 'rgba(255,255,255,0.35)';

// ── Order Storage (client-side) ─────────────────────────────

const STORAGE_KEY = 'cupcak8_orders';

function loadOrders(): TradingOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveOrders(orders: TradingOrder[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)); } catch { /* */ }
}

// ── Main Component ──────────────────────────────────────────

export default function OrderPanel({ chainId, tokenAddress, tokenSymbol, currentPrice, onTrigger }: Props) {
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('take_profit');
  const [triggerType, setTriggerType] = useState<TriggerType>('percentage');
  const [targetPrice, setTargetPrice] = useState('');
  const [percentage, setPercentage] = useState('');
  const [positionSize, setPositionSize] = useState<PositionSize>('full');
  const [partialPct, setPartialPct] = useState('50');

  // Load orders on mount
  useEffect(() => {
    setOrders(loadOrders().filter(o => o.tokenAddress === tokenAddress && o.chainId === chainId));
  }, [tokenAddress, chainId]);

  // Monitor orders for triggers
  useEffect(() => {
    if (!currentPrice || currentPrice <= 0) return;
    const allOrders = loadOrders();
    let changed = false;

    for (const order of allOrders) {
      if (order.tokenAddress !== tokenAddress || order.chainId !== chainId) continue;
      if (shouldTrigger(order, currentPrice)) {
        order.status = 'triggered';
        order.executedAt = Date.now();
        changed = true;
        onTrigger?.(order);
      }
    }

    if (changed) {
      saveOrders(allOrders);
      setOrders(allOrders.filter(o => o.tokenAddress === tokenAddress && o.chainId === chainId));
    }
  }, [currentPrice, tokenAddress, chainId, onTrigger]);

  const createOrder = useCallback(() => {
    const entryPrice = currentPrice || 0;
    if (entryPrice <= 0) return;

    const newOrder: TradingOrder = {
      id: generateOrderId(),
      type: orderType,
      tokenSymbol,
      tokenAddress,
      chainId,
      side: 'sell',
      triggerType,
      targetPrice: triggerType === 'price' ? parseFloat(targetPrice) || null : null,
      percentage: triggerType === 'percentage' ? parseFloat(percentage) || null : null,
      entryPrice,
      positionSize,
      partialPct: positionSize === 'partial' ? parseFloat(partialPct) || 50 : 100,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      executedAt: null,
      txHash: null,
      error: null,
    };

    const allOrders = [...loadOrders(), newOrder];
    saveOrders(allOrders);
    setOrders(prev => [...prev, newOrder]);
    setShowCreate(false);
    setTargetPrice('');
    setPercentage('');
  }, [orderType, triggerType, targetPrice, percentage, positionSize, partialPct, currentPrice, tokenSymbol, tokenAddress, chainId]);

  const cancelOrder = useCallback((id: string) => {
    const allOrders = loadOrders().map(o => o.id === id ? { ...o, status: 'cancelled' as const, updatedAt: Date.now() } : o);
    saveOrders(allOrders);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' as const } : o));
  }, []);

  const removeOrder = useCallback((id: string) => {
    const allOrders = loadOrders().filter(o => o.id !== id);
    saveOrders(allOrders);
    setOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  const activeOrders = orders.filter(o => o.status === 'active');
  const completedOrders = orders.filter(o => o.status !== 'active');

  return (
    <div style={{ background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          TP/SL ORDERS
        </span>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
          border: `1px solid ${CYAN}`, background: 'transparent', color: CYAN, cursor: 'pointer',
        }}>+ NEW</button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Order Type */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['take_profit', 'stop_loss'] as OrderType[]).map(t => (
              <button key={t} onClick={() => setOrderType(t)} style={{
                flex: 1, fontSize: 9, fontWeight: 700, padding: '5px 0', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: orderType === t ? (t === 'take_profit' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)') : 'rgba(255,255,255,0.03)',
                color: orderType === t ? (t === 'take_profit' ? GREEN : RED) : TEXT_DIM,
              }}>{t === 'take_profit' ? 'TAKE PROFIT' : 'STOP LOSS'}</button>
            ))}
          </div>

          {/* Trigger Type */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['percentage', 'price'] as TriggerType[]).map(t => (
              <button key={t} onClick={() => setTriggerType(t)} style={{
                flex: 1, fontSize: 9, fontWeight: 700, padding: '4px 0', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: triggerType === t ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                color: triggerType === t ? '#a78bfa' : TEXT_DIM,
              }}>{t === 'percentage' ? '% TRIGGER' : 'PRICE TARGET'}</button>
            ))}
          </div>

          {/* Input */}
          {triggerType === 'percentage' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: TEXT_DIM }}>{orderType === 'stop_loss' ? '↓' : '↑'}</span>
              <input type="number" value={percentage} onChange={e => setPercentage(e.target.value)}
                placeholder={orderType === 'stop_loss' ? '-20' : '100'}
                style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 8px', borderRadius: 4, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.03)', color: '#fff', fontFamily: 'monospace' }} />
              <span style={{ fontSize: 9, color: TEXT_DIM }}>%</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: TEXT_DIM }}>$</span>
              <input type="number" value={targetPrice} onChange={e => setTargetPrice(e.target.value)}
                placeholder={currentPrice ? currentPrice.toFixed(8) : '0.00000000'}
                step="0.00000001"
                style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 8px', borderRadius: 4, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.03)', color: '#fff', fontFamily: 'monospace' }} />
            </div>
          )}

          {/* Position Size */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['full', 'partial'] as PositionSize[]).map(s => (
              <button key={s} onClick={() => setPositionSize(s)} style={{
                flex: 1, fontSize: 9, fontWeight: 700, padding: '4px 0', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: positionSize === s ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                color: positionSize === s ? '#3b82f6' : TEXT_DIM,
              }}>{s === 'full' ? '100% SELL' : `${partialPct}% SELL`}</button>
            ))}
          </div>
          {positionSize === 'partial' && (
            <input type="range" min={5} max={95} step={5} value={partialPct} onChange={e => setPartialPct(e.target.value)}
              style={{ width: '100%', accentColor: '#3b82f6' }} />
          )}

          {/* Trigger Price Preview */}
          {currentPrice && currentPrice > 0 && (
            <div style={{ fontSize: 8, color: TEXT_DIM, textAlign: 'center' }}>
              Entry: {microPrice(currentPrice, '')} → Trigger: {triggerType === 'percentage' && percentage ?
                microPrice(currentPrice * (1 + parseFloat(percentage) / 100), '') :
                targetPrice ? microPrice(parseFloat(targetPrice), '') : '—'}
            </div>
          )}

          {/* Create Button */}
          <button onClick={createOrder} disabled={!currentPrice || currentPrice <= 0} style={{
            fontSize: 10, fontWeight: 800, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: orderType === 'take_profit' ? GREEN : RED, color: '#fff', opacity: (!currentPrice || currentPrice <= 0) ? 0.4 : 1,
          }}>
            CREATE {orderType === 'take_profit' ? 'TAKE PROFIT' : 'STOP LOSS'}
          </button>
        </div>
      )}

      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div style={{ padding: '6px 12px' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: GREEN, letterSpacing: '0.1em', marginBottom: 4 }}>ACTIVE ({activeOrders.length})</div>
          {activeOrders.map(order => (
            <div key={order.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
              <div>
                <span style={{ fontSize: 9, fontWeight: 800, color: order.type === 'take_profit' ? GREEN : RED }}>
                  {order.type === 'take_profit' ? 'TP' : 'SL'}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 6 }}>{getOrderTriggerLabel(order)}</span>
                {order.positionSize === 'partial' && (
                  <span style={{ fontSize: 8, color: TEXT_DIM, marginLeft: 4 }}>({order.partialPct}%)</span>
                )}
              </div>
              <button onClick={() => cancelOrder(order.id)} style={{
                fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                border: `1px solid ${RED}`, background: 'transparent', color: RED, cursor: 'pointer',
              }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Completed/Triggered Orders */}
      {completedOrders.length > 0 && (
        <div style={{ padding: '6px 12px', maxHeight: 120, overflowY: 'auto' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.1em', marginBottom: 4 }}>HISTORY</div>
          {completedOrders.slice(0, 10).map(order => {
            const info = getOrderStatusInfo(order.status);
            return (
              <div key={order.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                <div>
                  <span style={{ fontSize: 8, fontWeight: 800, color: order.type === 'take_profit' ? GREEN : RED }}>
                    {order.type === 'take_profit' ? 'TP' : 'SL'}
                  </span>
                  <span style={{ fontSize: 8, color: TEXT_DIM, marginLeft: 4 }}>{getOrderTriggerLabel(order)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 7, fontWeight: 800, color: info.color }}>{info.label}</span>
                  <button onClick={() => removeOrder(order.id)} style={{
                    fontSize: 7, border: 'none', background: 'transparent', color: TEXT_DIM, cursor: 'pointer', padding: '0 2px',
                  }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {orders.length === 0 && !showCreate && (
        <div style={{ padding: '20px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: TEXT_DIM }}>No orders set</div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
            Create TP/SL to manage risk while app is open
          </div>
        </div>
      )}
    </div>
  );
}