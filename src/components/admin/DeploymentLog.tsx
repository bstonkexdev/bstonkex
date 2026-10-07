// BSTONKEX Admin Deployment Log — shows deployment history and current status
import { getDeployments, getCurrentDeployment, statusColor, statusIcon, formatTimestamp, formatDuration, type DeploymentRecord, type DeployStatus } from '../../lib/engine/deploy-log';

export default function DeploymentLogPanel() {
  const current = getCurrentDeployment();
  const history = getDeployments();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
        DEPLOYMENT LOG
      </span>

      {/* Current deployment */}
      {current && (
        <div style={{
          padding: 8, borderRadius: 4, border: `1px solid ${statusColor(current.status)}`,
          background: `${statusColor(current.status)}08`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: statusColor(current.status), fontSize: 10 }}>{statusIcon(current.status)}</span>
            <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-bright)' }}>
              DEPLOYING: {current.version}
            </span>
            <StatusBadge status={current.status} />
          </div>
          <DeployDetails record={current} />
        </div>
      )}

      {/* History */}
      {history.length === 0 ? (
        <div style={{ fontSize: 8, color: 'var(--text-muted)', padding: 8, textAlign: 'center' }}>
          No deployments recorded
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {history.slice(0, 10).map(record => (
            <div key={record.id} style={{
              padding: 6, borderRadius: 3, border: '1px solid var(--border)',
              background: 'var(--bg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: statusColor(record.status), fontSize: 9 }}>{statusIcon(record.status)}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-bright)' }}>{record.version}</span>
                <StatusBadge status={record.status} />
                <span style={{ marginLeft: 'auto', fontSize: 7, color: 'var(--text-muted)' }}>
                  {formatTimestamp(record.timestamp)}
                </span>
              </div>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 2 }}>
                {record.services.join(', ')}
                {record.duration && ` · ${formatDuration(record.duration)}`}
                {record.txHash && ` · TX: ${record.txHash.slice(0, 10)}...`}
              </div>
              {record.error && (
                <div style={{ fontSize: 7, color: 'var(--red)', marginTop: 2 }}>Error: {record.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: DeployStatus }) {
  return (
    <span style={{
      fontSize: 6, fontWeight: 900, padding: '1px 4px', borderRadius: 2,
      color: statusColor(status), background: `${statusColor(status)}15`,
      letterSpacing: '0.05em',
    }}>
      {status}
    </span>
  );
}

function DeployDetails({ record }: { record: DeploymentRecord }) {
  return (
    <div style={{ fontSize: 7, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div>ID: {record.deploymentId}</div>
      <div>Network: {record.network}</div>
      <div>Admin: {record.adminWallet.slice(0, 10)}...</div>
      <div>Services: {record.services.join(', ')}</div>
      {record.txHash && <div>TX: {record.txHash}</div>}
      {record.gasUsed && <div>Gas: {record.gasUsed}</div>}
    </div>
  );
}