// Cupcak8 Swap — Trading Tools Drawer (SL/TP + Order Management)
import { useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../lib/context';
import { CHAINS, formatUsd } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import {
  generateOrderId, getTriggerPrice, shouldTrigger, getOrderTriggerLabel, getOrderStatusInfo,
  type TradingOrder, type CreateOrderParams, type OrderType, type TriggerType, type PositionSize,
} from '../../lib/engine/order-types';

interface Props {
  tokenSymbol: string;
  tokenAddress: string;
  chainId: ChainId;
  tokenPrice: number | null;
  open: boolean;
  onClose: () => void;
}

const TABS = ['STOP LOSS', 'TAKE PROFIT', 'ORDERS'] as const;
type Tab = typeof TABS[number];

export default function TradingToolsDrawer({ tokenSymbol, tokenAddress, chainId, tokenPrice, open, onClose }: Props) {
  const { addNotification } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('STOP LOSS');
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const monitorRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state
  const [triggerType, setTriggerType] = useState<TriggerType>('percentage');
  const [targetPrice, setTargetPrice] = useState('');
  const [percentage, setPercentage] = useState('');
  const [positionSize, setPositionSize] = useState<PositionSize>('full');
  const [partialPct, setPartialPct] = useState('50');

  // Load orders from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`cupcak8_orders_${tokenAddress}_${chainId}`);
      if (saved) setOrders(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [tokenAddress, chainId]);

  // Save orders to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`cupcak8_orders_${tokenAddress}_${chainId}`, JSON.stringify(orders));
    } catch { /* ignore */ }
  }, [orders, tokenAddress, chainId]);

  // Monitor orders against current price
  useEffect(() => {
    if (!open || !tokenPrice || tokenPrice <= 0) return;
    const iv = setInterval(() => {
      setOrders(prev => prev.map(order => {
        if (order.status !== 'active') return order;
        if (shouldTrigger(order, tokenPrice)) {
          addNotification({
            type: 'confirmed',
            title: `${order.type === 'stop_loss' ? 'STOP LOSS' : 'TAKE PROFIT'} TRIGGERED`,
            message: `${tokenSymbol} hit ${formatUsd(tokenPrice)} — ${order.type === 'stop_loss' ? 'SL' : 'TP'} order activated`,
          });
          return { ...order, status: 'triggered' as const, updatedAt: Date.now() };
        }
        return order;
      }));
    }, 2000);
    return () => clearInterval(iv);
  }, [open, tokenPrice, tokenSymbol, addNotification]);

  const resetForm = () => {
    setTargetPrice('');
    setPercentage('');
    setPositionSize('full');
    setPartialPct('50');
  };

  const handleCreate = useCallback(() => {
    if (!tokenPrice || tokenPrice <= 0) return;

    const params: CreateOrderParams = {
      type: activeTab === 'STOP LOSS' ? 'stop_loss' : 'take_profit',
      tokenSymbol, tokenAddress, chainId,
      triggerType,
      targetPrice: triggerType === 'price' ? parseFloat(targetPrice) || null : null,
      percentage: triggerType === 'percentage' ? parseFloat(percentage) || null : null,
      entryPrice: tokenPrice,
      positionSize,
      partialPct: positionSize === 'partial' ? Math.min(100, Math.max(1, parseInt(partialPct) || 50)) : 100,
    };

    // Validation
    if (params.triggerType === 'price' && (params.targetPrice == null || params.targetPrice <= 0)) {
      addNotification({ type: 'failed', title: 'INVALID PRICE', message: 'Enter a valid target price' });
      return;
    }
    if (params.triggerType === 'percentage' && (params.percentage == null || params.percentage === 0)) {
      addNotification({ type: 'failed', title: 'INVALID PERCENTAGE', message: 'Enter a valid percentage' });
      return;
    }

    const order: TradingOrder = {
      id: generateOrderId(),
      ...params,
      side: 'sell',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      executedAt: null,
      txHash: null,
      error: null,
    };

    setOrders(prev => [order, ...prev]);
    resetForm();
    setActiveTab('ORDERS');
    addNotification({
      type: 'confirmed',
      title: `${params.type === 'stop_loss' ? 'STOP LOSS' : 'TAKE PROFIT'} SET`,
      message: `${tokenSymbol} — ${getOrderTriggerLabel(order)} — Monitor active`,
    });
  }, [activeTab, tokenPrice, tokenSymbol, tokenAddress, chainId, triggerType, targetPrice, percentage, positionSize, partialPct, addNotification]);

  const cancelOrder = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' as const, updatedAt: Date.now() } : o));
  };

  const removeOrder = (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  if (!open) return null;

  const activeOrders = orders.filter(o => o.status === 'active' || o.status === 'pending');
  const historyOrders = orders.filter(o => o.status !== 'active' && o.status !== 'pending');

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 249,
        background: 'rgba(61, 43, 31, 0.40)',
        backdropFilter: 'blur(4px)',
      }} />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 300,
        background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
        zIndex: 250, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(92, 61, 46, 0.10)',
        animation: 'drawer-slide-in 0.2s ease-out',
      }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-bright)' }}>
          TRADING TOOLS
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 4, cursor: 'pointer', color: 'var(--text)', fontSize: 16,
        }}>×</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '8px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
            background: activeTab === tab ? 'var(--green-bg)' : 'transparent',
            color: activeTab === tab ? 'var(--green)' : 'var(--text-dim)',
            borderBottom: activeTab === tab ? '2px solid var(--green)' : '2px solid transparent',
            cursor: 'pointer', border: 'none', transition: 'all 0.15s',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {(activeTab === 'STOP LOSS' || activeTab === 'TAKE PROFIT') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.6, padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 4 }}>
              {activeTab === 'STOP LOSS'
                ? `Automatically sell ${tokenSymbol} if price drops to your target. Requires the app to be open to monitor.`
                : `Automatically sell ${tokenSymbol} when price rises to your target. Requires the app to be open to monitor.`
              }
            </div>

            {/* Trigger type */}
            <div>
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>
                TRIGGER
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`slippage-btn ${triggerType === 'percentage' ? 'active' : ''}`}
                  onClick={() => setTriggerType('percentage')}>PERCENTAGE</button>
                <button className={`slippage-btn ${triggerType === 'price' ? 'active' : ''}`}
                  onClick={() => setTriggerType('price')}>PRICE TARGET</button>
              </div>
            </div>

            {/* Percentage input */}
            {triggerType === 'percentage' && (
              <div>
                <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  {activeTab === 'STOP LOSS' ? 'LOSS PERCENTAGE' : 'GAIN PERCENTAGE'}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input" type="number"
                    placeholder={activeTab === 'STOP LOSS' ? '-5' : '10'}
                    value={percentage}
                    onChange={e => setPercentage(e.target.value)}
                    style={{ flex: 1, fontSize: 13, fontWeight: 700, textAlign: 'right' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)' }}>%</span>
                </div>
                {tokenPrice && parseFloat(percentage) !== 0 && !isNaN(parseFloat(percentage)) && (
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 3 }}>
                    Trigger: ~{formatUsd(tokenPrice * (1 + parseFloat(percentage) / 100))} (from {formatUsd(tokenPrice)})
                  </div>
                )}
              </div>
            )}

            {/* Price target input */}
            {triggerType === 'price' && (
              <div>
                <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  TARGET PRICE (USD)
                </span>
                <input className="input" type="number" placeholder="0.00" value={targetPrice}
                  onChange={e => setTargetPrice(e.target.value)}
                  style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }} />
                {tokenPrice && parseFloat(targetPrice) > 0 && (
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 3 }}>
                    {activeTab === 'STOP LOSS'
                      ? `${((1 - parseFloat(targetPrice) / tokenPrice) * 100).toFixed(1)}% below current`
                      : `${((parseFloat(targetPrice) / tokenPrice - 1) * 100).toFixed(1)}% above current`
                    }
                  </div>
                )}
              </div>
            )}

            {/* Position size */}
            <div>
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>
                POSITION SIZE
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`slippage-btn ${positionSize === 'full' ? 'active' : ''}`}
                  onClick={() => setPositionSize('full')}>FULL</button>
                <button className={`slippage-btn ${positionSize === 'partial' ? 'active' : ''}`}
                  onClick={() => setPositionSize('partial')}>PARTIAL</button>
              </div>
              {positionSize === 'partial' && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <input className="input" type="number" placeholder="50" value={partialPct}
                    onChange={e => setPartialPct(e.target.value)}
                    style={{ width: 60, fontSize: 11, fontWeight: 700, textAlign: 'center' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>% of position</span>
                </div>
              )}
            </div>

            {/* Current price */}
            {tokenPrice && (
              <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 4 }}>
                CURRENT: {formatUsd(tokenPrice)}
              </div>
            )}

            {/* Submit button */}
            <button className={`btn btn-lg btn-full ${activeTab === 'STOP LOSS' ? 'btn-red' : 'btn-green'}`}
              onClick={handleCreate}
              disabled={!tokenPrice || tokenPrice <= 0}>
              SET {activeTab === 'STOP LOSS' ? 'STOP LOSS' : 'TAKE PROFIT'}
            </button>
          </div>
        )}

        {activeTab === 'ORDERS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Active orders */}
            {activeOrders.length > 0 && (
              <>
                <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                  ACTIVE ({activeOrders.length})
                </span>
                {activeOrders.map(order => (
                  <OrderCard key={order.id} order={order} onCancel={cancelOrder} onRemove={removeOrder} />
                ))}
              </>
            )}

            {/* History */}
            {historyOrders.length > 0 && (
              <>
                <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.06em', marginTop: 8 }}>
                  HISTORY ({historyOrders.length})
                </span>
                {historyOrders.map(order => (
                  <OrderCard key={order.id} order={order} onCancel={cancelOrder} onRemove={removeOrder} />
                ))}
              </>
            )}

            {orders.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, fontSize: 10, color: 'var(--text-muted)' }}>
                No orders yet. Set a Stop Loss or Take Profit to get started.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 7, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Orders are monitored client-side while the app is open. No automated execution — triggered orders require manual confirmation.
      </div>
    </div>
    </>
  );
}

