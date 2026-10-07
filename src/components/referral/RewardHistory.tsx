import { shortenAddress, formatUsd } from '../../lib/config';
import type { ReferralRecord } from '../../lib/referral';

interface Props {
  history: ReferralRecord[];
}

export default function RewardHistory({ history }: Props) {
  if (history.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
        NO REFERRAL REWARDS YET
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>DATE</th>
            <th>WALLET</th>
            <th>TRADE</th>
            <th className="right">VALUE</th>
            <th className="right">FEE</th>
            <th className="right">REWARD</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {history.slice(0, 50).map((r, i) => (
            <tr key={i}>
              <td style={{ fontSize: 9 }}>{new Date(r.date).toLocaleDateString()}</td>
              <td style={{ fontSize: 9, fontFamily: 'var(--font)' }}>{shortenAddress(r.wallet, 4)}</td>
              <td style={{ fontSize: 9 }}>TRADE</td>
              <td className="right" style={{ fontSize: 9 }}>{formatUsd(r.tradeVolume)}</td>
              <td className="right" style={{ fontSize: 9 }}>{formatUsd(r.feeGenerated)}</td>
              <td className="right" style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)' }}>{formatUsd(r.reward)}</td>
              <td>
                <span style={{
                  fontSize: 7, fontWeight: 700, padding: '1px 4px',
                  border: `1px solid ${r.status === 'claimed' ? 'var(--green)' : 'var(--amber)'}`,
                  color: r.status === 'claimed' ? 'var(--green)' : 'var(--amber)',
                }}>{r.status.toUpperCase()}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}