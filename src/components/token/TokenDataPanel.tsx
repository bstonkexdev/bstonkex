// Cupcak8 Swap — Token data panel: one view per tab (real modules only, honest empty states)
import type { ChainId } from '../../lib/config';
import { CHAINS, PLATFORM_FEE_BPS, formatUsd, formatNum, shortenAddress, explorerAddressUrl } from '../../lib/config';
import type { TokenData } from '../../lib/market';
import type { SafetyReport } from '../../lib/engine/token-safety';
import type { TrackedTrade } from '../../lib/engine/tx-tracker';
import { formatRelativeTime, type TokenTradeRow } from '../../lib/token-page-data';
import { BuySellPressure, LiquidityPanel, RiskPanel, ContractPanel, HolderConcentration } from '../TokenProfile';
import { getHolders, type HolderData } from '../../lib/market';
import { useState, useEffect } from 'react';
import TradeList from './TradeList';
import type { PanelTab } from './TokenTabs';

interface Props {
  tab: PanelTab;
  chainId: ChainId;
  tokenAddress: string;
  symbol: string;
  token: TokenData | null;
  safety: SafetyReport | null;
  trades: TokenTradeRow[];
  tradeFreshness: string;
  myTrades: TrackedTrade[];
  myTradesLoaded: boolean;
  walletAddress: string | null;
  priceSource: string;
  candleSource: string;
  majorAssetId: string | null;
  routeLabel: string | null;
  routeAddress: string | null;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value" style={tone ? { color: tone } : undefined}>{value}</span>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{title}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>{hint}</div>
    </div>
  );
}

