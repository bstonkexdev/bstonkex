// Cupcak8 Swap — Compact trade rows (time / side / price / amount / USD / wallet / tx).
// Rows are real feed events; aggregate-derived rows are explicitly labelled.
import type { ChainId } from '../../lib/config';
import { formatUsd, formatPrice, shortenAddress, explorerTxUrl } from '../../lib/config';
import { clockTime, NA, type TokenTradeRow } from '../../lib/token-page-data';

interface Props {
  rows: TokenTradeRow[];
  chainId: ChainId;
  freshness: string;
  loading?: boolean;
  emptyLabel?: string;
  emptyHint?: string;
}

export default function TradeList({ rows, chainId, freshness, loading, emptyLabel, emptyHint }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, padding: '4px 10px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 7, fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>TRADE FEED</span>
        <span style={{
          fontSize: 7, fontWeight: 800, padding: '1px 4px',
          border: `1px solid ${freshness === 'LIVE' ? 'var(--green)' : 'var(--amber, #FFD700)'}`,
          color: freshness === 'LIVE' ? 'var(--green)' : 'var(--amber, #FFD700)',
        }}>{freshness}</span>
        <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>
          {rows.length} {rows.length === 1 ? 'trade' : 'trades'}
        </span>
      </div>

      {loading && (
        <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>LOADING TRADES…</div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            {emptyLabel || 'NO INDEXED TRADES'}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.6 }}>
            {emptyHint || 'Trade data unavailable for this market right now. Nothing is simulated.'}
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="panel-scroll">
          <table className="trade-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>SIDE</th>
                <th className="right">PRICE</th>
                <th className="right">AMOUNT</th>
                <th className="right">USD</th>
                <th>WALLET</th>
                <th>TX</th>
                <th>SRC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const buy = r.side === 'buy';
                return (
                  <tr key={r.id}>
                    <td className="text-dim">{clockTime(r.time)}</td>
                    <td>
                      <span style={{
                        fontSize: 7, fontWeight: 800, padding: '1px 4px',
                        border: `1px solid ${buy ? 'var(--green)' : 'var(--red)'}`,
                        color: buy ? 'var(--green)' : 'var(--red)',
                      }}>
                        {r.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="right">{r.priceUsd != null ? formatPrice(r.priceUsd) : NA}</td>
                    <td className="right">{r.tokenAmount > 0 ? r.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 }) : NA}</td>
                    <td className="right" style={{ color: buy ? 'var(--green)' : 'var(--red)' }}>{formatUsd(r.amountUsd)}</td>
                    <td className="text-dim" title={r.wallet}>
                      {r.wallet && r.wallet !== 'NOT INDEXED' ? shortenAddress(r.wallet, 3) : 'NOT INDEXED'}
                    </td>
                    <td>
                      {r.txHash ? (
                        <a href={explorerTxUrl(chainId, r.txHash)} target="_blank" rel="noopener" style={{ fontSize: 8 }}>
                          {shortenAddress(r.txHash, 3)} ↗
                        </a>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td>
                      <span title={r.source === 'indexed'
                        ? 'Real indexed / Cupcak8 Swap-executed trade'
                        : 'Derived from real 24h pair statistics — not an individual fill'}
                        style={{ fontSize: 7, fontWeight: 700, color: r.source === 'indexed' ? 'var(--cyan, #0088FF)' : 'var(--text-muted)' }}>
                        {r.source === 'indexed' ? 'IDX' : 'AGG'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
