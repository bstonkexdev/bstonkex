import { useState, useEffect } from 'react';
import { CHAINS, formatUsd } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { createAlert, getAlerts, deleteAlert, disableAlert, enableAlert, type UserAlert, type AlertType } from '../../lib/engine/alert-engine';
import ChainIcon from '../ChainIcon';

export default function AlertManager() {
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    type: 'price' as AlertType, tokenSymbol: '', tokenAddress: '', chainId: 'bsc' as ChainId,
    condition: 'above' as 'above' | 'below', targetValue: 0, timeframe: '24h', message: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = async () => {
    setLoading(true);
    const data = await getAlerts();
    setAlerts(data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.tokenSymbol || !form.targetValue) return;
    await createAlert({
      type: form.type, tokenSymbol: form.tokenSymbol, tokenAddress: form.tokenAddress,
      chainId: form.chainId, condition: form.condition, targetValue: form.targetValue,
      timeframe: form.timeframe,
      message: form.message || `${form.tokenSymbol} ${form.condition} ${form.type === 'price' ? formatUsd(form.targetValue) : form.targetValue + '%'}`,
    });
    setShowCreate(false);
    setForm({ type: 'price', tokenSymbol: '', tokenAddress: '', chainId: 'bsc', condition: 'above', targetValue: 0, timeframe: '24h', message: '' });
    await loadAlerts();
  };

  const handleDelete = async (id: string) => {
    await deleteAlert(id);
    await loadAlerts();
  };

  const handleToggle = async (alert: UserAlert) => {
    if (alert.status === 'active') await disableAlert(alert.id);
    else await enableAlert(alert.id);
    await loadAlerts();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>ALERTS</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-cyan" style={{ fontSize: 8, padding: '2px 6px' }}
          onClick={() => setShowCreate(v => !v)}>+ NEW</button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ padding: 8, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Type selector */}
            <div style={{ display: 'flex', gap: 3 }}>
              {(['price', 'percent', 'volume', 'whale', 'liquidity'] as AlertType[]).map(t => (
                <button key={t} className={`btn btn-sm ${form.type === t ? 'btn-cyan' : ''}`}
                  style={{ fontSize: 7, padding: '1px 4px' }}
                  onClick={() => setForm(f => ({ ...f, type: t }))}>{t.toUpperCase()}</button>
              ))}
            </div>
            {/* Token */}
            <div style={{ display: 'flex', gap: 4 }}>
              <input className="input" placeholder="Symbol" value={form.tokenSymbol}
                onChange={e => setForm(f => ({ ...f, tokenSymbol: e.target.value.toUpperCase() }))}
                style={{ flex: 1, fontSize: 9 }} />
              <input className="input" placeholder="Address" value={form.tokenAddress}
                onChange={e => setForm(f => ({ ...f, tokenAddress: e.target.value }))}
                style={{ flex: 2, fontSize: 9 }} />
            </div>
            {/* Chain + Condition + Value */}
            <div style={{ display: 'flex', gap: 4 }}>
              <select className="input" value={form.chainId} onChange={e => setForm(f => ({ ...f, chainId: e.target.value as ChainId }))}
                style={{ fontSize: 9, flex: 1 }}>
                {Object.entries(CHAINS).map(([id, c]) => <option key={id} value={id}>{c.shortName}</option>)}
              </select>
              <select className="input" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as any }))}
                style={{ fontSize: 9, flex: 1 }}>
                <option value="above">ABOVE</option>
                <option value="below">BELOW</option>
              </select>
              <input className="input" type="number" placeholder="Value" value={form.targetValue || ''}
                onChange={e => setForm(f => ({ ...f, targetValue: parseFloat(e.target.value) || 0 }))}
                style={{ fontSize: 9, flex: 1 }} />
            </div>
            {/* Timeframe */}
            <div style={{ display: 'flex', gap: 3 }}>
              {['5m', '1h', '6h', '24h'].map(tf => (
                <button key={tf} className={`btn btn-sm ${form.timeframe === tf ? 'btn-cyan' : ''}`}
                  style={{ fontSize: 7, padding: '1px 4px' }}
                  onClick={() => setForm(f => ({ ...f, timeframe: tf }))}>{tf}</button>
              ))}
            </div>
            <button className="btn btn-sm btn-green" onClick={handleCreate}
              style={{ fontSize: 8, padding: '3px 8px' }}>CREATE ALERT</button>
          </div>
        </div>
      )}

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>LOADING...</div>}
        {!loading && alerts.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
            NO ALERTS CONFIGURED<br />
            <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>Create alerts to monitor tokens</span>
          </div>
        )}
        {alerts.map(a => {
          const chain = CHAINS[a.chainId];
          return (
            <div key={a.id} style={{
              padding: '6px 8px', borderBottom: '1px solid rgba(22,40,72,0.3)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {/* Status LED */}
              <span style={{
                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                background: a.status === 'active' ? 'var(--green)' : a.status === 'triggered' ? 'var(--amber)' : 'var(--text-muted)',
              }} />
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-bright)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 4 }}><ChainIcon chainId={a.chainId as ChainId} size={10} /><span style={{ fontSize: 7, padding: '0 2px', border: `1px solid ${chain?.color}`, color: chain?.color }}>{chain?.shortName}</span></span>
                  {a.tokenSymbol} {a.condition.toUpperCase()} {formatUsd(a.targetValue)}
                </div>
                <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>
                  {a.type.toUpperCase()} · {a.status.toUpperCase()}
                  {a.lastTriggered ? ` · LAST: ${new Date(a.lastTriggered).toLocaleTimeString()}` : ''}
                </div>
              </div>
              {/* Actions */}
              <button className="btn btn-sm" style={{ fontSize: 7, padding: '1px 4px' }}
                onClick={() => handleToggle(a)}>{a.status === 'active' ? '⏸' : '▶'}</button>
              <button className="btn btn-sm" style={{ fontSize: 7, padding: '1px 4px', color: 'var(--red)' }}
                onClick={() => handleDelete(a.id)}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}