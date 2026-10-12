import { formatUsd, explorerTxUrl, shortenAddress } from '../../lib/config';
import type { ClaimRecord } from '../../lib/referral';

interface Props {
  claims: ClaimRecord[];
}

export default function ClaimHistory({ claims }: Props) {
  if (claims.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
        NO CLAIM HISTORY
        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 4 }}>
          Claims will appear here once you claim rewards
        </div>
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
              <td className="right" style={{ fontSize: 9, fontWeight: 700, color: 'var(--lime-dim)' }}>{formatUsd(c.amount)}</td>
              <td style={{ fontSize: 9 }}>{c.asset}</td>
              <td>
                <span style={{
                  fontSize: 7, fontWeight: 700, padding: '1px 4px',
                  border: `1px solid ${c.status === 'confirmed' ? 'var(--lime-dim)' : c.status === 'pending' ? 'var(--yellow)' : 'var(--red)'}`,
                  color: c.status === 'confirmed' ? 'var(--lime-dim)' : c.status === 'pending' ? 'var(--yellow-dim)' : 'var(--red)',
                }}>{c.status.toUpperCase()}</span>
              </td>
              <td>
                {c.txHash ? (
                  <a href={explorerTxUrl('bsc', c.txHash)} target="_blank" rel="noopener"
                    style={{ fontSize: 7, color: '#E8547C' }}>{shortenAddress(c.txHash, 4)} ↗</a>
                ) : <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}