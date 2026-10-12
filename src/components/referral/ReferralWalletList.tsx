import { useState, useEffect } from 'react';
import { shortenAddress, formatUsd } from '../../lib/config';
import { getReferredWallets, type ReferredWallet } from '../../lib/referral';

interface Props {
  walletAddress: string;
}

export default function ReferralWalletList({ walletAddress }: Props) {
  const [wallets, setWallets] = useState<ReferredWallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReferredWallets(walletAddress).then(w => { setWallets(w); setLoading(false); }).catch(() => setLoading(false));
  }, [walletAddress]);

  if (loading) return <div style={{ padding: 16, fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>LOADING...</div>;

  if (wallets.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
        NO REFERRALS YET
        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 4 }}>
          Share your referral link to start earning
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr><th>WALLET</th><th>JOINED</th><th>LAST ACTIVE</th><th className="right">30D VOL</th><th>STATUS</th></tr>
        </thead>
        <tbody>
          {wallets.map((w, i) => (
            <tr key={i}>
              <td style={{ fontSize: 9, fontFamily: 'var(--font)' }}>{shortenAddress(w.wallet, 5)}</td>
              <td style={{ fontSize: 9 }}>{new Date(w.firstSeen).toLocaleDateString()}</td>
              <td style={{ fontSize: 9 }}>{new Date(w.lastActivity).toLocaleDateString()}</td>
              <td className="right" style={{ fontSize: 9, fontWeight: 700 }}>{formatUsd(w.volume30d)}</td>
              <td>
                <span style={{
                  fontSize: 7, fontWeight: 700, padding: '1px 4px',
                  border: `1px solid ${w.status === 'active' ? 'var(--lime-dim)' : 'var(--text-dim)'}`,
                  color: w.status === 'active' ? 'var(--lime-dim)' : 'var(--text-dim)',
                }}>{w.status.toUpperCase()}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}