// Cupcak8 Swap Referral Permissions — approval page for collection visibility
import { useState, useEffect } from 'react';
import type { WalletState } from '../../lib/wallet';
import { checkAllCollections, getApprovalInstructions, type CollectionHealth } from '../../lib/admin/permission-checker';
import { logAdminAction } from '../../lib/admin/admin-audit';

interface Props {
  wallet: WalletState;
}

type ApprovalStatus = 'pending' | 'manual' | 'verified';

interface PermissionItem {
  name: string;
  requiredVisibility: string;
  description: string;
  securityNote: string;
  status: ApprovalStatus;
  instructions: string[];
}

const PERMISSION_ITEMS: Omit<PermissionItem, 'status' | 'instructions'>[] = [
  {
    name: 'ref_usernames',
    requiredVisibility: 'authenticated',
    description: 'Public username lookup table for referral links and availability checks. Contains only the username string — no wallet addresses.',
    securityNote: 'Low risk: only usernames are exposed. No private data stored in this collection.',
  },
  {
    name: 'ref_rewards',
    requiredVisibility: 'authenticated',
    description: 'Reward records for the referral dashboard. Signed-in users read all records; the dashboard filters by username client-side.',
    securityNote: 'Medium risk: all signed-in users can technically read all reward records. Client-side filtering prevents casual exposure. Only the original author (fee-engine) can edit records.',
  },
  {
    name: 'ref_volume',
    requiredVisibility: 'authenticated',
    description: 'Referral volume records for tier calculation. Signed-in users read all records; filtered client-side by username.',
    securityNote: 'Medium risk: same model as ref_rewards. Volume data is aggregate, not individual trade details.',
  },
];

export default function ReferralPermissions({ wallet }: Props) {
  const [collections, setCollections] = useState<CollectionHealth[]>([]);
  const [items, setItems] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedInstructions, setExpandedInstructions] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const cols = await checkAllCollections();
      setCollections(cols);

      const resolved = PERMISSION_ITEMS.map(item => {
        const col = cols.find(c => c.name === item.name);
        const isAccessible = col?.accessible ?? false;
        return {
          ...item,
          status: isAccessible ? 'verified' as ApprovalStatus : 'manual' as ApprovalStatus,
          instructions: getApprovalInstructions(item.name),
        };
      });
      setItems(resolved);
      setLoading(false);
    }
    load();
  }, []);

  async function handleApprove(item: PermissionItem) {
    // No Gitlawb permission API exists — show manual instructions
    setExpandedInstructions(expandedInstructions === item.name ? null : item.name);

    await logAdminAction({
      adminAddress: wallet.address || 'unknown',
      collection: item.name,
      action: `Viewed approval instructions for ${item.requiredVisibility} visibility`,
      outcome: 'Needs Manual Approval — no programmatic API available',
    });
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)' }}>
        Checking permissions...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{
        padding: '12px 0', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.06em', marginBottom: 4 }}>
          REFERRAL DATA PERMISSIONS
        </div>
        <div style={{ fontSize: 7, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          These collections require authenticated visibility for the referral dashboard to work for production users.
          Changes must be approved in the Gitlawb Data tab — no programmatic API is available.
        </div>
      </div>

      {/* Permission Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => {
          const col = collections.find(c => c.name === item.name);
          return (
            <div key={item.name} style={{
              border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
            }}>
              {/* Card Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px',
                background: item.status === 'verified' ? 'var(--lime-bg)' : 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: item.status === 'verified' ? 'var(--green)' : 'var(--amber)',
                  }} />
                  <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.04em' }}>
                    {item.name}
                  </span>
                </div>
                <StatusBadge status={item.status} />
              </div>

              {/* Card Body */}
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 7, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  {item.description}
                </div>

                {/* Permission Info */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
                  padding: 8, borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)',
                  fontSize: 7,
                }}>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Current: </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>
                      {col?.accessible ? 'accessible' : 'restricted'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Required: </span>
                    <span style={{ fontWeight: 700, color: 'var(--lime)' }}>{item.requiredVisibility}</span>
                  </div>
                </div>

                {/* Security Note */}
                <div style={{
                  fontSize: 6, color: 'var(--amber)', lineHeight: 1.5,
                  padding: '6px 8px', borderRadius: 3,
                  background: 'var(--lime-bg)', border: '1px solid var(--yellow-bg)',
                }}>
                  ⚠ {item.securityNote}
                </div>

                {/* Action Button */}
                <button
                  onClick={() => handleApprove(item)}
                  style={{
                    padding: '6px 12px', border: 'none', borderRadius: 3,
                    fontSize: 7, fontWeight: 900, letterSpacing: '0.04em',
                    cursor: 'pointer',
                    background: item.status === 'verified' ? 'var(--green)' : 'var(--lime)',
                    color: '#000',
                    opacity: item.status === 'verified' ? 0.7 : 1,
                  }}
                >
                  {item.status === 'verified' ? '✓ VERIFIED' : 'APPROVE PERMISSION'}
                </button>

                {/* Expanded Instructions */}
                {expandedInstructions === item.name && item.status === 'manual' && (
                  <div style={{
                    padding: 10, borderRadius: 4,
                    background: 'var(--cyan-bg)', border: '1px solid var(--cyan-bg)',
                    fontSize: 7, color: 'var(--text-dim)', lineHeight: 1.8,
                  }}>
                    <div style={{ fontWeight: 900, color: 'var(--cyan)', marginBottom: 6, fontSize: 8 }}>
                      MANUAL APPROVAL REQUIRED
                    </div>
                    {item.instructions.map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6 }}>
                        <span style={{ color: 'var(--cyan)', fontWeight: 700, minWidth: 12 }}>{i + 1}.</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const config = {
    pending: { label: 'PENDING', color: 'var(--amber)', bg: 'var(--lime-bg)' },
    manual: { label: 'NEEDS MANUAL', color: 'var(--amber)', bg: 'var(--lime-bg)' },
    verified: { label: 'APPROVED', color: 'var(--green)', bg: 'var(--lime-bg)' },
  }[status];

  return (
    <span style={{
      fontSize: 6, fontWeight: 900, padding: '2px 6px', borderRadius: 2,
      background: config.bg, color: config.color, letterSpacing: '0.04em',
    }}>
      {config.label}
    </span>
  );
}