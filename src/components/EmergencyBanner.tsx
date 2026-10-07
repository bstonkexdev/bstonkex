import { useState, useEffect } from 'react';
import { gitlawb } from '../lib/gitlawb';

interface PauseConfig {
  tradingPaused: boolean;
  message: string;
  chains: string[];
  since: string;
}

export default function EmergencyBanner() {
  const [pause, setPause] = useState<PauseConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const col = gitlawb.db.collection<PauseConfig>('emergency_config');
        const { records } = await col.list({ limit: 1 });
        if (records.length > 0 && records[0].data.tradingPaused) {
          setPause(records[0].data);
          setDismissed(false);
        } else {
          setPause(null);
        }
      } catch { /* ignore */ }
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, []);

  if (!pause || dismissed) return null;

  return (
    <div style={{
      background: 'var(--red-bg, rgba(255,48,96,0.12))',
      borderBottom: '1px solid var(--red)',
      padding: '6px 12px',
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 9, fontWeight: 700, color: 'var(--red)',
      letterSpacing: '0.05em',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: 'var(--red)',
        animation: 'blink 1s ease-in-out infinite', flexShrink: 0,
      }} />
      <span style={{ flex: 1 }}>
        TRADING TEMPORARILY UNAVAILABLE
        {pause.message && ` — ${pause.message}`}
        {pause.chains.length > 0 && ` (${pause.chains.join(', ')})`}
      </span>
      <button style={{
        background: 'none', border: '1px solid var(--red)', color: 'var(--red)',
        cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 7, padding: '1px 6px',
      }} onClick={() => setDismissed(true)}>
        DISMISS
      </button>
    </div>
  );
}