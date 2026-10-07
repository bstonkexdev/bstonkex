import { formatUsd, explorerTxUrl, shortenAddress } from '../../lib/config';
import type { ClaimRecord } from '../../lib/referral';

interface Props {
  claims: ClaimRecord[];
}

export default function ClaimHistory({ claims }: Props) {
  if (claims.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
        NO CLAIM HISTORY
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr><th>DATE</th><th className="right">AMOUNT</th><th>ASSET</th><th>STATUS</th><th>TX</th></tr>
        </thead>
        <tbody>
          {claims.map((c, i) => (
            <tr key={i}>
              <td style={{ fontSize: 9 }}>{new Date(c.date).toLocaleDateString()}</td>
              <td className="right" style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)' }}>{formatUsd(c.amount)}</td>
              <td style={{ fontSize: 9 }}>{c.asset}</td>
              <td>
                <span style={{
                  fontSize: 7, fontWeight: 700, padding: '1px 4px',
                  border: `1px solid ${c.status === 'confirmed' ? 'var(--green)' : c.status === 'pending' ? 'var(--amber)' : 'var(--red)'}`,
                  color: c.status === 'confirmed' ? 'var(--green)' : c.status === 'pending' ? 'var(--amber)' : 'var(--red)',
                }}>{c.status.toUpperCase()}</span>
              </td>
              <td>
                {c.txHash ? (
                  <a href={explorerTxUrl('bsc', c.txHash)} target="_blank" rel="noopener"
                    style={{ fontSize: 7, color: 'var(--cyan)' }}>{shortenAddress(c.txHash, 4)} ↗</a>
                ) : <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}