// BSTONKEX Deploy Workflow — One-click deploy all with step-by-step progress
import { useState } from 'react';
import { deployAll, type DeployStep } from '../../lib/engine/deploy-actions';

export default function DeployWorkflow() {
  const [steps, setSteps] = useState<DeployStep[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  async function handleDeployAll() {
    setRunning(true);
    setDone(false);
    const result = await deployAll();
    setSteps(result);
    setRunning(false);
    setDone(true);
  }

  const successCount = steps.filter(s => s.status === 'success').length;
  const failCount = steps.filter(s => s.status === 'failure').length;
  const skipCount = steps.filter(s => s.status === 'skipped').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
        🚀 ONE-CLICK DEPLOY ALL
      </div>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Runs all available deployment and verification actions in sequence.
        Components requiring external deployment will be skipped with instructions.
      </div>

      <button
        onClick={handleDeployAll}
        disabled={running}
        style={{
          padding: '10px 16px', borderRadius: 6,
          border: '2px solid var(--cyan)', background: running ? 'var(--border)' : 'rgba(0,221,255,0.15)',
          color: running ? 'var(--text-muted)' : 'var(--cyan)',
          fontSize: 10, fontWeight: 900, cursor: running ? 'default' : 'pointer',
          letterSpacing: '0.1em', textAlign: 'center',
        }}
      >
        {running ? '◌ DEPLOYING...' : '▶ DEPLOY ALL READY COMPONENTS'}
      </button>

      {/* Step Progress */}
      {steps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map((step, i) => {
            const icon = step.status === 'success' ? '✓' : step.status === 'failure' ? '✗' : step.status === 'running' ? '◌' : step.status === 'skipped' ? '⊘' : '○';
            const color = step.status === 'success' ? 'var(--green)' : step.status === 'failure' ? 'var(--red)' : step.status === 'running' ? 'var(--amber)' : 'var(--text-muted)';

            return (
              <div key={step.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px',
                borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)',
              }}>
                <span style={{ fontSize: 10, color, fontWeight: 900, flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 8, fontWeight: 900, color: 'var(--text-bright)' }}>{step.label}</div>
                  {step.result && (
                    <div style={{ fontSize: 7, color, lineHeight: 1.4, marginTop: 2 }}>{step.result}</div>
                  )}
                </div>
                <span style={{
                  fontSize: 6, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                  background: `${color}22`, color, whiteSpace: 'nowrap',
                }}>
                  {step.status.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {done && (
        <div style={{
          padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>
            DEPLOYMENT SUMMARY
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 8 }}>
            <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ {successCount} succeeded</span>
            {failCount > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>✗ {failCount} failed</span>}
            {skipCount > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>⊘ {skipCount} skipped</span>}
          </div>
          {failCount > 0 && (
            <div style={{ fontSize: 7, color: 'var(--amber)', lineHeight: 1.5, marginTop: 4 }}>
              Failed components may require credentials or external deployment. Check individual component details above.
            </div>
          )}
        </div>
      )}
    </div>
  );
}