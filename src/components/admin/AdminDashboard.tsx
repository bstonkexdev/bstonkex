// Cupcak8 Swap Admin Dashboard — overview with referral system stats
import { useState, useEffect } from 'react';
import type { WalletState } from '../../lib/wallet';
import { checkAllCollections, type CollectionHealth } from '../../lib/admin/permission-checker';
import { getAuditLog, type AuditEntry } from '../../lib/admin/admin-audit';

interface Props {
  wallet: WalletState;
}

export default function AdminDashboard({ wallet }: Props) {
  const [collections, setCollections] = useState<CollectionHealth[]>([]);
  const [recentAudit, setRecentAudit] = useState<(AuditEntry & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [cols, audit] = await Promise.all([
        checkAllCollections(),
        getAuditLog(5),
      ]);
      setCollections(cols);
      setRecentAudit(audit);
      setLoading(false);
    }
    load();
  }, []);

  const accessible = collections.filter(c => c.accessible).length;
  const total = collections.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Quick Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8,
      }}>
        <StatCard label="Collections" value={`${accessible}/${total}`} color="var(--cyan)" />
        <StatCard label="Admin Wallet" value={wallet.address?.slice(0, 8) + '...' || 'N/A'} color="var(--lime)" />
        <StatCard label="Audit Entries" value={String(recentAudit.length)} color="var(--amber)" />
      </div>

      {/* Collection Status */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px', background: 'var(--bg-elevated)',
          fontSize: 8, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.06em',
          borderBottom: '1px solid var(--border)',
        }}>
          COLLECTION STATUS
        </div>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)' }}>
            Loading...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {collections.map(col => (
              <div key={col.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderBottom: '1px solid var(--border)',
                fontSize: 8, gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: col.accessible ? 'var(--green)' : 'var(--red)',
                  }} />
                  <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{col.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 6, padding: '2px 6px', borderRadius: 2,
                    background: 'var(--bg)', color: 'var(--text-dim)',
                    border: '1px solid var(--border)',
                  }}>
                    {col.requiredVisibility}
                  </span>
                  <span style={{ color: col.accessible ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                    {col.accessible ? 'OK' : 'ERR'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Audit */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px', background: 'var(--bg-elevated)',
          fontSize: 8, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.06em',
          borderBottom: '1px solid var(--border)',
        }}>
          RECENT ACTIONS
        </div>
        {recentAudit.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)' }}>
            No admin actions recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentAudit.map(entry => (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 7,
              }}>
                <span style={{ color: 'var(--text-bright)', fontWeight: 600 }}>{entry.collection}</span>
                <span style={{ color: 'var(--text-dim)' }}>{entry.action}</span>
                <span style={{
                  color: entry.outcome.includes('Success') ? 'var(--green)' : 'var(--amber)',
                  fontWeight: 700,
                }}>
                  {entry.outcome}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: 10, borderRadius: 6,
      border: '1px solid var(--border)', background: 'var(--bg)',
    }}>
      <div style={{ fontSize: 6, color: 'var(--text-dim)', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}