// Cupcak8 Swap System Health — read-only health panel for referral collections
import { useState, useEffect } from 'react';
import { checkAllCollections, type CollectionHealth } from '../../lib/admin/permission-checker';

export default function SystemHealth() {
  const [collections, setCollections] = useState<CollectionHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<string>('');

  async function runHealthCheck() {
    setLoading(true);
    const cols = await checkAllCollections();
    setCollections(cols);
    setLastCheck(new Date().toISOString());
    setLoading(false);
  }

  useEffect(() => { runHealthCheck(); }, []);

  const healthy = collections.filter(c => c.accessible).length;
  const total = collections.length;
  const allHealthy = healthy === total;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 0', borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.06em', marginBottom: 4 }}>
            SYSTEM HEALTH
          </div>
          <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>
            Read-only probes of all referral collections. Checks accessibility from the current client.
          </div>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={loading}
          style={{
            padding: '6px 12px', border: '1px solid var(--lime)', borderRadius: 3,
            background: 'transparent', color: 'var(--lime)',
            fontSize: 7, fontWeight: 900, cursor: 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'CHECKING...' : 'REFRESH'}
        </button>
      </div>

      {/* Overall Status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: 10,
        borderRadius: 6, border: '1px solid var(--border)',
        background: allHealthy ? 'var(--lime-bg)' : 'var(--red-bg)',
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: allHealthy ? 'var(--green)' : 'var(--red)',
        }} />
        <div>
          <div style={{ fontSize: 9, fontWeight: 900, color: allHealthy ? 'var(--green)' : 'var(--red)' }}>
            {allHealthy ? 'ALL SYSTEMS OPERATIONAL' : `${total - healthy} ISSUE${total - healthy > 1 ? 'S' : ''} DETECTED`}
          </div>
          {lastCheck && (
            <div style={{ fontSize: 6, color: 'var(--text-dim)', marginTop: 2 }}>
              Last checked: {new Date(lastCheck).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Collection Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {collections.map(col => (
          <div key={col.name} style={{
            border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px',
              background: col.accessible ? 'var(--lime-bg)' : 'var(--red-bg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: col.accessible ? 'var(--green)' : 'var(--red)',
                }} />
                <span style={{ fontSize: 8, fontWeight: 900, color: 'var(--text-bright)' }}>{col.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 6, padding: '2px 5px', borderRadius: 2,
                  background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-dim)',
                }}>
                  {col.requiredVisibility}
                </span>
                <span style={{
                  fontSize: 7, fontWeight: 900,
                  color: col.accessible ? 'var(--green)' : 'var(--red)',
                }}>
                  {col.accessible ? 'OK' : 'FAIL'}
                </span>
              </div>
            </div>
            <div style={{ padding: '6px 12px', fontSize: 6, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              {col.reason}
              {col.error && (
                <div style={{ color: 'var(--red)', marginTop: 2 }}>Error: {col.error}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div style={{
        padding: 10, borderRadius: 4,
        background: 'var(--cyan-bg)', border: '1px solid var(--cyan-bg)',
        fontSize: 6, color: 'var(--text-dim)', lineHeight: 1.7,
      }}>
        <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>NOTE:</span> Health checks run from the current client context.
        In preview, the caller is the builder and can access all collections. In production, accessibility depends on
        collection visibility settings and the signed-in user's permissions. A collection showing "OK" in preview
        may behave differently for production users if visibility has not been approved.
      </div>
    </div>
  );
}