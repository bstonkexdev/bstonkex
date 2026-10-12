// Cupcak8 Swap — Wallet authentication gate
import { useState } from 'react';
import { fetchNonce, verifySignatureAndLogin } from '../../lib/reward-api';
import MascotLogo from '../MascotLogo';

interface Props {
  onAuthSuccess: () => void;
}

export default function AuthGate({ onAuthSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        setError('No wallet detected. Install MetaMask or another EVM wallet.');
        return;
      }
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];
      if (!walletAddress) {
        setError('No wallet account returned.');
        return;
      }

      const { nonce, message } = await fetchNonce(walletAddress);
      const signature: string = await eth.request({
        method: 'personal_sign',
        params: [message, walletAddress],
      });

      await verifySignatureAndLogin(walletAddress, nonce, signature);
      onAuthSuccess();
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 12, padding: '32px 24px', textAlign: 'center',
    }}>
      <MascotLogo size={40} color="#E8547C" />
      <div style={{
        fontSize: 14, fontWeight: 900, color: '#E8547C',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        Connect Wallet to View Rewards
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 360, lineHeight: 1.6 }}>
        Sign a message with your wallet to securely access your referral and cashback dashboard.
        No transaction or gas required.
      </div>
      <button
        onClick={handleSignIn}
        disabled={loading}
        style={{
          padding: '12px 32px', background: loading ? 'rgba(232,84,124,0.5)' : '#E8547C',
          border: 'none', borderRadius: 'var(--radius-sm)',
          color: '#fff', fontSize: 13, fontWeight: 800,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'SIGNING...' : 'SIGN IN WITH WALLET'}
      </button>
      {error && (
        <div style={{
          padding: '10px 16px', background: 'var(--red-bg)',
          border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)',
          color: 'var(--red)', fontSize: 11, maxWidth: 400,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}