import type { SortField, SortDir } from '../../lib/market-discovery';

interface Props {
  field: SortField;
  label: string;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  align?: 'right';
  width?: number;
}

export default function SortHeader({ field, label, currentField, currentDir, onSort, align, width }: Props) {
  const active = currentField === field;
  return (
    <th
      className={align === 'right' ? 'right' : ''}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...(width ? { width } : {}),
      }}
      onClick={() => onSort(field)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {label}
        {active && (
          <span style={{
            fontSize: 7,
            color: 'var(--cyan)',
            lineHeight: 1,
          }}>
            {currentDir === 'desc' ? '▾' : '▴'}
          </span>
        )}
      </span>
    </th>
  );
}