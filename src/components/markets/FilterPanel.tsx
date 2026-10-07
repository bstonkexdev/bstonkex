import type { MarketFilters } from '../../lib/market-discovery';
import { DEFAULT_FILTERS } from '../../lib/market-discovery';

interface Props {
  filters: MarketFilters;
  onChange: (filters: MarketFilters) => void;
  onReset: () => void;
}

interface Preset {
  label: string;
  min: number;
  max: number;
}

const LIQ_PRESETS: Preset[] = [
  { label: 'Any', min: 0, max: Infinity },
  { label: '>$10K', min: 10_000, max: Infinity },
  { label: '>$50K', min: 50_000, max: Infinity },
  { label: '>$100K', min: 100_000, max: Infinity },
  { label: '>$1M', min: 1_000_000, max: Infinity },
];

const VOL_PRESETS: Preset[] = [
  { label: 'Any', min: 0, max: Infinity },
  { label: '>$10K', min: 10_000, max: Infinity },
  { label: '>$50K', min: 50_000, max: Infinity },
  { label: '>$1M', min: 1_000_000, max: Infinity },
];

const MCAP_PRESETS: Preset[] = [
  { label: 'Any', min: 0, max: Infinity },
  { label: '>$100K', min: 100_000, max: Infinity },
  { label: '>$1M', min: 1_000_000, max: Infinity },
  { label: '>$10M', min: 10_000_000, max: Infinity },
  { label: '>$100M', min: 100_000_000, max: Infinity },
];

const AGE_PRESETS: { label: string; maxAge: number }[] = [
  { label: 'Any', maxAge: 0 },
  { label: '<1h', maxAge: 3_600_000 },
  { label: '<6h', maxAge: 21_600_000 },
  { label: '<24h', maxAge: 86_400_000 },
  { label: '<7d', maxAge: 604_800_000 },
];

export default function FilterPanel({ filters, onChange, onReset }: Props) {
  const isActive = filters.minLiquidity > 0 || filters.minVolume > 0 ||
    filters.minMarketCap > 0 || filters.maxAge > 0;

  return (
    <div style={{
      padding: '8px 16px',
      borderBottom: 'var(--pixel) solid var(--border)',
      background: 'var(--bg-panel)',
      display: 'flex', gap: 16, flexWrap: 'wrap',
      fontSize: 8,
      flexShrink: 0,
    }}>
      {/* Market Cap */}
      <FilterGroup
        label="MARKET CAP"
        options={MCAP_PRESETS.map(p => ({
          label: p.label,
          active: filters.minMarketCap === p.min,
        }))}
        onSelect={i => {
          const p = MCAP_PRESETS[i];
          onChange({ ...filters, minMarketCap: p.min, maxMarketCap: p.max });
        }}
      />

      {/* Liquidity */}
      <FilterGroup
        label="LIQUIDITY"
        options={LIQ_PRESETS.map(p => ({
          label: p.label,
          active: filters.minLiquidity === p.min,
        }))}
        onSelect={i => {
          const p = LIQ_PRESETS[i];
          onChange({ ...filters, minLiquidity: p.min, maxLiquidity: p.max });
        }}
      />

      {/* Volume */}
      <FilterGroup
        label="24H VOLUME"
        options={VOL_PRESETS.map(p => ({
          label: p.label,
          active: filters.minVolume === p.min,
        }))}
        onSelect={i => {
          const p = VOL_PRESETS[i];
          onChange({ ...filters, minVolume: p.min, maxVolume: p.max });
        }}
      />

      {/* Age */}
      <FilterGroup
        label="AGE"
        options={AGE_PRESETS.map(p => ({
          label: p.label,
          active: filters.maxAge === p.maxAge,
        }))}
        onSelect={i => {
          const p = AGE_PRESETS[i];
          onChange({ ...filters, maxAge: p.maxAge });
        }}
      />

      {/* Reset */}
      {isActive && (
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            className="btn btn-sm"
            style={{ fontSize: 7, padding: '2px 6px' }}
            onClick={onReset}
          >
            RESET ALL
          </button>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, options, onSelect }: {
  label: string;
  options: { label: string; active: boolean }[];
  onSelect: (index: number) => void;
}) {
  return (
    <div>
      <div style={{
        fontWeight: 700, color: 'var(--text-dim)',
        marginBottom: 3, fontSize: 7,
        letterSpacing: '0.06em',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {options.map((opt, i) => (
          <button
            key={opt.label}
            className={`btn btn-sm ${opt.active ? 'btn-cyan' : ''}`}
            style={{ fontSize: 7, padding: '2px 5px' }}
            onClick={() => onSelect(i)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}