// BSTONKEX Reusable 8-bit UI primitives

/** Animated pixel loading bar */
export function PixelLoader({ text }: { text?: string }) {
  return (
    <div className="pixel-loader">
      <div className="pixel-loader-bar">
        {[0,1,2,3,4].map(i => <span key={i} className="active" />)}
      </div>
      {text || 'LOADING'}
    </div>
  );
}

/** Retro progress bar with fill blocks */
export function PixelProgress({ value, max = 100, width = 120 }: { value: number; max?: number; width?: number }) {
  const blocks = 12;
  const filled = Math.round((value / max) * blocks);
  return (
    <div style={{ display: 'flex', gap: 1, width, alignItems: 'flex-end' }}>
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: 8,
          background: i < filled ? 'var(--cyan)' : 'var(--border)',
          boxShadow: i < filled ? '0 0 3px rgba(0,204,255,0.3)' : 'none',
          transition: 'background 0.2s',
        }} />
      ))}
    </div>
  );
}

/** Toast notification */
export function PixelToast({ message, type = 'info', onClose }: {
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  onClose?: () => void;
}) {
  const colors = {
    info: { border: 'var(--cyan)', bg: 'var(--cyan-bg)', text: 'var(--cyan)' },
    success: { border: 'var(--green)', bg: 'var(--green-bg)', text: 'var(--green)' },
    error: { border: 'var(--red)', bg: 'var(--red-bg)', text: 'var(--red)' },
    warning: { border: 'var(--amber)', bg: 'rgba(255,170,0,0.06)', text: 'var(--amber)' },
  }[type];
  return (
    <div style={{
      position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, padding: '6px 16px', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      border: `2px solid ${colors.border}`, background: colors.bg, color: colors.text,
      boxShadow: `0 0 20px ${colors.border}33`,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {message}
      {onClose && (
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: colors.text,
          cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 10,
        }}>[X]</button>
      )}
    </div>
  );
}

/** Status indicator row */
export function StatusLed({ label, status }: { label: string; status: 'online' | 'degraded' | 'offline' }) {
  const ledClass = status === 'online' ? 'led-green' : status === 'degraded' ? 'led-amber' : 'led-red';
  return (
    <div className="status-row">
      <span className={`led-sm ${ledClass} ${status === 'degraded' ? 'led-blink' : ''}`} />
      {label}
    </div>
  );
}

/** Pixel border decorative corners */
export function PixelCorners({ children, color = 'var(--border)' }: { children: React.ReactNode; color?: string }) {
  const corner = (pos: React.CSSProperties) => (
    <div style={{ position: 'absolute', width: 6, height: 6, ...pos, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', width: 2, height: 6, background: color }} />
      <div style={{ position: 'absolute', width: 6, height: 2, background: color }} />
    </div>
  );
  return (
    <div style={{ position: 'relative', padding: 4 }}>
      {corner({ top: 0, left: 0 })}
      {corner({ top: 0, right: 0, transform: 'scaleX(-1)' })}
      {corner({ bottom: 0, left: 0, transform: 'scaleY(-1)' })}
      {corner({ bottom: 0, right: 0, transform: 'scale(-1)' })}
      {children}
    </div>
  );
}

/** Decorative horizontal pixel divider */
export function PixelDivider({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {label && <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}