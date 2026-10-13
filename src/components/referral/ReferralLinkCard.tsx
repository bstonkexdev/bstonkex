// Cupcak8 Swap — Referral Link Card with copy and share
import { useState } from 'react';
import { getReferralLink } from '../../lib/referral';

interface Props {
  username: string;
}

export default function ReferralLinkCard({ username }: Props) {
  const [copied, setCopied] = useState(false);
  const link = getReferralLink(username);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const shareLink = () => {
    if (navigator.share) {
      navigator.share({ title: 'Cupcak8 Swap Referral', url: link }).catch(() => {});
    }
  };

  return (
    <div className="ref-card">
      <div className="ref-card-header">REFERRAL LINK</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="ref-stat-label" style={{ whiteSpace: 'nowrap' }}>USERNAME</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#E8547C' }}>@{username}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="ref-link-display">
          {link}
        </div>
        <button className="btn btn-sm btn-pink" onClick={copyLink}>{copied ? 'COPIED!' : 'COPY'}</button>
        {typeof navigator.share === 'function' && <button className="btn btn-sm" onClick={shareLink}>SHARE</button>}
      </div>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 8 }}>
        Share this link — you earn a share of Cupcak8 Swap platform fees from every trader you refer.
      </div>
    </div>
  );
}