// BSTONKEX Infrastructure Dashboard — Real-time status of all production components
import { useState, useEffect } from 'react';
import { getComponents, getInfraStats, onInfraChange, statusColor, statusLabel, type InfraComponent, type ComponentStatus } from '../../lib/engine/infra-state';
import { executeDeployAction } from '../../lib/engine/deploy-actions';
import ComponentCard from './ComponentCard';

type FilterCat = 'all' | 'core' | 'chain' | 'backend' | 'data' | 'credential' | 'security';

export default function InfraDashboard() {
  const [components, setComponents] = useState<InfraComponent[]>(getComponents());
  const [filter, setFilter] = useState<FilterCat>('all');
  const [actionResults, setActionResults] = useState<Record<string, { success: boolean; detail: string }>>({});

  useEffect(() => onInfraChange(setComponents), []);

  const stats = getInfraStats();
  const filtered = filter === 'all' ? components : components.filter(c => c.category === filter);

  async function handleAction(componentId: string, action: string) {
    setActionResults(prev => ({ ...prev, [action]: { success: false, detail: 'Running...' } }));
    const result = await executeDeployAction(action);
    setActionResults(prev => ({ ...prev, [action]: result }));
  }

  const cats: { id: FilterCat; label: string; count: number }[] = [
    { id: 'all', label: 'ALL', count: components.length },
    { id: 'chain', label: 'CHAINS', count: components.filter(c => c.category === 'chain').length },
    { id: 'backend', label: 'BACKEND', count: components.filter(c => c.category === 'backend').length },
    { id: 'data', label: 'DATA', count: components.filter(c => c.category === 'data').length },
    { id: 'credential', label: 'CREDS', count: components.filter(c => c.category === 'credential').length },
    { id: 'core', label: 'CORE', count: components.filter(c => c.category === 'core').length },
    { id: 'security', label: 'SECURITY', count: components.filter(c => c.category === 'security').length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stats Bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6,
        padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
      }}>
        <StatBox label="VERIFIED" value={stats.verified} color="var(--green)" />
        <StatBox label="DEPLOYED" value={stats.deployed} color="#00cc88" />
        <StatBox label="READY" value={stats.ready} color="var(--cyan)" />
        <StatBox label="BLOCKED" value={stats.blocked} color="var(--amber)" />
        <StatBox label="EXTERNAL" value={stats.external} color="#aa66ff" />
        <StatBox label="FAILED" value={stats.failed} color="var(--red)" />
        <StatBox label="NOT BUILT" value={stats.notBuilt} color="var(--text-dim)" />
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {cats.map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{
            padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: filter === c.id ? 'var(--cyan)' : 'var(--bg)', color: filter === c.id ? '#000' : 'var(--text-muted)',
            fontSize: 7, fontWeight: 900, letterSpacing: '0.05em',
          }}>
            {c.label} ({c.count})
          </button>
        ))}
      </div>

      {/* Component Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(comp => (
          <ComponentCard
            key={comp.id}
            component={comp}
            actionResult={actionResults[comp.deployAction || comp.verifyAction || '']}
            onDeploy={comp.deployAction ? () => handleAction(comp.id, comp.deployAction!) : undefined}
            onVerify={comp.verifyAction ? () => handleAction(comp.id, comp.verifyAction!) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '6px 4px' }}>
      <div style={{ fontSize: 16, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 6, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2, letterSpacing: '0.1em' }}>{label}</div>
    </div>
  );
}