function MyTradesTable({ trades }: { trades: TrackedTrade[] }) {
  return (
    <div className="panel-scroll">
      <table className="trade-table">
        <thead>
          <tr>
            <th>TIME</th><th>SIDE</th><th className="right">USD</th><th>TOKEN</th><th>STATUS</th><th>TX</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => (
            <tr key={t.id}>
              <td className="text-dim">{formatRelativeTime(t.timestamp)}</td>
              <td>
                <span style={{
                  fontSize: 7, fontWeight: 800, padding: '1px 4px',
                  border: `1px solid ${t.side === 'buy' ? 'var(--green)' : 'var(--red)'}`,
                  color: t.side === 'buy' ? 'var(--green)' : 'var(--red)',
                }}>{t.side.toUpperCase()}</span>
              </td>
              <td className="right">{formatUsd(t.amountUsd)}</td>
              <td>{t.tokenSymbol}</td>
              <td style={{
                fontSize: 7, fontWeight: 800,
                color: t.status === 'confirmed' ? 'var(--green)' : t.status === 'failed' ? 'var(--red)' : 'var(--amber, #FFD700)',
              }}>{t.status.toUpperCase()}</td>
              <td>
                <a href={t.explorerUrl} target="_blank" rel="noopener" style={{ fontSize: 8 }}>
                  {shortenAddress(t.txHash, 3)} ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldersPanel({ chainId, address }: { chainId: ChainId; address: string }) {
  const [holders, setHolders] = useState<HolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getHolders(chainId, address).then(data => {
      if (cancelled) return;
      setHolders(data);
      setSource(chainId === 'solana' ? 'Solana RPC' : 'GoPlus Security API');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [chainId, address]);

  if (loading) return <Empty title="LOADING HOLDERS…" hint="Fetching on-chain holder distribution data." />;
  if (holders.length === 0) return <Empty title="HOLDER DATA UNAVAILABLE" hint={`No holder data available for this token via ${source || 'on-chain APIs'}.`} />;

  return (
    <div style={{ padding: 10 }}>
      <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.06em' }}>
        SOURCE: {source} · {holders.length} HOLDERS INDEXED
      </div>
      <HolderConcentration holders={holders} />
      <div style={{ marginTop: 12 }}>
        <table className="trade-table">
          <thead>
            <tr>
              <th style={{ fontSize: 7, color: 'var(--text-muted)', padding: '3px 6px', textAlign: 'left' }}>#</th>
              <th style={{ fontSize: 7, color: 'var(--text-muted)', padding: '3px 6px', textAlign: 'left' }}>WALLET</th>
              <th style={{ fontSize: 7, color: 'var(--text-muted)', padding: '3px 6px', textAlign: 'right' }}>AMOUNT</th>
              <th style={{ fontSize: 7, color: 'var(--text-muted)', padding: '3px 6px', textAlign: 'right' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {holders.map(h => (
              <tr key={h.rank}>
                <td style={{ fontSize: 8, color: 'var(--text-dim)', padding: '2px 6px' }}>{h.rank}</td>
                <td style={{ fontSize: 8, color: 'var(--text)', padding: '2px 6px', fontFamily: 'monospace' }}>
                  {shortenAddress(h.address, 4)}
                  {h.label && <span style={{ marginLeft: 4, fontSize: 7, color: 'var(--cyan)', fontWeight: 700 }}>{h.label}</span>}
                </td>
                <td style={{ fontSize: 8, color: 'var(--text)', padding: '2px 6px', textAlign: 'right' }}>{formatNum(h.amount)}</td>
                <td style={{ fontSize: 8, color: h.pctSupply > 5 ? 'var(--amber)' : 'var(--text)', padding: '2px 6px', textAlign: 'right' }}>
                  {h.pctSupply.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TokenDataPanel(p: Props) {
  const chain = CHAINS[p.chainId];
  const t = p.token;

  switch (p.tab) {
    case 'trade':
      return <TradeList rows={p.trades} chainId={p.chainId} freshness={p.tradeFreshness} />;

    case 'liquidity':
      return (
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {t ? <LiquidityPanel token={t} /> : <Empty title="DATA UNAVAILABLE" hint="No liquidity data for this market." />}
          <div>
            <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>BUY / SELL PRESSURE</div>
            <BuySellPressure buys={t?.buys24h ?? null} sells={t?.sells24h ?? null} />
          </div>
        </div>
      );

    case 'orders': {
      const open = p.myTrades.filter(x => x.status === 'pending');
      return p.myTradesLoaded && open.length === 0
        ? <Empty title="NO OPEN ORDERS" hint="Orders you submit on this token appear here until they confirm." />
        : <MyTradesTable trades={open} />;
    }

    case 'activity':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 10px' }}>
            <Row label="FEED" value={p.tradeFreshness} tone={p.tradeFreshness === 'LIVE' ? 'var(--green)' : 'var(--amber, #FFD700)'} />
            <Row label="EVENTS" value={String(p.trades.length)} />
            <Row label="24H BUYS" value={t?.buys24h != null ? formatNum(t.buys24h) : 'N/A'} tone="var(--green)" />
            <Row label="24H SELLS" value={t?.sells24h != null ? formatNum(t.sells24h) : 'N/A'} tone="var(--red)" />
          </div>
          <TradeList rows={p.trades.slice(0, 20)} chainId={p.chainId} freshness={p.tradeFreshness}
            emptyLabel="NO ACTIVITY EVENTS" emptyHint="Indexed activity for this token will appear here as it arrives." />
        </div>
      );

    case 'markets':
      return (
        <div style={{ padding: 10 }}>
          <Row label="PRICE SOURCE" value={p.priceSource} />
          <Row label="PAIR" value={t?.pairAddress ? shortenAddress(t.pairAddress, 6) : 'N/A'} />
          <Row label="DEX" value={t?.dexId ? t.dexId.toUpperCase() : 'N/A'} />
          <Row label="LIQUIDITY" value={t?.liquidity != null ? formatUsd(t.liquidity) : 'N/A'} />
          <Row label="VOLUME 24H" value={t?.volume24h != null ? formatUsd(t.volume24h) : 'N/A'} />
          <Row label="TXNS 24H" value={t?.txns24h != null ? formatNum(t.txns24h) : 'N/A'} />
          <Row label="MCAP / FDV" value={`${t?.marketCap != null ? formatUsd(t.marketCap) : 'N/A'} / ${t?.fdv != null ? formatUsd(t.fdv) : 'N/A'}`} />
          {t?.url && (
            <div style={{ marginTop: 8 }}>
              <a href={t.url} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 8 }}>VIEW ON EXPLORER ↗</a>
            </div>
          )}
        </div>
      );

    case 'detail':
      return (
        <div style={{ padding: 10 }}>
          {t ? <ContractPanel token={t} chainId={p.chainId} /> : <Empty title="CONTRACT DATA UNAVAILABLE" hint="No on-chain contract is bound to this view." />}
          {p.majorAssetId && <Row label="CANONICAL ID" value={p.majorAssetId} tone="var(--cyan, #0088FF)" />}
          {p.routeLabel && <Row label="EXEC ROUTE" value={`${p.routeLabel}${p.routeAddress ? ` · ${shortenAddress(p.routeAddress, 4)}` : ''}`} tone="var(--green)" />}
          {t?.websites && t.websites.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {t.websites.map((w, i) => (
                <a key={i} href={w} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 7 }}>WEBSITE ↗</a>
              ))}
            </div>
          )}
          {t?.socials && t.socials.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {t.socials.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 7 }}>{s.type.toUpperCase()} ↗</a>
              ))}
            </div>
          )}
        </div>
      );

    case 'history':
      return p.myTradesLoaded && p.myTrades.length === 0
        ? <Empty title="NO TRADE HISTORY" hint={p.walletAddress ? 'Your confirmed trades on this token will appear here.' : 'Connect a wallet to see your trade history on this token.'} />
        : <MyTradesTable trades={p.myTrades} />;

    case 'holders':
      return <HoldersPanel chainId={p.chainId} address={t?.address || p.tokenAddress} />;

    case 'risk':
      return p.safety ? (
        <div style={{ padding: 10 }}>
          <RiskPanel safety={p.safety} chainId={p.chainId} />
        </div>
      ) : (
        <Empty title="RISK CHECKS UNAVAILABLE" hint="Live contract safety checks could not run for this asset. No score is shown rather than an invented one." />
      );

    case 'info':
    default:
      return (
        <div style={{ padding: 10 }}>
          <Row label="NETWORK" value={chain.name} />
          <Row label="PLATFORM FEE" value={`${(PLATFORM_FEE_BPS / 100).toFixed(2)}% (${PLATFORM_FEE_BPS} BPS)`} />
          <Row label="PRICE SOURCE" value={p.priceSource} />
          <Row label="CHART SOURCE" value={p.candleSource} />
          {p.routeAddress && (
            <Row label="EXEC CONTRACT" value={p.routeAddress} />
          )}
          <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.7 }}>
            All statistics come from live Cupcak8 Swap data services and chain indexers.
            Execution requires a valid quote, a verified route,
            a connected wallet on {chain.name}, and explicit confirmation.
            {p.majorAssetId && ' Reference prices are not proof of a tradable pair.'}
          </div>
          {p.routeAddress && (
            <div style={{ marginTop: 8 }}>
              <a href={explorerAddressUrl(p.chainId, p.routeAddress)} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 8 }}>
                VIEW CONTRACT ON {chain.explorerName.toUpperCase()} ↗
              </a>
            </div>
          )}
        </div>
      );
  }
}