function OrderCard({ order, onCancel, onRemove }: { order: TradingOrder; onCancel: (id: string) => void; onRemove: (id: string) => void }) {
  const statusInfo = getOrderStatusInfo(order.status);
  const triggerPrice = getTriggerPrice(order);
  const isActive = order.status === 'active';
  const isTerminal = order.status === 'completed' || order.status === 'failed' || order.status === 'cancelled';

  return (
    <div style={{
      padding: '8px 10px', fontSize: 9,
      background: isActive ? 'var(--bg-elevated)' : 'var(--bg-deep)',
      border: `1px solid ${isActive ? 'var(--border-bright)' : 'var(--border)'}`,
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 800, color: order.type === 'stop_loss' ? 'var(--red)' : 'var(--green)', letterSpacing: '0.04em' }}>
          {order.type === 'stop_loss' ? 'STOP LOSS' : 'TAKE PROFIT'}
        </span>
        <span style={{
          fontSize: 7, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
          border: `1px solid ${statusInfo.color}`, color: statusInfo.color,
        }}>
          {statusInfo.label}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, color: 'var(--text-dim)' }}>
        <span>{getOrderTriggerLabel(order)}</span>
        <span>{triggerPrice > 0 ? formatUsd(triggerPrice) : '—'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 8 }}>
        <span>{order.positionSize === 'full' ? 'Full position' : `${order.partialPct}% of position`}</span>
        <span>Entry: {formatUsd(order.entryPrice)}</span>
      </div>
      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        {isActive && (
          <button className="btn btn-sm" style={{ flex: 1, fontSize: 7, padding: '3px 0' }}
            onClick={() => onCancel(order.id)}>
            CANCEL
          </button>
        )}
        {isTerminal && (
          <button className="btn btn-sm" style={{ flex: 1, fontSize: 7, padding: '3px 0' }}
            onClick={() => onRemove(order.id)}>
            REMOVE
          </button>
        )}
        {order.txHash && (
          <span style={{ fontSize: 7, color: 'var(--cyan, #0088FF)', cursor: 'pointer' }}
            onClick={() => window.open(`https://bscscan.com/tx/${order.txHash}`, '_blank')}>
            TX ↗
          </span>
        )}
      </div>
    </div>
  );
}