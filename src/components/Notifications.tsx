import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, shortenAddress, explorerTxUrl } from '../lib/config';
import type { TxNotification } from '../lib/context';

export default function Notifications() {
  const { notifications, clearNotification } = useApp();
  const [open, setOpen] = useState(false);

  const unread = notifications.filter(n => !n.read).length;

  if (notifications.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-sm" onClick={() => setOpen(!open)}
        style={{ minWidth: 0, padding: '4px 6px', position: 'relative' }}>
        <BellIcon />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, width: 10, height: 10,
            borderRadius: '50%', background: 'var(--amber)', border: '1px solid var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 6, fontWeight: 900, color: 'var(--bg)',
          }}>
            {unread > 9 ? '9' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          width: 300, maxHeight: 360, overflowY: 'auto',
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          zIndex: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <div className="panel-header">
            <span className="led" />
            NOTIFICATIONS
            <div style={{ flex: 1 }} />
            <button style={{
              background: 'none', border: 'none', color: 'var(--text-dim)',
              cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 8,
            }} onClick={() => { notifications.forEach(n => clearNotification(n.id)); }}>
              CLEAR
            </button>
          </div>
          {notifications.slice(0, 20).map(n => (
            <NotificationItem key={n.id} notification={n} />
          ))}
          {notifications.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
              NO NOTIFICATIONS
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification: n }: { notification: TxNotification }) {
  const statusColors: Record<string, string> = {
    pending: 'var(--amber)',
    confirmed: 'var(--green)',
    failed: 'var(--red)',
    approval: 'var(--cyan)',
    market: 'var(--cyan)',
    whale: '#00d4ff',
    alert: 'var(--amber)',
    info: 'var(--text-dim)',
  };
  const color = statusColors[n.type] || 'var(--text-dim)';
  const priorityBorder = n.priority === 'critical' ? 'var(--red)' : n.priority === 'warning' ? 'var(--amber)' : n.priority === 'important' ? 'var(--cyan)' : 'transparent';

  return (
    <div style={{
      padding: '8px 10px', borderBottom: '1px solid var(--border)',
      borderLeft: `2px solid ${priorityBorder}`,
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span className="led-sm" style={{
        background: color, boxShadow: `0 0 4px ${color}44`,
        marginTop: 2, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 2 }}>
          {n.title}
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-dim)', lineHeight: 1.4 }}>
          {n.message}
        </div>
        {n.txHash && n.chainId && (
          <a href={explorerTxUrl(n.chainId, n.txHash)} target="_blank" rel="noopener"
            style={{ fontSize: 7, color: 'var(--cyan)', textDecoration: 'underline', marginTop: 2, display: 'inline-block' }}>
            {shortenAddress(n.txHash, 6)} ↗
          </a>
        )}
      </div>
      <span style={{ fontSize: 7, color: 'var(--text-muted)', flexShrink: 0 }}>
        {formatTime(n.timestamp)}
      </span>
    </div>
  );
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

function BellIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}