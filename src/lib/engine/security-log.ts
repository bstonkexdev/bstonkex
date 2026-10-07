// BSTONKEX Security Logger — Centralized security/execution event logging
// Never logs private keys, seed phrases, or wallet secrets.
import { gitlawb } from '../gitlawb';

export type SecurityEventType =
  | 'quote_created' | 'quote_expired' | 'quote_invalidated'
  | 'simulation_passed' | 'simulation_failed' | 'simulation_unavailable'
  | 'approval_requested' | 'approval_granted' | 'approval_insufficient'
  | 'tx_submitting' | 'tx_submitted' | 'tx_pending' | 'tx_confirmed' | 'tx_failed' | 'tx_rejected' | 'tx_reverted'
  | 'route_validation_failed' | 'route_changed' | 'untrusted_router'
  | 'wrong_network' | 'network_changed' | 'account_changed'
  | 'insufficient_balance' | 'insufficient_gas' | 'insufficient_allowance'
  | 'slippage_exceeded' | 'price_impact_high' | 'price_impact_extreme'
  | 'double_submit_blocked' | 'trade_readiness_failed'
  | 'emergency_pause' | 'emergency_resume'
  | 'security_warning_acknowledged';

export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecuritySeverity;
  message: string;
  chain?: string;
  token?: string;
  wallet?: string; // truncated address only
  txHash?: string; // public hash only
  metadata?: Record<string, string | number | boolean>; // no secrets
}

// In-memory log (last 200 events)
const eventLog: (SecurityEvent & { timestamp: number })[] = [];
const MAX_LOG = 200;

let listeners: ((event: SecurityEvent & { timestamp: number }) => void)[] = [];

export function onSecurityEvent(cb: (event: SecurityEvent & { timestamp: number }) => void): () => void {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

/** Log a security event. Never includes secrets. */
export function logSecurityEvent(event: SecurityEvent): void {
  const entry = { ...event, timestamp: Date.now() };
  eventLog.push(entry);
  if (eventLog.length > MAX_LOG) eventLog.splice(0, eventLog.length - MAX_LOG);
  listeners.forEach(l => l(entry));

  // Persist to Gitlawb (non-blocking, best-effort)
  try {
    const col = gitlawb.db.collection<Record<string, any>>('security_log', { visibility: 'inbox' });
    col.create({
      type: event.type,
      severity: event.severity,
      message: event.message,
      chain: event.chain || '',
      token: event.token || '',
      wallet: event.wallet || '',
      txHash: event.txHash || '',
    }).catch(() => {});
  } catch { /* non-critical */ }
}

/** Get recent security events. */
export function getSecurityLog(limit = 50): (SecurityEvent & { timestamp: number })[] {
  return eventLog.slice(-limit);
}

/** Get events by type. */
export function getEventsByType(type: SecurityEventType, limit = 20): (SecurityEvent & { timestamp: number })[] {
  return eventLog.filter(e => e.type === type).slice(-limit);
}

/** Get events by severity. */
export function getEventsBySeverity(severity: SecuritySeverity, limit = 20): (SecurityEvent & { timestamp: number })[] {
  return eventLog.filter(e => e.severity === severity).slice(-limit);
}

/** Format event for display. */
export function formatEventTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

/** Severity color for UI. */
export function severityColor(s: SecuritySeverity): string {
  switch (s) {
    case 'info': return 'var(--text-dim)';
    case 'low': return 'var(--green)';
    case 'medium': return 'var(--amber)';
    case 'high': return 'var(--red)';
    case 'critical': return 'var(--red)';
  }
}