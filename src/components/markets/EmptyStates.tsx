interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'LOADING MARKET DATA...' }: LoadingStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      gap: 8,
    }}>
      <div style={{
        width: 16, height: 16,
        border: '2px solid var(--border)',
        borderTopColor: 'var(--cyan)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-dim)',
        letterSpacing: '0.1em',
      }}>
        {message}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, subtitle, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      gap: 8,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-dim)',
        letterSpacing: '0.08em',
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 8,
          color: 'var(--text-muted)',
          textAlign: 'center',
          maxWidth: 280,
        }}>
          {subtitle}
        </div>
      )}
      {action && (
        <button
          className="btn btn-sm btn-cyan"
          style={{ fontSize: 8, padding: '3px 10px', marginTop: 4 }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      gap: 8,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--red)',
        letterSpacing: '0.08em',
      }}>
        {message}
      </div>
      {onRetry && (
        <button
          className="btn btn-sm"
          style={{ fontSize: 8, padding: '3px 10px', marginTop: 4 }}
          onClick={onRetry}
        >
          RETRY
        </button>
      )}
    </div>
  );
}