// Cupcak8 Swap Token Page Data — real feeds for the responsive token trading page.
// Trade events come from the activity engine (source-labelled), user orders/history from
// the tx-tracker trade log (Gitlawb). Nothing here fabricates data.
import { useState, useEffect, useCallback } from 'react';
import type { ChainId } from './config';
import { onActivity, getRecentEvents, getActivityStatus, formatRelativeTime, type MarketEvent } from './engine/activity-engine';
import { getWalletTrades, type TrackedTrade } from './engine/tx-tracker';
import { gitlawb } from './gitlawb';

// ── Trade rows ────────────────────────────────────────────────

export type TradeRowSource = 'indexed' | 'aggregate';

export interface TokenTradeRow {
  id: string;
  time: number;
  side: 'buy' | 'sell' | 'neutral';
  priceUsd: number | null;
  amountUsd: number;
  tokenAmount: number;
  wallet: string;
  txHash: string;
  dex: string;
  /** 'indexed' = real on-chain/Cupcak8 Swap trade · 'aggregate' = derived from real 24h pair stats. */
  source: TradeRowSource;
}

function toRow(e: MarketEvent): TokenTradeRow {
  return {
    id: e.id,
    time: e.timestamp,
    side: e.side,
    priceUsd: e.priceUsd,
    amountUsd: e.amountUsd,
    tokenAmount: e.tokenAmount,
    wallet: e.wallet,
    txHash: e.txHash,
    dex: e.dex,
    source: e.source === 'dexscreener' ? 'aggregate' : 'indexed',
  };
}

/** Live trade feed for one token. Empty address = no on-chain market → no rows. */
export function useTokenTradeFeed(chainId: ChainId, tokenAddress: string, limit = 60) {
  const [rows, setRows] = useState<TokenTradeRow[]>([]);
  const [freshness, setFreshness] = useState<string>('DELAYED');

  useEffect(() => {
    if (!tokenAddress) { setRows([]); return; }
    const matches = (e: MarketEvent) => e.chainId === chainId && e.tokenAddress.toLowerCase() === tokenAddress.toLowerCase();
    const sync = () => {
      setRows(getRecentEvents(limit).filter(matches).map(toRow));
      const s = getActivityStatus();
      setFreshness(s.status === 'live' ? 'LIVE' : s.status === 'delayed' ? 'DELAYED' : s.status === 'stale' ? 'DATA DELAYED' : 'OFFLINE');
    };
    sync();
    const off = onActivity(e => { if (matches(e)) sync(); });
    const iv = window.setInterval(sync, 20_000);
    return () => { off(); window.clearInterval(iv); };
  }, [chainId, tokenAddress, limit]);

  return { rows, freshness };
}

// ── My orders / history (real trade_log records) ──────────────

export function useMyTrades(wallet: string | null, symbols: string[]) {
  const [trades, setTrades] = useState<TrackedTrade[]>([]);
  const [loaded, setLoaded] = useState(false);
  const key = symbols.map(s => s.toUpperCase()).join(',');

  useEffect(() => {
    if (!wallet) { setTrades([]); setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    getWalletTrades(wallet).then(all => {
      if (cancelled) return;
      const wanted = key ? key.split(',') : [];
      setTrades(all.filter(t => wanted.length === 0 || wanted.includes(t.tokenSymbol.toUpperCase())));
      setLoaded(true);
    }).catch(() => { if (!cancelled) { setTrades([]); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [wallet, key]);

  return { trades, loaded };
}

// ── Token alerts (persisted, per user) ────────────────────────

const alertLog = gitlawb.db.collection<{ tokenAddress: string; chainId: string; symbol: string; enabled: boolean }>('token_alerts');

export function useTokenAlert(chainId: ChainId, tokenAddress: string, symbol: string) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenAddress) { setEnabled(false); setReady(true); return; }
    let cancelled = false;
    alertLog.list({ limit: 100 }).then(({ records }) => {
      if (cancelled) return;
      const rec = records.find(r => r.data.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && r.data.chainId === chainId);
      setEnabled(!!rec?.data.enabled);
      setReady(true);
    }).catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [chainId, tokenAddress]);

  const toggle = useCallback(async () => {
    if (!tokenAddress) return;
    try {
      const { records } = await alertLog.list({ limit: 100 });
      const rec = records.find(r => r.data.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && r.data.chainId === chainId);
      const next = !enabled;
      if (rec) await alertLog.update(rec.id, { enabled: next });
      else await alertLog.create({ tokenAddress, chainId, symbol, enabled: next });
      setEnabled(next);
    } catch { /* non-critical */ }
  }, [chainId, tokenAddress, symbol, enabled]);

  return { enabled, ready, toggle };
}

// ── Formatting helpers (honest N/A handling) ──────────────────

export const NA = 'N/A';

export function num(n: number | null | undefined, fmt: (v: number) => string): string {
  return n == null || !isFinite(n) ? NA : fmt(n);
}

/** Real token age from pair creation time. Null = no real data → omit from UI. */
export function formatAge(pairCreatedAt: number | null | undefined): string | null {
  if (!pairCreatedAt || !isFinite(pairCreatedAt)) return null;
  const ms = Date.now() - pairCreatedAt;
  if (ms < 0 || ms > 1000 * 60 * 60 * 24 * 365 * 25) return null;
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${Math.max(1, min)}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo` : `${(d / 365).toFixed(1)}y`;
}

export function clockTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export { formatRelativeTime };
