// Cupcak8 Swap Admin Nav — admin-only navigation entry
import { isAdminWallet } from '../../lib/engine/admin-auth';

interface Props {
  walletAddress: string | null;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function AdminNav({ walletAddress, currentPage, onNavigate }: Props) {
  // Only render for authorized admin wallets
  if (!walletAddress || !isAdminWallet(walletAddress)) {
    return null;
  }

  const isActive = currentPage === 'admin';

  return (
    <button
      onClick={() => onNavigate('admin')}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px', border: 'none', borderRadius: 3,
        background: isActive ? 'var(--lime)' : 'transparent',
        color: isActive ? '#000' : 'var(--text-dim)',
        fontSize: 7, fontWeight: 900, letterSpacing: '0.06em',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 9 }}>◈</span>
      ADMIN
    </button>
  );
}